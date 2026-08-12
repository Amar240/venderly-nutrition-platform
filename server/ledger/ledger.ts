import { prisma } from "@/server/db/client";
import { Prisma, type ActorType, type LedgerEntry } from "@prisma/client";
import { writeAudit } from "@/server/audit/log";
import { lockAccountsForUpdate, assertCanDebit } from "./balanceGuard";

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

/**
 * The single source of truth for an account balance (phase-3 name). Derived
 * from ledger entries; the cached Account.balanceCents is only an optimization.
 */
export const getBalanceCents = deriveBalanceCents;

export interface BalanceReconciliation {
  cachedCents: number;
  derivedCents: number;
  ok: boolean;
}

/** Compare the cached balance to the derived truth. Used by tests/admin checks. */
export async function reconcileBalance(
  accountId: string,
  db: Tx = prisma,
): Promise<BalanceReconciliation> {
  const [account, derivedCents] = await Promise.all([
    db.account.findUniqueOrThrow({ where: { id: accountId }, select: { balanceCents: true } }),
    deriveBalanceCents(accountId, db),
  ]);
  return {
    cachedCents: account.balanceCents,
    derivedCents,
    ok: account.balanceCents === derivedCents,
  };
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
    public code:
      | "NO_ACCOUNT"
      | "INSUFFICIENT_FUNDS"
      | "INVALID_AMOUNT"
      | "SAME_ACCOUNT"
      | "ENTRY_NOT_FOUND"
      | "REASON_REQUIRED",
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
  /**
   * Optional idempotency key (namespaced, e.g. `xfr:<token>`) stored on the
   * DEBIT entry. A replay with the same key returns the existing transfer as a
   * success instead of moving money again — a double-submitted form is a no-op.
   */
  idempotencyKey?: string;
}

export interface TransferResult {
  transferRef: string;
  debit: LedgerEntry;
  credit: LedgerEntry;
  /** True when this call matched an existing transfer (idempotent replay). */
  replayed: boolean;
}

/** Rebuild a TransferResult from an existing debit (idempotent replay path). */
async function transferResultFromDebit(db: Tx, debit: LedgerEntry): Promise<TransferResult> {
  const credit = await db.ledgerEntry.findFirstOrThrow({
    where: { transferRef: debit.transferRef, type: "TRANSFER_CREDIT" },
  });
  return { transferRef: debit.transferRef!, debit, credit, replayed: true };
}

/**
 * Move money between two accounts as one linked debit + credit sharing a single
 * transferRef, in ONE transaction. The source account is locked FOR UPDATE
 * before the balance is derived, so concurrent transfers from the same account
 * serialize and cannot overdraw it. Optionally idempotent on `idempotencyKey`.
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

  const attempt = () =>
    db.$transaction(async (tx) => {
      // Fast replay path: the key already produced a transfer.
      if (input.idempotencyKey) {
        const existing = await tx.ledgerEntry.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return transferResultFromDebit(tx, existing);
      }

      const source = await accountForStudent(input.fromStudentId, tx);
      const dest = await accountForStudent(input.toStudentId, tx);

      // Lock both rows (sorted, deadlock-safe) BEFORE deriving the balance.
      await lockAccountsForUpdate(tx, [source.id, dest.id]);
      await assertCanDebit(tx, source.id, input.amountCents);

      const transferRef = `xfr_${crypto.randomUUID()}`;
      const debit = await tx.ledgerEntry.create({
        data: {
          accountId: source.id,
          type: "TRANSFER_DEBIT",
          amountCents: -input.amountCents,
          description: "Transfer to sibling",
          transferRef,
          idempotencyKey: input.idempotencyKey ?? null, // key on the debit only
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
      return { transferRef, debit, credit, replayed: false };
    });

  try {
    return await attempt();
  } catch (err) {
    // Concurrent replay that lost the unique-key race: return the winner's row.
    if (
      input.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await db.ledgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return transferResultFromDebit(db, existing);
    }
    throw err;
  }
}

export interface RecordAdjustmentInput {
  /** Target account, or omit and pass originalEntryId to derive it. */
  accountId?: string;
  /** The entry being corrected — links the new row via correctsEntryId. */
  originalEntryId?: string;
  amountCents: number; // signed
  reason: string;
  actor: LedgerActor; // admin (USER); RBAC is enforced by the caller (phase 5)
  districtId?: string | null;
}

