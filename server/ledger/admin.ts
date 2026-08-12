import type { PrismaClient, Prisma } from "@prisma/client";

/**
 * Controlled escape hatch for the append-only LedgerEntry trigger. The trigger
 * rejects every UPDATE/DELETE on LedgerEntry unless a transaction-local flag is
 * set. ONLY seed reset and test teardown may use this — never app code. It sets
 * `app.allow_ledger_admin='on'` for the duration of one transaction so the
 * enclosed deletes are permitted.
 */
export async function withLedgerAdmin<T>(
  db: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.allow_ledger_admin = 'on'`);
    return fn(tx);
  });
}
