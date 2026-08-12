-- Append-only enforcement for LedgerEntry (CLAUDE.md rule 2).
-- Rejects UPDATE/DELETE at the database level. A transaction-local flag
-- (app.allow_ledger_admin='on') is the ONLY escape, used by seed/test teardown
-- via server/ledger/admin.ts withLedgerAdmin(). Normal app code and manual SQL
-- cannot mutate or delete ledger rows.

CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_ledger_admin', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'LedgerEntry is append-only (CLAUDE.md rule 2): % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON "LedgerEntry";
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

DROP TRIGGER IF EXISTS ledger_no_delete ON "LedgerEntry";
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
