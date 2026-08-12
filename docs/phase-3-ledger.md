# Phase 3 — Ledger hardening

## Goal
The financial core is provably correct. This phase is mostly `server/ledger/` logic + tests; UI is minimal.

## In scope
- Entry types: DEPOSIT, ITEM_SALE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT, REFUND — each with required metadata (reason for adjustments/refunds, transferRef for transfers, idempotencyKey for deposits/imports).
- Balance function: single source of truth `getBalanceCents(accountId)` derived from entries; optional cached balance column updated in the same transaction, with a reconciliation check.
- Adjustment/refund API (admin-only): creates offsetting entries linked to the original entry id; mandatory reason; writes AuditLog.
- Simulated payment-event endpoint: verifies a shared-secret signature on the fake event, enforces idempotency, creates exactly one credit.
- DB-level protection: Postgres trigger or Prisma middleware rejecting UPDATE/DELETE on LedgerEntry.

## Tests (the point of this phase)
- Balance = sum of entries across mixed histories.
- Transfer atomicity: failure between debit and credit rolls both back.
- Idempotency: same event id twice → one credit.
- Adjustment never mutates the original entry.
- Insufficient-balance denial for a-la-carte precheck helper.

## Acceptance criteria (from PRD)
- Every balance change is explainable from ledger history alone.
- History shows original and corrective activity side by side.

## Human verification
Run the test suite; in the DB, try a manual UPDATE on a ledger row and watch it fail; read one child's history and recompute the balance by hand.
