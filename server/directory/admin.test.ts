import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { recordReallocation, recordAdjustment, getBalanceCents, LedgerError } from "@/server/ledger/ledger";
import { recordMealOverride, MealOverrideError } from "@/server/meals/recordMealOverride";
import { recordMeal } from "@/server/meals/recordMeal";
import { countServedMeals, countMealOverrides } from "@/server/meals/mealCounts";
import { searchStudents, getStudentAdminDetail } from "./adminStudents";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";

/**
 * Phase 5a — admin student detail + corrections. Scope, self-guarding
 * corrections, the duplicate-meal override, tier confidentiality, and the
 * "overrides are counted separately" rule.
 */
const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[admin.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.auditLog.deleteMany({ where: { districtId: id } });
    await prisma.mealEvent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.itemSale.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) =>
      tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }),
    );
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.guardianStudent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.user.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

interface Fixture {
  districtId: string;
  schoolAId: string;
  schoolBId: string;
  a1: { id: string; number: string };
  a2: { id: string; number: string };
  b: { id: string; number: string };
  superAdmin: AppSession;
  districtAdminA: AppSession;
  schoolStaffA: AppSession;
  cashierA: AppSession;
  guardian: AppSession;
}

async function fresh(): Promise<Fixture> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const schoolA = await prisma.school.create({ data: { districtId: district.id, name: "A", code: `A${Math.random().toString(36).slice(2, 6)}` } });
  const schoolB = await prisma.school.create({ data: { districtId: district.id, name: "B", code: `B${Math.random().toString(36).slice(2, 6)}` } });
  await prisma.pricingConfig.create({ data: { districtId: district.id, schoolId: null, cepEnabled: true } });

  async function mk(schoolId: string, num: string, balance: number) {
    const s = await prisma.student.create({
      data: {
        districtId: district.id, schoolId, studentNumber: num,
        firstName: "Kid", lastName: num, grade: "3",
        account: { create: { balanceCents: balance } },
        pricing: { create: { tier: "FREE", source: "DEFAULT" } },
      },
    });
    if (balance !== 0) {
      const acc = await prisma.account.findUniqueOrThrow({ where: { studentId: s.id } });
      await prisma.ledgerEntry.create({ data: { accountId: acc.id, type: "DEPOSIT", amountCents: balance, description: "opening", actorType: "SYSTEM" } });
    }
    return { id: s.id, number: num };
  }
  const a1 = await mk(schoolA.id, `A1-${crypto.randomUUID()}`, 5000);
  const a2 = await mk(schoolA.id, `A2-${crypto.randomUUID()}`, 0);
  const b = await mk(schoolB.id, `B-${crypto.randomUUID()}`, 1000);

  const guardian = await prisma.guardian.create({ data: { email: `g-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "Dana", lastName: "G" } });
  await prisma.guardianStudent.create({ data: { guardianId: guardian.id, studentId: a1.id, relationship: "parent" } });

  const staff = (
    role: "SUPER_ADMIN" | "DISTRICT_ADMIN" | "SCHOOL_STAFF" | "CASHIER",
    schoolIds: string[],
    userId = `u-${role}-${crypto.randomUUID()}`,
  ): AppSession => ({
    principalType: "staff",
    userId,
    role,
    districtId: district.id,
    schoolIds,
  });
  const cashierUser = await prisma.user.create({
    data: {
      email: `cashier-${crypto.randomUUID()}@test.invalid`,
      passwordHash: "test",
      firstName: "Casey",
      lastName: "Cashier",
      role: "CASHIER",
      districtId: district.id,
      schools: { create: { schoolId: schoolA.id } },
    },
  });

  return {
    districtId: district.id, schoolAId: schoolA.id, schoolBId: schoolB.id, a1, a2, b,
    superAdmin: staff("SUPER_ADMIN", []),
    districtAdminA: staff("DISTRICT_ADMIN", [schoolA.id]),
    schoolStaffA: staff("SCHOOL_STAFF", [schoolA.id]),
    cashierA: staff("CASHIER", [schoolA.id], cashierUser.id),
    guardian: { principalType: "guardian", guardianId: guardian.id, role: "GUARDIAN" },
  };
}

async function balanceOf(studentId: string) {
  const acc = await prisma.account.findUniqueOrThrow({ where: { studentId } });
  return getBalanceCents(acc.id);
}

describe.skipIf(!dbUp)("recordReallocation", () => {
  it("moves money as an audited linked pair", async () => {
    const f = await fresh();
    const res = await recordReallocation({ fromStudentId: f.a1.id, toStudentId: f.a2.id, amountCents: 1500, reason: "deposit went to wrong child", actor: { kind: "staff", session: f.districtAdminA } });
    expect(await balanceOf(f.a1.id)).toBe(3500);
    expect(await balanceOf(f.a2.id)).toBe(1500);
    const pair = await prisma.ledgerEntry.findMany({ where: { transferRef: res.transferRef } });
    expect(pair).toHaveLength(2);
    const audit = await prisma.auditLog.findFirst({ where: { action: "LEDGER_REALLOCATION", subjectId: f.a1.id } });
    expect(audit?.reason).toBe("deposit went to wrong child");
  });

  it("self-guards: cashier, school staff, and guardian are refused, money unmoved", async () => {
    const f = await fresh();
    for (const session of [f.cashierA, f.schoolStaffA, f.guardian]) {
      await expect(
        recordReallocation({ fromStudentId: f.a1.id, toStudentId: f.a2.id, amountCents: 100, reason: "x", actor: { kind: "staff", session } }),
      ).rejects.toBeInstanceOf(AuthError);
    }
    expect(await balanceOf(f.a1.id)).toBe(5000);
  });

  it("requires a reason", async () => {
    const f = await fresh();
    await expect(
      recordReallocation({ fromStudentId: f.a1.id, toStudentId: f.a2.id, amountCents: 100, reason: "  ", actor: { kind: "staff", session: f.superAdmin } }),
    ).rejects.toBeInstanceOf(LedgerError);
  });
});

describe.skipIf(!dbUp)("duplicate-meal override", () => {
  it("POS seq=0 duplicate guard still fires after the schema change", async () => {
    const f = await fresh();
    const first = await recordMeal({ studentNumber: f.a1.number, mealType: "LUNCH", session: f.cashierA });
    expect(first.status).toBe("recorded");
    const dup = await recordMeal({ studentNumber: f.a1.number, mealType: "LUNCH", session: f.cashierA });
    expect(dup.status).toBe("duplicate");
    expect(await countServedMeals({ studentId: f.a1.id })).toBe(1);
  });

  it("an admin override records a distinct audited meal (seq > 0)", async () => {
    const f = await fresh();
    await recordMeal({ studentNumber: f.a1.number, mealType: "LUNCH", session: f.cashierA });
    const ov = await recordMealOverride({ studentId: f.a1.id, mealType: "LUNCH", reason: "second meal authorized", session: f.districtAdminA });
    expect(ov.overrideSeq).toBe(1);
    expect(ov.overrideReason).toBe("second meal authorized");
    const audit = await prisma.auditLog.findFirst({ where: { action: "DUPLICATE_MEAL_OVERRIDE", subjectId: f.a1.id } });
    expect(audit?.reason).toBe("second meal authorized");
  });

  it("counts servings (seq=0) and overrides (seq>0) SEPARATELY, never summed", async () => {
    const f = await fresh();
    await recordMeal({ studentNumber: f.a1.number, mealType: "LUNCH", session: f.cashierA });
    await recordMealOverride({ studentId: f.a1.id, mealType: "LUNCH", reason: "authorized", session: f.superAdmin });
    await recordMealOverride({ studentId: f.a1.id, mealType: "LUNCH", reason: "authorized again", session: f.superAdmin });
    expect(await countServedMeals({ studentId: f.a1.id })).toBe(1); // headline excludes overrides
    expect(await countMealOverrides({ studentId: f.a1.id })).toBe(2);
  });

  it("rejects an override with no original meal, and a non-admin actor", async () => {
    const f = await fresh();
    await expect(
      recordMealOverride({ studentId: f.a1.id, mealType: "BREAKFAST", reason: "x", session: f.superAdmin }),
    ).rejects.toBeInstanceOf(MealOverrideError);
    await recordMeal({ studentNumber: f.a1.number, mealType: "BREAKFAST", session: f.cashierA });
    await expect(
      recordMealOverride({ studentId: f.a1.id, mealType: "BREAKFAST", reason: "x", session: f.cashierA }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe.skipIf(!dbUp)("student detail + search (scope + tier confidentiality)", () => {
  it("returns detail for an in-scope student with no tier field", async () => {
    const f = await fresh();
    await recordAdjustment({ accountId: (await prisma.account.findUniqueOrThrow({ where: { studentId: f.a1.id } })).id, amountCents: -200, reason: "test correction", actor: { kind: "staff", session: f.districtAdminA } });
    const detail = await getStudentAdminDetail(f.districtAdminA, f.a1.id);
    expect(detail).not.toBeNull();
    expect(detail!.balanceCents).toBe(4800);
    expect(detail!.guardians[0]?.name).toBe("Dana G");
    expect(detail!.history.length).toBeGreaterThan(0);
    expect(detail!.audit.some((a) => a.action === "LEDGER_ADJUSTMENT")).toBe(true);
    // Confidentiality: no tier anywhere in the payload.
    expect("tier" in detail!).toBe(false);
    const serialized = JSON.stringify(detail).toLowerCase();
    for (const bad of ["pricetier", "studentpricing", '"tier"']) {
      expect(serialized).not.toContain(bad);
    }
  });

  it("blocks a district admin from a student outside their schools", async () => {
    const f = await fresh();
    await expect(getStudentAdminDetail(f.districtAdminA, f.b.id)).rejects.toBeInstanceOf(AuthError);
  });

  it("search is scoped to the session's schools", async () => {
    const f = await fresh();
    const inScope = await searchStudents(f.districtAdminA, "Kid");
    const ids = inScope.map((s) => s.id);
    expect(ids).toContain(f.a1.id);
    expect(ids).not.toContain(f.b.id); // schoolB is out of scope
    const superView = await searchStudents(f.superAdmin, "Kid");
    expect(superView.map((s) => s.id)).toContain(f.b.id);
  });
});
