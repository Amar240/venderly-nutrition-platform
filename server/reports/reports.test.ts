import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { dailyMealCounts } from "./mealCounts";
import { monthlyDeposits } from "./deposits";
import { districtDashboard } from "./dashboard";
import { listTransactions, transactionsToCsv } from "./transactions";
import { searchAuditLog } from "@/server/audit/query";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { AuthError } from "@/server/auth/errors";
import { PROTOTYPE_BANNER_TEXT } from "@/lib/prototype";
import type { AppSession } from "@/server/auth/types";

/**
 * Phase 5b — reporting. D-10 (overrides separate), ledger-derived figures,
 * session scope, export permission + audit, super-admin-only audit viewer, and
 * no pricing tier anywhere.
 */
const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[reports.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.auditLog.deleteMany({ where: { districtId: id } });
    await prisma.mealEvent.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) => tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }));
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.user.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

function utcToday() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

interface Fixture {
  districtId: string;
  schoolAId: string;
  schoolBId: string;
  mealStudentId: string;
  superAdmin: AppSession;
  adminA: AppSession;
  guardian: AppSession;
}

async function fresh(): Promise<Fixture> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const schoolA = await prisma.school.create({ data: { districtId: district.id, name: "Alpha", code: `A${Math.random().toString(36).slice(2, 6)}` } });
  const schoolB = await prisma.school.create({ data: { districtId: district.id, name: "Beta", code: `B${Math.random().toString(36).slice(2, 6)}` } });
  await prisma.pricingConfig.create({ data: { districtId: district.id, schoolId: null, cepEnabled: true, lowBalanceThresholdCents: 1000 } });

  // Students with controlled DERIVED balances; cache set WRONG on purpose so the
  // dashboard is proven to use the ledger, not Account.balanceCents.
  async function mk(schoolId: string, num: string, cachedWrong: number, ledger: { type: string; amt: number }[]) {
    const s = await prisma.student.create({
      data: { districtId: district.id, schoolId, studentNumber: num, firstName: "Kid", lastName: num, grade: "3", account: { create: { balanceCents: cachedWrong } } },
    });
    const acc = await prisma.account.findUniqueOrThrow({ where: { studentId: s.id } });
    for (const e of ledger) {
      await prisma.ledgerEntry.create({ data: { accountId: acc.id, type: e.type as never, amountCents: e.amt, description: e.type, actorType: "SYSTEM" } });
    }
    return { id: s.id, accountId: acc.id };
  }
  const a1 = await mk(schoolA.id, `A1-${crypto.randomUUID()}`, 9999, [{ type: "DEPOSIT", amt: 5000 }]); // healthy
  await mk(schoolA.id, `A2-${crypto.randomUUID()}`, 9999, [{ type: "DEPOSIT", amt: 500 }]); // low (<1000)
  await mk(schoolA.id, `A3-${crypto.randomUUID()}`, 9999, [{ type: "DEPOSIT", amt: 1000 }, { type: "ADJUSTMENT", amt: -1200 }]); // negative (-200)
  await mk(schoolB.id, `B1-${crypto.randomUUID()}`, 0, [{ type: "DEPOSIT", amt: 3000 }]);

  // Meals for A1 today: one served (seq 0) + one override (seq 1).
  const today = utcToday();
  const cashier = await prisma.user.create({
    data: {
      email: `cashier-${crypto.randomUUID()}@test.invalid`,
      passwordHash: "test",
      firstName: "Casey",
      lastName: "Cashier",
      role: "CASHIER",
      districtId: district.id,
    },
  });
  await prisma.mealEvent.create({ data: { studentId: a1.id, schoolId: schoolA.id, serviceDate: today, mealType: "LUNCH", priceCents: 0, overrideSeq: 0 } });
  await prisma.mealEvent.create({ data: { studentId: a1.id, schoolId: schoolA.id, serviceDate: today, mealType: "LUNCH", priceCents: 0, overrideSeq: 1, overrideReason: "second meal authorized" } });
  await prisma.mealEvent.create({
    data: {
      studentId: a1.id,
      schoolId: schoolA.id,
      serviceDate: today,
      mealType: "BREAKFAST",
      priceCents: 0,
      reversedAt: new Date(),
      reversedByUserId: cashier.id,
    },
  });

  const staff = (role: "SUPER_ADMIN" | "DISTRICT_ADMIN", schoolIds: string[]): AppSession =>
    ({ principalType: "staff", userId: `u-${role}-${crypto.randomUUID()}`, role, districtId: district.id, schoolIds });

  return {
    districtId: district.id, schoolAId: schoolA.id, schoolBId: schoolB.id, mealStudentId: a1.id,
    superAdmin: staff("SUPER_ADMIN", []),
    adminA: staff("DISTRICT_ADMIN", [schoolA.id]),
    guardian: { principalType: "guardian", guardianId: `g-${crypto.randomUUID()}`, role: "GUARDIAN" },
  };
}

