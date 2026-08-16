import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { dailyMealCounts } from "./mealCounts";
import { monthlyDeposits } from "./deposits";
import { districtDashboard } from "./dashboard";
import { editCheckCeiling, editCheckReport } from "./editCheck";
import {
  allocateCepClaimSplit,
  calculateCepFreeRateUnits,
  monthlyClaimFigures,
  resolveClaimMonth,
} from "./claimFigures";
import { arrearsReport, currentNegativeStreak } from "./arrears";
import { listTransactions, transactionsToCsv } from "./transactions";
import { getMoneyHistoryForAccount } from "@/server/ledger/moneyHistory";
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
const FNS_FEDERAL_DEFAULT_FACTOR_BPS = 9380;
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.auditLog.deleteMany({ where: { districtId: id } });
    await prisma.correctionCase.deleteMany({ where: { student: { districtId: id } } });
    await prisma.itemSale.deleteMany({ where: { student: { districtId: id } } });
    await prisma.mealEvent.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) => tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }));
    await prisma.item.deleteMany({ where: { districtId: id } });
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.user.deleteMany({ where: { districtId: id } });
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
  mealAccountId: string;
  cashierId: string;
  schoolAStudentIds: string[];
  superAdmin: AppSession;
  adminA: AppSession;
  schoolStaffA: AppSession;
  cashier: AppSession;
  guardian: AppSession;
}

async function fresh(): Promise<Fixture> {
  const district = await prisma.district.create({
    data: {
      name: `TEST-${crypto.randomUUID()}`,
      identifiedStudentPercentageBps: 5482,
      stateAttendanceFactorBps: FNS_FEDERAL_DEFAULT_FACTOR_BPS,
    },
  });
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
  const a2 = await mk(schoolA.id, `A2-${crypto.randomUUID()}`, 9999, [{ type: "DEPOSIT", amt: 500 }]); // low (<1000)
  const a3 = await mk(schoolA.id, `A3-${crypto.randomUUID()}`, 9999, [{ type: "DEPOSIT", amt: 1000 }, { type: "ADJUSTMENT", amt: -1200 }]); // negative (-200)
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

  const staff = (role: "SUPER_ADMIN" | "DISTRICT_ADMIN" | "SCHOOL_STAFF" | "CASHIER", schoolIds: string[]): AppSession =>
    ({ principalType: "staff", userId: `u-${role}-${crypto.randomUUID()}`, role, districtId: district.id, schoolIds });

  return {
    districtId: district.id, schoolAId: schoolA.id, schoolBId: schoolB.id, mealStudentId: a1.id,
    mealAccountId: a1.accountId,
    cashierId: cashier.id,
    schoolAStudentIds: [a1.id, a2.id, a3.id],
    superAdmin: staff("SUPER_ADMIN", []),
    adminA: staff("DISTRICT_ADMIN", [schoolA.id]),
    schoolStaffA: staff("SCHOOL_STAFF", [schoolA.id]),
    cashier: staff("CASHIER", [schoolA.id]),
    guardian: { principalType: "guardian", guardianId: `g-${crypto.randomUUID()}`, role: "GUARDIAN" },
  };
}