/**
 * Admin adjustment — a NEW signed entry that offsets/corrects, linked to the
 * original entry id, with a mandatory reason. Never mutates the original
 * (append-only). Writes an AuditLog. RBAC (district admin+) is enforced at the
 * call site, not here.
 */
export async function recordAdjustment(
  input: RecordAdjustmentInput,
  db: typeof prisma = prisma,
): Promise<LedgerEntry> {
  if (!input.reason?.trim()) {
    throw new LedgerError("REASON_REQUIRED", "An adjustment requires a reason");
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    throw new LedgerError("INVALID_AMOUNT", "Adjustment must be a non-zero integer of cents");
  }

  const { entry, accountId } = await db.$transaction(async (tx) => {
    let accountId = input.accountId ?? null;
    let correctsEntryId: string | null = input.originalEntryId ?? null;
    if (input.originalEntryId) {
      const original = await tx.ledgerEntry.findUnique({ where: { id: input.originalEntryId } });
      if (!original) throw new LedgerError("ENTRY_NOT_FOUND", "Original entry not found");
      accountId = original.accountId;
      correctsEntryId = original.id;
    }
    if (!accountId) throw new LedgerError("NO_ACCOUNT", "No target account for adjustment");
    const entry = await tx.ledgerEntry.create({
      data: {
        accountId,
        type: "ADJUSTMENT",
        amountCents: input.amountCents,
        description: `Adjustment: ${input.reason}`,
        correctsEntryId,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId ?? null,
      },
    });
    await syncCachedBalance(accountId, tx);
    return { entry, accountId };
  });

  await writeAudit({
    actorType: input.actor.actorType,
    actorId: input.actor.actorId ?? null,
    action: "LEDGER_ADJUSTMENT",
    subjectType: "account",
    subjectId: accountId,
    districtId: input.districtId ?? null,
    reason: input.reason,
    after: { entryId: entry.id, amountCents: input.amountCents, correctsEntryId: entry.correctsEntryId },
  });
  return entry;
}

export interface RecordRefundInput {
  originalEntryId: string;
  reason: string;
  actor: LedgerActor;
  districtId?: string | null;
}

/**
 * Admin refund — a NEW entry reversing the original (negated amount), linked via
 * correctsEntryId, with a mandatory reason. Never mutates the original. Audited.
 */
export async function recordRefund(
  input: RecordRefundInput,
  db: typeof prisma = prisma,
): Promise<LedgerEntry> {
  if (!input.reason?.trim()) {
    throw new LedgerError("REASON_REQUIRED", "A refund requires a reason");
  }
  const { entry, accountId } = await db.$transaction(async (tx) => {
    const original = await tx.ledgerEntry.findUnique({ where: { id: input.originalEntryId } });
    if (!original) throw new LedgerError("ENTRY_NOT_FOUND", "Original entry not found");
    const entry = await tx.ledgerEntry.create({
      data: {
        accountId: original.accountId,
        type: "REFUND",
        amountCents: -original.amountCents,
        description: `Refund: ${input.reason}`,
        correctsEntryId: original.id,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId ?? null,
      },
    });
    await syncCachedBalance(original.accountId, tx);
    return { entry, accountId: original.accountId };
  });

  await writeAudit({
    actorType: input.actor.actorType,
    actorId: input.actor.actorId ?? null,
    action: "LEDGER_REFUND",
    subjectType: "account",
    subjectId: accountId,
    districtId: input.districtId ?? null,
    reason: input.reason,
    after: { entryId: entry.id, refundsEntryId: input.originalEntryId, amountCents: entry.amountCents },
  });
  return entry;
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
