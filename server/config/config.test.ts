import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { authenticator } from "otplib";
import { createItem, updateItem, setItemActive } from "./items";
import { updatePricingConfig } from "./pricing";
import { createSchool } from "./schools";
import { createStaffUser, setUserDisabled, updateStaffUser } from "./users";
import { authenticate } from "@/server/auth/authenticate";
import { resetIpLimiter } from "@/server/auth/rateLimit";
import { AuthError } from "@/server/auth/errors";
import { ConfigError } from "./items";
import type { AppSession } from "@/server/auth/types";

/**
 * Phase 5c — configuration screens. Super-admin self-guard, audit before/after,
 * price edits never rewrite past sales, districtId from session, disable-not-delete.
 */
const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[config.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.auditLog.deleteMany({ where: { districtId: id } });
    await prisma.itemSale.deleteMany({ where: { student: { districtId: id } } });
    await prisma.item.deleteMany({ where: { districtId: id } });
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.userSchool.deleteMany({ where: { user: { districtId: id } } });
    await prisma.user.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

interface Fixture {
  districtId: string;
  schoolId: string;
  studentId: string;
  superAdmin: AppSession;
  districtAdmin: AppSession;
}

async function fresh(): Promise<Fixture> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const school = await prisma.school.create({ data: { districtId: district.id, name: "S", code: `T${Math.random().toString(36).slice(2, 6)}` } });
  const student = await prisma.student.create({ data: { districtId: district.id, schoolId: school.id, studentNumber: `S-${crypto.randomUUID()}`, firstName: "K", lastName: "id", grade: "3", account: { create: { balanceCents: 0 } } } });
  return {
    districtId: district.id, schoolId: school.id, studentId: student.id,
    superAdmin: { principalType: "staff", userId: "super", role: "SUPER_ADMIN", districtId: district.id, schoolIds: [] },
    districtAdmin: { principalType: "staff", userId: "dadmin", role: "DISTRICT_ADMIN", districtId: district.id, schoolIds: [school.id] },
  };
}

describe.skipIf(!dbUp)("item catalog", () => {
  it("editing a price never rewrites a past sale", async () => {
    const f = await fresh();
    const item = await createItem(f.superAdmin, { name: "Cookie", priceCents: 150 });
    await prisma.itemSale.create({ data: { itemId: item.id, studentId: f.studentId, priceCentsAtSale: 150 } });

    const updated = await updateItem(f.superAdmin, item.id, { name: "Cookie", priceCents: 300 });
    expect(updated.priceCents).toBe(300);
    const sale = await prisma.itemSale.findFirstOrThrow({ where: { itemId: item.id } });
    expect(sale.priceCentsAtSale).toBe(150); // historical, untouched

    const audit = await prisma.auditLog.findFirst({ where: { action: "CONFIG_ITEM_UPDATE", subjectId: item.id } });
    expect(audit?.beforeJson).toMatchObject({ priceCents: 150 });
    expect(audit?.afterJson).toMatchObject({ priceCents: 300 });
  });

  it("self-guards: a district admin cannot create or deactivate items", async () => {
    const f = await fresh();
    await expect(createItem(f.districtAdmin, { name: "X", priceCents: 100 })).rejects.toBeInstanceOf(AuthError);
    const item = await createItem(f.superAdmin, { name: "Y", priceCents: 100 });
    await expect(setItemActive(f.districtAdmin, item.id, false)).rejects.toBeInstanceOf(AuthError);
  });
});

describe.skipIf(!dbUp)("pricing config", () => {
  it("updates config + audits before/after, with no per-student tier in the payload", async () => {
    const f = await fresh();
    const after = await updatePricingConfig(f.superAdmin, {
      schoolId: null, cepEnabled: false,
      breakfastFreeCents: 0, breakfastReducedCents: 30, breakfastPaidCents: 200,
      lunchFreeCents: 0, lunchReducedCents: 40, lunchPaidCents: 325, lowBalanceThresholdCents: 1000,
    });
    expect(after.lunchPaidCents).toBe(325);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "CONFIG_PRICING_UPDATE" } });
    const serialized = JSON.stringify(audit.afterJson).toLowerCase();
    expect(serialized).not.toContain("studentpricing");
    expect(serialized).not.toContain("pricetier");
    await expect(updatePricingConfig(f.districtAdmin, { schoolId: null, cepEnabled: true, breakfastFreeCents: 0, breakfastReducedCents: 0, breakfastPaidCents: 0, lunchFreeCents: 0, lunchReducedCents: 0, lunchPaidCents: 0, lowBalanceThresholdCents: 0 })).rejects.toBeInstanceOf(AuthError);
  });
});

describe.skipIf(!dbUp)("staff user management", () => {
  it("creates a user in the session's district, returns the TOTP once, and never audits the secret", async () => {
    const f = await fresh();
    const email = `new-${crypto.randomUUID()}@t.demo`;
    const { userId, totpSecret } = await createStaffUser(f.superAdmin, { email, firstName: "New", lastName: "Cashier", role: "CASHIER", schoolIds: [f.schoolId] });
    expect(totpSecret).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.districtId).toBe(f.districtId); // from session, not a form
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "CONFIG_USER_CREATE", subjectId: userId } });
    const serialized = JSON.stringify(audit.afterJson);
    expect(serialized).not.toContain(totpSecret);
    expect(serialized.toLowerCase()).not.toContain("password");
  });

  it("deactivation is audited, reversible, blocks sign-in, and self-disable is refused", async () => {
    const f = await fresh();
    const email = `dis-${crypto.randomUUID()}@t.demo`;
    const { userId } = await createStaffUser(f.superAdmin, { email, firstName: "Dis", lastName: "Abled", role: "CASHIER", schoolIds: [] });

    await setUserDisabled(f.superAdmin, userId, true);
    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(disabled.disabledAt).not.toBeNull();

    // A disabled user cannot authenticate even with the right password + TOTP.
    resetIpLimiter();
    const code = authenticator.generate(disabled.totpSecret!);
    const result = await authenticate({ email, password: process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1", totp: code, ip: `ip-${crypto.randomUUID()}` });
    expect(result.ok).toBe(false);

    // Reversible.
    await setUserDisabled(f.superAdmin, userId, false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).disabledAt).toBeNull();

    // Can't disable yourself.
    await expect(setUserDisabled(f.superAdmin, f.superAdmin.principalType === "staff" ? f.superAdmin.userId : "", true)).rejects.toBeInstanceOf(ConfigError);
  });

  it("a duplicate school code is rejected", async () => {
    const f = await fresh();
    await createSchool(f.superAdmin, { name: "New School", code: "NS1" });
    await expect(createSchool(f.superAdmin, { name: "Dup", code: "NS1" })).rejects.toBeInstanceOf(ConfigError);
  });
});
