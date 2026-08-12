import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import {
  recordTransfer,
  recordDeposit,
  recordAdjustment,
  recordRefund,
  getBalanceCents,
  reconcileBalance,
  LedgerError,
} from "./ledger";
import { lockAccountsForUpdate, assertCanDebit } from "./balanceGuard";
import { withLedgerAdmin } from "./admin";

/**
 * Phase 3 — ledger hardening. Concurrency, idempotency, balance truth,
 * atomicity, corrections, and the DB-level append-only guard. DB-backed;
 * skipped when no dev database is reachable.
 */
const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[hardening.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await withLedgerAdmin(prisma, (tx) =>
      tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }),
    );
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

interface Accounts {
  aStudentId: string;
  bStudentId: string;
  aAccountId: string;
  bAccountId: string;
}

async function freshAccounts(seed = { a: 5000, b: 2000 }): Promise<Accounts> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "S", code: `T${Math.random().toString(36).slice(2, 6)}` },
  });
  async function make(num: string, balance: number) {
    const student = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        studentNumber: num,
        firstName: "K",
        lastName: num,
        grade: "3",
        account: { create: { balanceCents: balance } },
      },
    });
    const account = await prisma.account.findUniqueOrThrow({ where: { studentId: student.id } });
    if (balance !== 0) {
      await prisma.ledgerEntry.create({
        data: { accountId: account.id, type: "DEPOSIT", amountCents: balance, description: "opening", actorType: "SYSTEM" },
      });
    }
    return { studentId: student.id, accountId: account.id };
  }
  const a = await make(`A-${crypto.randomUUID()}`, seed.a);
  const b = await make(`B-${crypto.randomUUID()}`, seed.b);
  return { aStudentId: a.studentId, bStudentId: b.studentId, aAccountId: a.accountId, bAccountId: b.accountId };
}

const admin = { actorType: "USER" as const, actorId: "admin-1" };
const guardian = { actorType: "GUARDIAN" as const, actorId: "g-1" };