describe("arrears streak calculator", () => {
  it("starts when the account drops below zero and resets after recovery", () => {
    const d = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`);
    expect(currentNegativeStreak([
      { amountCents: 500, createdAt: d(1) },
      { amountCents: -700, createdAt: d(2) },
      { amountCents: 100, createdAt: d(3) },
    ])).toMatchObject({ balanceCents: -100, streakStartedAt: d(2) });
    expect(currentNegativeStreak([
      { amountCents: 500, createdAt: d(1) },
      { amountCents: -700, createdAt: d(2) },
      { amountCents: 300, createdAt: d(3) },
      { amountCents: -150, createdAt: d(4) },
    ])).toMatchObject({ balanceCents: -50, streakStartedAt: d(4) });
    expect(currentNegativeStreak([
      { amountCents: 500, createdAt: d(1) },
      { amountCents: -500, createdAt: d(2) },
    ])).toEqual({ balanceCents: 0, streakStartedAt: null });
  });
});

describe("edit-check ceiling", () => {
  it("uses integer basis points and rounds down", () => {
    expect(editCheckCeiling(51, FNS_FEDERAL_DEFAULT_FACTOR_BPS)).toBe(47);
    expect(editCheckCeiling(200, FNS_FEDERAL_DEFAULT_FACTOR_BPS)).toBe(187);
    expect(editCheckCeiling(0, FNS_FEDERAL_DEFAULT_FACTOR_BPS)).toBe(0);
  });

  it("rejects invalid calculation inputs", () => {
    expect(() => editCheckCeiling(-1, FNS_FEDERAL_DEFAULT_FACTOR_BPS)).toThrow(RangeError);
    expect(() => editCheckCeiling(51, 10_001)).toThrow(RangeError);
  });
});

describe("CEP claim arithmetic", () => {
  it("preserves the exact 54.82 x 1.6 result, caps at 100%, and preserves totals", () => {
    expect(calculateCepFreeRateUnits(5482)).toBe(87_712);
    expect(calculateCepFreeRateUnits(9000)).toBe(100_000);
    expect(allocateCepClaimSplit(100, 87_712)).toEqual({ total: 100, freeRate: 87, paidRate: 13 });
    expect(allocateCepClaimSplit(3, 87_712)).toEqual({ total: 3, freeRate: 2, paidRate: 1 });
    expect(() => calculateCepFreeRateUnits(10_001)).toThrow(RangeError);
    expect(() => allocateCepClaimSplit(-1, 87_712)).toThrow(RangeError);
  });
});

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

describe.skipIf(!dbUp)("edit-check report", () => {
  it("compares live normal meals with the floored ceiling and keeps equality unflagged", async () => {
    const f = await fresh();
    const today = utcToday();

    await prisma.mealEvent.create({
      data: {
        studentId: f.schoolAStudentIds[1]!,
        schoolId: f.schoolAId,
        serviceDate: today,
        mealType: "LUNCH",
        priceCents: 0,
      },
    });

    const atCeiling = await editCheckReport(f.superAdmin, { from: today, to: today });
    expect(atCeiling.status).toBe("available");
    if (atCeiling.status !== "available") throw new Error("Expected configured edit check");
    const rowAtCeiling = atCeiling.rows.find((row) => row.schoolId === f.schoolAId && row.mealType === "LUNCH")!;
    expect(rowAtCeiling).toMatchObject({
      activeEnrollment: 3,
      claimedCount: 2,
      ceiling: 2,
      needsAttention: false,
    });
    expect(atCeiling.rows.find((row) => row.schoolId === f.schoolAId && row.mealType === "BREAKFAST")).toBeUndefined();

    await prisma.mealEvent.create({
      data: {
        studentId: f.schoolAStudentIds[2]!,
        schoolId: f.schoolAId,
        serviceDate: today,
        mealType: "LUNCH",
        priceCents: 0,
      },
    });
    const aboveCeiling = await editCheckReport(f.superAdmin, { from: today, to: today });
    if (aboveCeiling.status !== "available") throw new Error("Expected configured edit check");
    expect(aboveCeiling.rows.find((row) => row.schoolId === f.schoolAId && row.mealType === "LUNCH")).toMatchObject({
      claimedCount: 3,
      ceiling: 2,
      needsAttention: true,
    });
  });

  it("uses current active enrollment and preserves serving-school attribution", async () => {
    const f = await fresh();
    await prisma.student.update({
      where: { id: f.mealStudentId },
      data: { schoolId: f.schoolBId },
    });
    const today = utcToday();
    const report = await editCheckReport(f.superAdmin, { from: today, to: today });
    if (report.status !== "available") throw new Error("Expected configured edit check");
    const alphaLunch = report.rows.find((row) => row.schoolId === f.schoolAId && row.mealType === "LUNCH")!;
    expect(alphaLunch.schoolName).toBe("Alpha");
    expect(alphaLunch.claimedCount).toBe(1);
    expect(alphaLunch.activeEnrollment).toBe(2);
  });

  it("stays school-scoped and never returns protected pricing data", async () => {
    const f = await fresh();
    const report = await editCheckReport(f.adminA, { from: utcToday(), to: utcToday() });
    if (report.status !== "available") throw new Error("Expected configured edit check");
    expect(report.rows.every((row) => row.schoolId === f.schoolAId)).toBe(true);
    expect(JSON.stringify(report).toLowerCase()).not.toContain("tier");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("eligib");
    await expect(
      editCheckReport(f.guardian, { from: utcToday(), to: utcToday() }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("returns a safe unavailable state instead of substituting a percentage", async () => {
    const f = await fresh();
    await prisma.district.update({
      where: { id: f.districtId },
      data: { stateAttendanceFactorBps: null },
    });
    await expect(editCheckReport(f.superAdmin, { from: utcToday(), to: utcToday() })).resolves.toEqual({
      status: "unavailable",
      message: "Meal-count ceilings are not available because the district percentage is not set. Ask a system administrator to update the district record.",
    });
  });

  it("enforces the district percentage database range", async () => {
    const f = await fresh();
    await expect(prisma.district.update({
      where: { id: f.districtId },
      data: { stateAttendanceFactorBps: 10_001 },
    })).rejects.toThrow();
    await expect(prisma.district.update({
      where: { id: f.districtId },
      data: { stateAttendanceFactorBps: -1 },
    })).rejects.toThrow();
  });
});

describe.skipIf(!dbUp)("monthly claim figures", () => {
  it("defaults to the previous completed district month and falls back from future months", async () => {
    const f = await fresh();
    const current = new Date("2026-08-15T16:00:00.000Z");
    await expect(resolveClaimMonth(f.districtId, { now: current })).resolves.toMatchObject({
      year: 2026,
      month: 7,
      value: "2026-07",
      isCurrentMonth: false,
    });
    await expect(resolveClaimMonth(f.districtId, { month: "2026-12", now: current })).resolves.toMatchObject({
      year: 2026,
      month: 7,
      value: "2026-07",
    });
    await expect(resolveClaimMonth(f.districtId, { month: "2026-08", now: current })).resolves.toMatchObject({
      year: 2026,
      month: 8,
      value: "2026-08",
      isCurrentMonth: true,
      to: new Date("2026-08-15T00:00:00.000Z"),
      classificationTo: new Date("2026-08-31T00:00:00.000Z"),
    });
  });

  it("aggregates only shared claim-facing meal counts and leaves extras separate", async () => {
    const f = await fresh();
    const today = utcToday();
    const report = await monthlyClaimFigures(f.superAdmin, {
      month: today.toISOString().slice(0, 7),
      now: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16)),
    });
    expect(report.status).toBe("available");
    if (report.status !== "available") throw new Error("Expected available claim figures");
    const alpha = report.schools.find((row) => row.schoolId === f.schoolAId)!;
    expect(alpha).toMatchObject({
      breakfastCount: 0,
      lunchCount: 1,
      breakfastExtraCount: 0,
      lunchExtraCount: 1,
      needsAttention: false,
    });
    expect(report.totals.lunchCount).toBe(1);
    expect(report.totals.lunchExtraCount).toBe(1);
    expect(report.lunchSplit).toEqual({ total: 1, freeRate: 0, paidRate: 1 });
    expect(JSON.stringify(report).toLowerCase()).not.toContain("tier");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("eligib");
  });

  it("preserves historical serving-school attribution after a student transfers", async () => {
    const f = await fresh();
    await prisma.student.update({
      where: { id: f.mealStudentId },
      data: { schoolId: f.schoolBId },
    });
    const today = utcToday();
    const report = await monthlyClaimFigures(f.superAdmin, {
      month: today.toISOString().slice(0, 7),
      now: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16)),
    });
    if (report.status !== "available") throw new Error("Expected available claim figures");
    expect(report.schools.find((row) => row.schoolId === f.schoolAId)?.lunchCount).toBe(1);
    expect(report.schools.find((row) => row.schoolId === f.schoolBId)?.lunchCount).toBe(0);
  });

  it("surfaces edit-check exceptions before totals", async () => {
    const f = await fresh();
    const today = utcToday();
    await prisma.mealEvent.createMany({
      data: f.schoolAStudentIds.map((studentId) => ({
        studentId,
        schoolId: f.schoolAId,
        serviceDate: today,
        mealType: "BREAKFAST" as const,
        priceCents: 0,
      })),
    });
    const report = await monthlyClaimFigures(f.superAdmin, {
      month: today.toISOString().slice(0, 7),
      now: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16)),
    });
    if (report.status !== "available") throw new Error("Expected available claim figures");
    expect(report.exceptions).toHaveLength(1);
    expect(report.exceptions[0]).toMatchObject({
      schoolId: f.schoolAId,
      mealType: "BREAKFAST",
      claimedCount: 3,
      ceiling: 2,
      needsAttention: true,
    });
  });

  it("shows a safe missing-percentage state instead of preparing figures", async () => {
    const f = await fresh();
    await prisma.district.update({
      where: { id: f.districtId },
      data: { identifiedStudentPercentageBps: null },
    });
    const report = await monthlyClaimFigures(f.superAdmin, { month: utcToday().toISOString().slice(0, 7) });
    expect(report).toMatchObject({
      status: "unavailable_missing_percentage",
      message: "Claim figures are not ready because the district percentage is not set. Update Settings before preparing these figures.",
    });
  });

  it("declines non-free-meals or mixed months without producing a partial report", async () => {
    const f = await fresh();
    const today = utcToday();
    await prisma.pricingConfig.create({
      data: {
        districtId: f.districtId,
        schoolId: null,
        cepEnabled: false,
        effectiveFrom: today,
      },
    });
    const report = await monthlyClaimFigures(f.superAdmin, {
      month: today.toISOString().slice(0, 7),
      now: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16)),
    });
    expect(report.status).toBe("unavailable_non_cep");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("tier");
  });

  it("uses historical pricing versions, school overrides, cancellations, and same-day superseding", async () => {
    const f = await fresh();
    const today = utcToday();
    const monthValue = today.toISOString().slice(0, 7);
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    await prisma.pricingConfig.create({ data: { districtId: f.districtId, schoolId: null, cepEnabled: false, effectiveFrom: first } });
    await prisma.pricingConfig.create({ data: { districtId: f.districtId, schoolId: null, cepEnabled: true, effectiveFrom: first } });
    await expect(monthlyClaimFigures(f.superAdmin, { month: monthValue, now: today })).resolves.toMatchObject({ status: "available" });

    const schoolOverride = await prisma.pricingConfig.create({
      data: { districtId: f.districtId, schoolId: f.schoolAId, cepEnabled: false, effectiveFrom: first },
    });
    await expect(monthlyClaimFigures(f.superAdmin, { month: monthValue, now: today })).resolves.toMatchObject({ status: "unavailable_non_cep" });

    await prisma.pricingConfig.update({
      where: { id: schoolOverride.id },
      data: { cancelledAt: new Date(), cancelledByUserId: f.cashierId },
    });
    await expect(monthlyClaimFigures(f.superAdmin, { month: monthValue, now: today })).resolves.toMatchObject({ status: "available" });
  });

  it("keeps a past free-meals month available even when today's configuration is off", async () => {
    const f = await fresh();
    const now = new Date("2026-08-15T16:00:00.000Z");
    await prisma.pricingConfig.create({
      data: {
        districtId: f.districtId,
        schoolId: null,
        cepEnabled: false,
        effectiveFrom: new Date("2026-08-15T00:00:00.000Z"),
      },
    });
    await expect(monthlyClaimFigures(f.superAdmin, { month: "2026-07", now })).resolves.toMatchObject({ status: "available" });
    await expect(monthlyClaimFigures(f.superAdmin, { month: "2026-08", now })).resolves.toMatchObject({ status: "unavailable_non_cep" });
  });

  it("enforces staff roles and school scope", async () => {
    const f = await fresh();
    const today = utcToday();
    const scoped = await monthlyClaimFigures(f.schoolStaffA, {
      month: today.toISOString().slice(0, 7),
      now: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16)),
    });
    if (scoped.status !== "available") throw new Error("Expected available claim figures");
    expect(scoped.schools).toHaveLength(1);
    expect(scoped.schools[0]!.schoolId).toBe(f.schoolAId);

    await expect(monthlyClaimFigures(f.cashier, { month: today.toISOString().slice(0, 7) })).rejects.toBeInstanceOf(AuthError);
    await expect(monthlyClaimFigures(f.guardian, { month: today.toISOString().slice(0, 7) })).rejects.toBeInstanceOf(AuthError);
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
    expect(dash.editCheckExceptions).toEqual([]);
  });

  it("surfaces only the current district-day edit-check exception", async () => {
    const f = await fresh();
    const currentDate = new Date("2026-08-15T00:00:00.000Z");
    const pastDate = new Date("2026-08-14T00:00:00.000Z");
    const futureDate = new Date("2026-08-16T00:00:00.000Z");

    for (const serviceDate of [pastDate, currentDate, futureDate]) {
      await prisma.mealEvent.createMany({
        data: f.schoolAStudentIds.map((studentId) => ({
          studentId,
          schoolId: f.schoolAId,
          serviceDate,
          mealType: "BREAKFAST" as const,
          priceCents: 0,
        })),
      });
    }

    const dash = await districtDashboard(f.superAdmin, new Date("2026-08-15T16:00:00.000Z"));
    expect(dash.editCheckUnavailableMessage).toBeNull();
    expect(dash.editCheckExceptions).toHaveLength(1);
    expect(dash.editCheckExceptions[0]).toMatchObject({
      schoolId: f.schoolAId,
      mealType: "BREAKFAST",
      claimedCount: 3,
      ceiling: 2,
      needsAttention: true,
    });
    expect(dash.editCheckExceptions[0]!.serviceDate).toEqual(currentDate);
  });
});

describe.skipIf(!dbUp)("arrears report", () => {
  it("lists derived negative accounts with positive owed amounts and matches dashboard counts", async () => {
    const f = await fresh();
    const rows = await arrearsReport(f.superAdmin, { now: new Date("2026-08-15T16:00:00.000Z") });
    const alphaRows = rows.rows.filter((row) => row.schoolId === f.schoolAId);
    expect(alphaRows).toHaveLength(1);
    expect(alphaRows[0]).toMatchObject({
      schoolName: "Alpha",
      amountOwedCents: 200,
      durationLabel: "Today",
    });
    expect(alphaRows[0]!.studentName).toContain("Kid");
    const dash = await districtDashboard(f.superAdmin, new Date("2026-08-15T16:00:00.000Z"));
    expect(dash.totals.negativeBalanceCount).toBe(rows.rows.length);
    expect(dash.schools.find((school) => school.schoolId === f.schoolAId)?.negativeBalanceCount).toBe(alphaRows.length);
  });

  it("uses district-local dates and includes inactive students", async () => {
    const f = await fresh();
    const negativeStudent = await prisma.student.findFirstOrThrow({
      where: { districtId: f.districtId, studentNumber: { startsWith: "A3-" } },
      include: { account: true },
    });
    await prisma.student.update({ where: { id: negativeStudent.id }, data: { enrollmentStatus: "INACTIVE" } });
    const report = await arrearsReport(f.superAdmin, { now: new Date("2026-08-16T03:30:00.000Z") });
    const row = report.rows.find((candidate) => candidate.studentId === negativeStudent.id)!;
    expect(row.enrollmentStatus).toBe("INACTIVE");
    expect(row.durationLabel).toBe("Today"); // Still Aug. 15 in America/New_York.
  });

  it("is school-scoped and denies cashiers and guardians", async () => {
    const f = await fresh();
    const scoped = await arrearsReport(f.schoolStaffA);
    expect(scoped.rows.every((row) => row.schoolId === f.schoolAId)).toBe(true);
    await expect(arrearsReport(f.schoolStaffA, { schoolId: f.schoolBId })).rejects.toBeInstanceOf(AuthError);
    await expect(arrearsReport(f.cashier)).rejects.toBeInstanceOf(AuthError);
    await expect(arrearsReport(f.guardian)).rejects.toBeInstanceOf(AuthError);
    expect(JSON.stringify(scoped).toLowerCase()).not.toContain("tier");
    expect(JSON.stringify(scoped).toLowerCase()).not.toContain("eligib");
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
      {
        createdAt: new Date("2026-08-12T12:00:00Z"),
        studentNumber: "100001",
        studentName: "Ella Whitfield",
        schoolName: "Alpha",
        activity: '=Dana Whitfield added $50.00 online, "confirmed"',
        amountCents: 5000,
        connection: null,
        reason: null,
      },
    ];
    const csv = transactionsToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(`"Prototype notice","${PROTOTYPE_BANNER_TEXT.replace(/"/g, '""')}"`);
    expect(lines[1]).toBe("");
    expect(lines[2]).toContain("Student number");
    expect(lines[2]).toContain("Activity");
    expect(csv).not.toContain('"DEPOSIT"');
    expect(csv).toContain(`"'=Dana Whitfield added $50.00 online, ""confirmed"""`); // formula guard + quotes escaped
    expect(csv.toLowerCase()).not.toContain("tier");
    expect(csv.toLowerCase()).not.toContain("eligib");
  });

  it("uses the same sentence history for screen models and downloads, with linked fixes", async () => {
    const f = await fresh();
    const item = await prisma.item.create({
      data: { districtId: f.districtId, schoolId: f.schoolAId, name: "Cookie", priceCents: 125 },
    });
    const original = await prisma.ledgerEntry.create({
      data: {
        accountId: f.mealAccountId,
        type: "ALACARTE_CHARGE",
        amountCents: -125,
        description: "Cookie",
        actorType: "USER",
        actorId: f.cashierId,
      },
    });
    await prisma.itemSale.create({
      data: { itemId: item.id, studentId: f.mealStudentId, priceCentsAtSale: 125, ledgerEntryId: original.id },
    });
    const refund = await prisma.ledgerEntry.create({
      data: {
        accountId: f.mealAccountId,
        type: "REFUND",
        amountCents: 125,
        description: "Money given back: Snack was returned",
        correctsEntryId: original.id,
        actorType: "USER",
        actorId: f.cashierId,
      },
    });
    await prisma.correctionCase.create({
      data: {
        situation: "SNACK_RETURNED",
        status: "COMPLETED",
        studentId: f.mealStudentId,
        originalEntryId: original.id,
        refundEntryId: refund.id,
        reason: "Snack was returned",
        actorId: f.cashierId,
        completedAt: new Date(),
        completedByUserId: f.cashierId,
      },
    });

    const screenHistory = await getMoneyHistoryForAccount(f.mealAccountId, { visibleSchoolIds: [f.schoolAId] });
    const exportRows = await listTransactions(f.adminA, {});
    const screenRefund = screenHistory.find((row) => row.id === refund.id)!;
    const exportRefund = exportRows.find((row) => row.createdAt.getTime() === refund.createdAt.getTime() && row.amountCents === 125)!;
    const screenOriginal = screenHistory.find((row) => row.id === original.id)!;

    expect(screenRefund.activity).toBe(exportRefund.activity);
    expect(screenRefund.connection).toBe(exportRefund.connection);
    expect(screenRefund.activity).toContain('Reason: "Snack was returned"');
    expect(screenRefund.connection).toContain("Corrects: Cookie");
    expect(screenOriginal.correctedAbove).toBe(true);

    const csv = transactionsToCsv(exportRows);
    expect(csv).toContain('"Activity","Amount","Connection","Reason"');
    expect(csv).toContain('"Snack was returned"');
    expect(csv).not.toContain("SNACK_RETURNED");
    expect(csv.toLowerCase()).not.toContain("tier");
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
