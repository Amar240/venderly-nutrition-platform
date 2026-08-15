import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/errors";
import { getChargePolicy, updateChargePolicy, ChargePolicyError } from "./chargePolicy";
import type { AppSession } from "@/server/auth/types";

const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[chargePolicy.test] no database reachable - skipping");
}

const districtIds: string[] = [];
const guardianIds: string[] = [];

afterAll(async () => {
  for (const id of districtIds) {
    await prisma.auditLog.deleteMany({ where: { districtId: id } });
    await prisma.guardianStudent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.userSchool.deleteMany({ where: { user: { districtId: id } } });
    await prisma.user.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
  await prisma.$disconnect();
});

async function fresh() {
  const district = await prisma.district.create({ data: { name: `POL-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "Policy School", code: `P${Math.random().toString(36).slice(2, 6)}` },
  });
  const student = await prisma.student.create({
    data: {
      districtId: district.id,
      schoolId: school.id,
      studentNumber: `P-${crypto.randomUUID()}`,
      firstName: "Marcus",
      lastName: "Okafor",
      grade: "7",
      account: { create: { balanceCents: 0 } },
    },
  });
  const guardian = await prisma.guardian.create({
    data: { email: `g-${crypto.randomUUID()}@test.invalid`, passwordHash: "x", firstName: "Dana", lastName: "Whitfield" },
  });
  const otherGuardian = await prisma.guardian.create({
    data: { email: `other-${crypto.randomUUID()}@test.invalid`, passwordHash: "x", firstName: "Other", lastName: "Guardian" },
  });
  guardianIds.push(guardian.id, otherGuardian.id);
  await prisma.guardianStudent.create({ data: { guardianId: guardian.id, studentId: student.id } });

  const staff = (role: "CASHIER" | "SCHOOL_STAFF" | "DISTRICT_ADMIN" | "SUPER_ADMIN"): AppSession => ({
    principalType: "staff",
    userId: `u-${role}-${crypto.randomUUID()}`,
    role,
    districtId: district.id,
    schoolIds: [school.id],
  });

  return {
    district,
    guardian: { principalType: "guardian", guardianId: guardian.id, role: "GUARDIAN" } as AppSession,
    otherGuardian: { principalType: "guardian", guardianId: otherGuardian.id, role: "GUARDIAN" } as AppSession,
    cashier: staff("CASHIER"),
    schoolStaff: staff("SCHOOL_STAFF"),
    districtAdmin: staff("DISTRICT_ADMIN"),
    superAdmin: staff("SUPER_ADMIN"),
  };
}

describe.skipIf(!dbUp)("charge policy", () => {
  it("lets staff and linked guardians read only presentation-safe policy text", async () => {
    const f = await fresh();
    await updateChargePolicy(f.superAdmin, "Families receive the district policy in writing.\n\nMeals are still served.");
    const guardianView = await getChargePolicy(f.guardian);
    const cashierView = await getChargePolicy(f.cashier);
    const staffView = await getChargePolicy(f.schoolStaff);
    expect(guardianView.policyText).toContain("Meals are still served.");
    expect(cashierView.policyText).toBe(guardianView.policyText);
    expect(staffView.canEdit).toBe(false);
    expect(JSON.stringify(guardianView).toLowerCase()).not.toContain("tier");
    await expect(getChargePolicy(f.otherGuardian)).rejects.toBeInstanceOf(ChargePolicyError);
  });

  it("restricts updates to district admin and super admin, validates text, and audits before and after", async () => {
    const f = await fresh();
    await expect(updateChargePolicy(f.schoolStaff, "School staff text")).rejects.toBeInstanceOf(AuthError);
    await expect(updateChargePolicy(f.cashier, "Cashier text")).rejects.toBeInstanceOf(AuthError);
    await expect(updateChargePolicy(f.districtAdmin, "   ")).rejects.toMatchObject({ code: "EMPTY" });
    await updateChargePolicy(f.districtAdmin, "First district wording.");
    await updateChargePolicy(f.superAdmin, "Updated district wording.");
    const district = await prisma.district.findUniqueOrThrow({ where: { id: f.district.id } });
    expect(district.unpaidMealChargePolicyText).toBe("Updated district wording.");
    const audit = await prisma.auditLog.findMany({
      where: { districtId: f.district.id, action: "CONFIG_CHARGE_POLICY_UPDATE" },
      orderBy: { createdAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]?.beforeJson).toMatchObject({ unpaidMealChargePolicyText: null });
    expect(audit[1]?.beforeJson).toMatchObject({ unpaidMealChargePolicyText: "First district wording." });
    expect(audit[1]?.afterJson).toMatchObject({ unpaidMealChargePolicyText: "Updated district wording." });
  });
});