describe.skipIf(!dbUp)("daily meal counts (D-10)", () => {
  it("reports served (seq 0) as the headline and overrides SEPARATELY, never summed", async () => {
    const f = await fresh();
    const today = utcToday();
    const rows = await dailyMealCounts(f.superAdmin, { from: today, to: today });
    const alphaLunch = rows.find((r) => r.schoolName === "Alpha" && r.mealType === "LUNCH");
    expect(alphaLunch?.served).toBe(1);
    expect(alphaLunch?.overrides).toBe(1);
    // The two are distinct fields — nothing sums them into one number.
    expect(alphaLunch!.served + alphaLunch!.overrides).toBe(2);
    expect(rows.find((r) => r.schoolName === "Alpha" && r.mealType === "BREAKFAST")).toBeUndefined();
  });

  it("is scoped: a district admin for Alpha never sees Beta rows", async () => {
    const f = await fresh();
    const today = utcToday();
    const rows = await dailyMealCounts(f.adminA, { from: today, to: today });
    expect(rows.every((r) => r.schoolName === "Alpha")).toBe(true);
  });

  it("attributes historical meals to the serving school after a student transfers", async () => {
    const f = await fresh();
    await prisma.student.update({ where: { id: f.mealStudentId }, data: { schoolId: f.schoolBId } });
    const today = utcToday();
    const rows = await dailyMealCounts(f.superAdmin, { from: today, to: today });
    expect(rows.find((row) => row.schoolName === "Alpha" && row.mealType === "LUNCH")?.served).toBe(1);
    expect(rows.find((row) => row.schoolName === "Beta" && row.mealType === "LUNCH")).toBeUndefined();
  });
});

describe.skipIf(!dbUp)("monthly deposits (ledger-derived)", () => {
  it("sums deposits and refunds/adjustments by type from the ledger", async () => {
    const f = await fresh();
    const now = new Date();
    const rows = await monthlyDeposits(f.superAdmin, { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
    const alpha = rows.find((r) => r.schoolName === "Alpha")!;
    expect(alpha.depositsCents).toBe(6500); // 5000 + 500 + 1000
    expect(alpha.refundsAdjustmentsCents).toBe(-1200); // the A3 adjustment
    expect(alpha.totalCents).toBe(5300); // net of everything
  });
});

describe.skipIf(!dbUp)("district dashboard", () => {
  it("counts low/negative balances from DERIVED balances, not the cache", async () => {
    const f = await fresh();
    const dash = await districtDashboard(f.superAdmin);
    const alpha = dash.schools.find((s) => s.schoolName === "Alpha")!;
    expect(alpha.lowBalanceCount).toBe(1); // A2 (500 < 1000)
    expect(alpha.negativeBalanceCount).toBe(1); // A3 (-200), despite cache 9999
    expect(alpha.mealsServed).toBe(1); // excludes the override
    expect(alpha.mealOverrides).toBe(1);
  });
});

describe.skipIf(!dbUp)("transaction export", () => {
  it("is scoped and rejects an out-of-scope school", async () => {
    const f = await fresh();
    const rows = await listTransactions(f.adminA, {});
    expect(rows.every((r) => r.schoolName === "Alpha")).toBe(true);
    await expect(listTransactions(f.adminA, { schoolId: f.schoolBId })).rejects.toBeInstanceOf(AuthError);
    // No tier anywhere in the exported rows.
    expect(JSON.stringify(rows).toLowerCase()).not.toContain("tier");
  });

  it("produces a CSV with a prototype notice, header, escaped cells, and no tier data", async () => {
    const rows = [
      { createdAt: new Date("2026-08-12T12:00:00Z"), studentNumber: "100001", studentName: "Ella Whitfield", schoolName: "Alpha", type: "DEPOSIT", amountCents: 5000, description: '=Deposit, "simulated"' },
    ];
    const csv = transactionsToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(`"Prototype notice","${PROTOTYPE_BANNER_TEXT.replace(/"/g, '""')}"`);
    expect(lines[1]).toBe("");
    expect(lines[2]).toContain("Student number");
    expect(csv).toContain('"Payment"');
    expect(csv).not.toContain('"DEPOSIT"');
    expect(csv).toContain(`"'=Deposit, ""simulated"""`); // formula guard + quotes escaped
    expect(csv.toLowerCase()).not.toContain("tier");
    expect(csv.toLowerCase()).not.toContain("eligib");
  });
});

describe.skipIf(!dbUp)("audit viewer (super admin only)", () => {
  it("rejects a district admin and returns entries for a super admin", async () => {
    const f = await fresh();
    await prisma.auditLog.create({ data: { actorType: "USER", action: "TEST_EVENT", districtId: f.districtId, reason: "seed" } });
    await expect(searchAuditLog(f.adminA)).rejects.toBeInstanceOf(AuthError);
    await expect(searchAuditLog(f.guardian)).rejects.toBeInstanceOf(AuthError);
    const entries = await searchAuditLog(f.superAdmin);
    expect(entries.some((e) => e.action === "TEST_EVENT")).toBe(true);
  });
});