describe.skipIf(!dbUp)("concurrency (the carried finding)", () => {
  it("two concurrent full-balance transfers → one success, one INSUFFICIENT_FUNDS, never negative", async () => {
    const acc = await freshAccounts({ a: 5000, b: 0 });
    const doTransfer = () =>
      recordTransfer({ fromStudentId: acc.aStudentId, toStudentId: acc.bStudentId, amountCents: 5000, actor: guardian });

    const results = await Promise.allSettled([doTransfer(), doTransfer()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(LedgerError);
    expect(((rejected[0] as PromiseRejectedResult).reason as LedgerError).code).toBe("INSUFFICIENT_FUNDS");

    const balance = await getBalanceCents(acc.aAccountId);
    expect(balance).toBe(0);
    expect(balance).toBeGreaterThanOrEqual(0);
    const debits = await prisma.ledgerEntry.count({ where: { accountId: acc.aAccountId, type: "TRANSFER_DEBIT" } });
    expect(debits).toBe(1);
  });
});

describe.skipIf(!dbUp)("transfer idempotency", () => {
  it("sequential replay with the same key → one transfer, balances moved once", async () => {
    const acc = await freshAccounts({ a: 5000, b: 0 });
    const key = `xfr:${crypto.randomUUID()}`;
    const first = await recordTransfer({ fromStudentId: acc.aStudentId, toStudentId: acc.bStudentId, amountCents: 1000, actor: guardian, idempotencyKey: key });
    const replay = await recordTransfer({ fromStudentId: acc.aStudentId, toStudentId: acc.bStudentId, amountCents: 1000, actor: guardian, idempotencyKey: key });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.transferRef).toBe(first.transferRef);
    expect(await getBalanceCents(acc.aAccountId)).toBe(4000);
    expect(await getBalanceCents(acc.bAccountId)).toBe(1000);
    const debits = await prisma.ledgerEntry.count({ where: { idempotencyKey: key } });
    expect(debits).toBe(1);
  });
});

describe.skipIf(!dbUp)("balance = sum of entries", () => {
  it("getBalanceCents equals the ledger sum across a mixed history", async () => {
    const acc = await freshAccounts({ a: 3000, b: 0 });
    await recordDeposit({ studentId: acc.aStudentId, amountCents: 1500, idempotencyKey: `k-${crypto.randomUUID()}`, actor: admin });
    await recordAdjustment({ accountId: acc.aAccountId, amountCents: -250, reason: "test", actor: admin });
    await recordTransfer({ fromStudentId: acc.aStudentId, toStudentId: acc.bStudentId, amountCents: 500, actor: guardian });

    const derived = await getBalanceCents(acc.aAccountId); // 3000 + 1500 - 250 - 500
    expect(derived).toBe(3750);
    const recon = await reconcileBalance(acc.aAccountId);
    expect(recon.ok).toBe(true);
    expect(recon.derivedCents).toBe(3750);
  });
});

describe.skipIf(!dbUp)("transfer atomicity", () => {
  it("a failed transfer writes nothing (all-or-nothing)", async () => {
    const acc = await freshAccounts({ a: 5000, b: 0 });
    // Destination student has no account → the transfer throws before committing.
    const orphan = await prisma.student.create({
      data: {
        districtId: districtIds[districtIds.length - 1]!,
        schoolId: (await prisma.account.findUniqueOrThrow({ where: { id: acc.aAccountId }, select: { student: { select: { schoolId: true } } } })).student.schoolId,
        studentNumber: `ORPHAN-${crypto.randomUUID()}`,
        firstName: "No",
        lastName: "Acct",
        grade: "3",
      },
    });
    await expect(
      recordTransfer({ fromStudentId: acc.aStudentId, toStudentId: orphan.id, amountCents: 100, actor: guardian }),
    ).rejects.toBeInstanceOf(LedgerError);

    expect(await getBalanceCents(acc.aAccountId)).toBe(5000);
    const debits = await prisma.ledgerEntry.count({ where: { accountId: acc.aAccountId, type: "TRANSFER_DEBIT" } });
    expect(debits).toBe(0);
  });
});

describe.skipIf(!dbUp)("adjustments and refunds", () => {
  it("adjustment adds an offsetting entry and never mutates the original", async () => {
    const acc = await freshAccounts({ a: 3000, b: 0 });
    const original = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId: acc.aAccountId, type: "DEPOSIT" } });
    const before = original.amountCents;

    const adj = await recordAdjustment({ originalEntryId: original.id, amountCents: -500, reason: "keying error", actor: admin });
    expect(adj.type).toBe("ADJUSTMENT");
    expect(adj.correctsEntryId).toBe(original.id);

    const originalAfter = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: original.id } });
    expect(originalAfter.amountCents).toBe(before); // untouched
    expect(await getBalanceCents(acc.aAccountId)).toBe(2500);
  });

  it("refund reverses the original amount, linked to it", async () => {
    const acc = await freshAccounts({ a: 0, b: 2000 });
    const dep = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId: acc.bAccountId, type: "DEPOSIT" } });
    const refund = await recordRefund({ originalEntryId: dep.id, reason: "duplicate deposit", actor: admin });
    expect(refund.type).toBe("REFUND");
    expect(refund.amountCents).toBe(-dep.amountCents);
    expect(refund.correctsEntryId).toBe(dep.id);
    expect(await getBalanceCents(acc.bAccountId)).toBe(0);
  });

  it("requires a reason", async () => {
    const acc = await freshAccounts({ a: 1000, b: 0 });
    await expect(
      recordAdjustment({ accountId: acc.aAccountId, amountCents: -100, reason: "  ", actor: admin }),
    ).rejects.toBeInstanceOf(LedgerError);
  });
});

describe.skipIf(!dbUp)("a-la-carte precheck helper (assertCanDebit)", () => {
  it("throws INSUFFICIENT_FUNDS when a debit would overdraw", async () => {
    const acc = await freshAccounts({ a: 300, b: 0 });
    await expect(
      prisma.$transaction(async (tx) => {
        await lockAccountsForUpdate(tx, [acc.aAccountId]);
        await assertCanDebit(tx, acc.aAccountId, 999999);
      }),
    ).rejects.toBeInstanceOf(LedgerError);
  });

  it("returns the balance when the debit fits", async () => {
    const acc = await freshAccounts({ a: 300, b: 0 });
    const bal = await prisma.$transaction(async (tx) => {
      await lockAccountsForUpdate(tx, [acc.aAccountId]);
      return assertCanDebit(tx, acc.aAccountId, 100);
    });
    expect(bal).toBe(300);
  });
});

describe.skipIf(!dbUp)("append-only enforcement (DB trigger)", () => {
  it("rejects UPDATE and DELETE on a ledger entry", async () => {
    const acc = await freshAccounts({ a: 1000, b: 0 });
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId: acc.aAccountId } });
    await expect(
      prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amountCents: 999999 } }),
    ).rejects.toThrow();
    await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
    // The entry survived both attempts.
    const still = await prisma.ledgerEntry.findUnique({ where: { id: entry.id } });
    expect(still?.amountCents).toBe(1000);
  });
});
