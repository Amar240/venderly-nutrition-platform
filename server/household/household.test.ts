import { PrismaClient, type PriceTier } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getHousehold } from "./household";
import { dateOnlyUtc } from "@/server/time/district";

const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[household.test] no database reachable — skipping");
}

const districtIds: string[] = [];
const guardianIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.mealEvent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.guardianStudent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.studentPricing.deleteMany({ where: { student: { districtId: id } } });
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
  await prisma.$disconnect();
});

async function freshHousehold(opts?: { cep?: boolean; tier?: PriceTier; balance?: number; lunchPrice?: number }) {
  const district = await prisma.district.create({
    data: { name: `HH-${crypto.randomUUID()}`, timeZone: "America/New_York" },
  });
  districtIds.push(district.id);
  const school = await prisma.school.create({
    data: {
      districtId: district.id,
      name: "Household School",
      code: `H${crypto.randomUUID()}`,
      breakfastServiceEndMinutes: 9 * 60,
      lunchServiceEndMinutes: 13 * 60,
    },
  });
  await prisma.pricingConfig.create({
    data: {
      districtId: district.id,
      schoolId: null,
      cepEnabled: opts?.cep ?? false,
      breakfastPaidCents: 200,
      lunchFreeCents: 0,
      lunchReducedCents: 40,
      lunchPaidCents: opts?.lunchPrice ?? 325,
      lowBalanceThresholdCents: 1000,
      lowBalanceMealsThreshold: 5,
    },
  });
  const guardian = await prisma.guardian.create({
    data: { email: `g-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "Dana", lastName: "Demo" },
  });
  const otherGuardian = await prisma.guardian.create({
    data: { email: `o-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "Other", lastName: "Demo" },
  });
  guardianIds.push(guardian.id, otherGuardian.id);
  const student = await prisma.student.create({
    data: {
      districtId: district.id,
      schoolId: school.id,
      studentNumber: `S-${crypto.randomUUID()}`,
      firstName: "Marcus",
      lastName: "Okafor",
      grade: "7",
      account: { create: { balanceCents: opts?.balance ?? 1300 } },
      pricing: { create: { tier: opts?.tier ?? "PAID", source: "DEFAULT" } },
    },
  });
  await prisma.guardianStudent.create({ data: { guardianId: guardian.id, studentId: student.id, relationship: "Parent" } });
  return { district, school, guardian, otherGuardian, student };
}

describe.skipIf(!dbUp)("guardian household meal read model", () => {
  it("resolves prices only for linked children and never serializes tier data", async () => {
    const f = await freshHousehold({ cep: false, tier: "REDUCED", balance: 160 });
    const rows = await getHousehold({ principalType: "guardian", guardianId: f.guardian.id, role: "GUARDIAN" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lunchPriceCents).toBe(40);
    expect(rows[0]!.mealsRemaining).toBe(4);
    expect(rows[0]!.status).toBe("low");

    const serialized = JSON.stringify(rows).toLowerCase();
    expect(serialized).not.toContain("tier");
    expect(serialized).not.toContain("reduced");
    expect(serialized).not.toContain("studentpricing");

    const otherRows = await getHousehold({ principalType: "guardian", guardianId: f.otherGuardian.id, role: "GUARDIAN" });
    expect(otherRows).toEqual([]);
  });

  it("keys zero-price rendering from resolved student price, not the CEP flag", async () => {
    const cep = await freshHousehold({ cep: true, tier: "PAID", balance: 900 });
    const nonCepFree = await freshHousehold({ cep: false, tier: "FREE", balance: 900 });

    const cepChild = (await getHousehold({ principalType: "guardian", guardianId: cep.guardian.id, role: "GUARDIAN" }))[0]!;
    const freeChild = (await getHousehold({ principalType: "guardian", guardianId: nonCepFree.guardian.id, role: "GUARDIAN" }))[0]!;

    expect(cepChild.lunchPriceCents).toBe(0);
    expect(freeChild.lunchPriceCents).toBe(0);
    expect(cepChild.mealCoverageText).toBe("Breakfast and lunch are free");
    expect(freeChild.mealCoverageText).toBe("Breakfast and lunch are free");
    expect(cepChild.moneyText).toBe("$9.00 for snacks and extras");
    expect(freeChild.moneyText).toBe("$9.00 for snacks and extras");
  });

  it("returns daily states before and at/after service end, omitting unserved meals", async () => {
    const f = await freshHousehold({ cep: false, tier: "PAID" });
    const today = dateOnlyUtc(2026, 8, 15);
    await prisma.mealEvent.create({
      data: { studentId: f.student.id, serviceDate: today, mealType: "BREAKFAST", priceCents: 0 },
    });
    const beforeLunch = await getHousehold(
      { principalType: "guardian", guardianId: f.guardian.id, role: "GUARDIAN" },
      new Date("2026-08-15T16:59:00.000Z"),
    );
    expect(beforeLunch[0]!.todayMeals.map((meal) => meal.label)).toEqual([
      "Breakfast recorded today",
      "No lunch yet",
    ]);

    const afterLunch = await getHousehold(
      { principalType: "guardian", guardianId: f.guardian.id, role: "GUARDIAN" },
      new Date("2026-08-15T17:00:00.000Z"),
    );
    expect(afterLunch[0]!.todayMeals.map((meal) => meal.label)).toEqual([
      "Breakfast recorded today",
      "No lunch recorded",
    ]);

    await prisma.school.update({ where: { id: f.school.id }, data: { breakfastServiceEndMinutes: null } });
    const unservedBreakfast = await getHousehold(
      { principalType: "guardian", guardianId: f.guardian.id, role: "GUARDIAN" },
      new Date("2026-08-15T17:00:00.000Z"),
    );
    expect(unservedBreakfast[0]!.servedMealTypes).toEqual(["LUNCH"]);
  });

  it("shows the exact three-of-five operating-day lunch pattern", async () => {
    const f = await freshHousehold({ cep: true, tier: "PAID", balance: 900 });
    const today = dateOnlyUtc(2026, 8, 15);
    const days = [1, 2, 3, 4, 5].map((d) => dateOnlyUtc(2026, 8, 15 - d));
    await prisma.mealEvent.createMany({
      data: days.flatMap((serviceDate, index) => [
        { studentId: f.student.id, serviceDate, mealType: "BREAKFAST" as const, priceCents: 0 },
        ...(index < 2 ? [{ studentId: f.student.id, serviceDate, mealType: "LUNCH" as const, priceCents: 0 }] : []),
      ]),
    });
    await prisma.mealEvent.create({
      data: { studentId: f.student.id, serviceDate: today, mealType: "BREAKFAST", priceCents: 0 },
    });

    const rows = await getHousehold(
      { principalType: "guardian", guardianId: f.guardian.id, role: "GUARDIAN" },
      new Date("2026-08-15T17:30:00.000Z"),
    );
    expect(rows[0]!.pattern?.line).toBe("No lunch recorded for Marcus on 3 of the last 5 school days.");
    expect(rows[0]!.warnings).toContain("Lunch is free every day — nothing needs to be paid.");
  });
});
