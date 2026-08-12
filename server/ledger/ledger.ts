import { prisma } from "@/server/db/client";
import { Prisma, type ActorType, type LedgerEntry } from "@prisma/client";

/**
 * The append-only ledger — the ONLY writer of LedgerEntry outside the seed.
 *
 * Invariants (CLAUDE.md rules 1–4):
 *  - Money is integer cents; amounts are signed (credit +, debit −).
 *  - Entries are never updated or deleted. Corrections are new rows.
 *  - Balance is DERIVED from the ledger; Account.balanceCents is a cache kept
 *    in step inside the same transaction as every write.
 *  - Deposits carry an idempotencyKey; a replayed event never double-credits.
 *  - A transfer is a linked debit + credit sharing one transferRef, written in
 *    a single transaction.
 */

export interface LedgerActor {
  actorType: ActorType;
  actorId?: string | null;
}

/** Prisma transaction client (or the base client). */
type Tx = Prisma.TransactionClient | typeof prisma;

/** Sum every ledger entry for an account — the authoritative balance. */
export async function deriveBalanceCents(
  accountId: string,
  db: Tx = prisma,
): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

async function accountForStudent(studentId: string, db: Tx) {
  const account = await db.account.findUnique({ where: { studentId } });
  if (!account) throw new LedgerError("NO_ACCOUNT", `No account for student ${studentId}`);
  return account;
}

/** Recompute the cached balance from the ledger and persist it. */
async function syncCachedBalance(accountId: string, db: Tx): Promise<number> {
  const balance = await deriveBalanceCents(accountId, db);
  await db.account.update({ where: { id: accountId }, data: { balanceCents: balance } });
  return balance;
}

export class LedgerError extends Error {
  constructor(
    public code: "NO_ACCOUNT" | "INSUFFICIENT_FUNDS" | "INVALID_AMOUNT" | "SAME_ACCOUNT",
    message: string,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export interface RecordDepositInput {
  studentId: string;
  amountCents: number;
  /** Stable key from the settled provider event — the double-credit guard. */
  idempotencyKey: string;
  actor: LedgerActor;
  description?: string;
}

/**
 * Credit a deposit. Idempotent on `idempotencyKey`: replaying the same key
 * returns the existing entry and changes no balance. Safe under concurrent
 * replays because the unique constraint is the real guard (P2002 → no-op).
 */
export async function recordDeposit(
  input: RecordDepositInput,
  db: Tx = prisma,
): Promise<LedgerEntry> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new LedgerError("INVALID_AMOUNT", "Deposit must be a positive integer of cents");
  }
  // Pre-check the key before inserting so a replay returns early instead of
  // aborting the surrounding transaction (Postgres kills a tx on a failed
  // insert). The unique constraint remains the real guard for concurrent races.
  const attempt = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing; // replay — no re-credit
    const account = await accountForStudent(input.studentId, tx);
    const entry = await tx.ledgerEntry.create({
      data: {
        accountId: account.id,
        type: "DEPOSIT",
        amountCents: input.amountCents,
        description: input.description ?? "Deposit (simulated)",
        idempotencyKey: input.idempotencyKey,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId ?? null,
      },
    });
    await syncCachedBalance(account.id, tx);
    return entry;
  };

  // Running inside a caller's transaction: attempt directly.
  if (!("$transaction" in db)) return attempt(db as Prisma.TransactionClient);

  // Standalone: open a transaction; if we lose a concurrent race the tx rolls
  // back cleanly and we return the row the winner wrote.
  try {
    return await db.$transaction((tx) => attempt(tx));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.ledgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export interface RecordTransferInput {
  fromStudentId: string;
  toStudentId: string;
  amountCents: number;
  actor: LedgerActor;
}

export interface TransferResult {
  transferRef: string;
  debit: LedgerEntry;
  credit: LedgerEntry;
}

/**
 * Move money between two accounts as one linked debit + credit sharing a single
 * transferRef, in ONE transaction. Rejects amounts over the live source balance
 * (derived from the ledger, not the cache) before writing anything.
 */
export async function recordTransfer(
  input: RecordTransferInput,
  db: typeof prisma = prisma,
): Promise<TransferResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new LedgerError("INVALID_AMOUNT", "Transfer must be a positive integer of cents");
  }
  if (input.fromStudentId === input.toStudentId) {
    throw new LedgerError("SAME_ACCOUNT", "Cannot transfer to the same student");
  }
  return db.$transaction(async (tx) => {
    const source = await accountForStudent(input.fromStudentId, tx);
    const dest = await accountForStudent(input.toStudentId, tx);

    const available = await deriveBalanceCents(source.id, tx);
    if (input.amountCents > available) {
      throw new LedgerError("INSUFFICIENT_FUNDS", "Transfer exceeds available balance");
    }

    const transferRef = `xfr_${crypto.randomUUID()}`;
    const debit = await tx.ledgerEntry.create({
      data: {
        accountId: source.id,
        type: "TRANSFER_DEBIT",
        amountCents: -input.amountCents,
        description: "Transfer to sibling",
        transferRef,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId ?? null,
      },
    });
    const credit = await tx.ledgerEntry.create({
      data: {
        accountId: dest.id,
        type: "TRANSFER_CREDIT",
        amountCents: input.amountCents,
        description: "Transfer from sibling",
        transferRef,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId ?? null,
      },
    });
    await syncCachedBalance(source.id, tx);
    await syncCachedBalance(dest.id, tx);
    return { transferRef, debit, credit };
  });
}

/** Chronological ledger history for a child's account. */
export async function getLedgerHistory(
  accountId: string,
  db: Tx = prisma,
): Promise<LedgerEntry[]> {
  return db.ledgerEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
  });
}
