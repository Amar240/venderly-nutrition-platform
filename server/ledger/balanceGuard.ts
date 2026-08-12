import type { Prisma } from "@prisma/client";
import { LedgerError, deriveBalanceCents } from "./ledger";

/**
 * Shared balance-guard primitives for any debit that must not overdraw an
 * account. BOTH the sibling transfer (server/ledger) and phase 4's a-la-carte
 * charge MUST use these — do not reimplement the check.
 *
 * The problem they solve: at Read Committed, deriving a balance and then writing
 * lets two concurrent debits both pass the check and overdraw. Locking the
 * account row FOR UPDATE first serializes debits per account.
 */

/**
 * Lock the given Account rows FOR UPDATE, in a stable (sorted, de-duplicated)
 * order so that a caller locking two accounts can never deadlock against a
 * caller locking them in the opposite order. Must run inside a transaction.
 */
export async function lockAccountsForUpdate(
  tx: Prisma.TransactionClient,
  accountIds: string[],
): Promise<void> {
  const ordered = [...new Set(accountIds)].sort();
  for (const id of ordered) {
    // The row lock is the point; the returned rows are ignored.
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE`;
  }
}

/**
 * Assert that debiting `debitCents` from an account (which the caller has ALREADY
 * locked via lockAccountsForUpdate) will not overdraw it. Returns the current
 * derived balance; throws LedgerError("INSUFFICIENT_FUNDS") otherwise.
 */
export async function assertCanDebit(
  tx: Prisma.TransactionClient,
  accountId: string,
  debitCents: number,
): Promise<number> {
  const balance = await deriveBalanceCents(accountId, tx);
  if (debitCents > balance) {
    throw new LedgerError("INSUFFICIENT_FUNDS", "Debit exceeds available balance");
  }
  return balance;
}
