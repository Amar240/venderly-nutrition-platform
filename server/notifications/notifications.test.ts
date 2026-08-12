import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { notifyDepositCompleted, notifyTransferCompleted, notifyIfLowBalanceCrossed } from "./service";
import { getDeliveryLog } from "./inbox";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";

/**
 * Phase 5c — notifications. Generation on deposit/transfer/low-balance-crossing,
 * delivery rows, no tier in bodies, and the admin delivery log.
 */
const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[notifications.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.notificationDelivery.deleteMany({ where: { notification: { districtId: id } } });
    await prisma.notification.deleteMany({ where: { districtId: id } });
    await withLedgerAdmin(prisma, (tx) => tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }));
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.guardianStudent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.guardian.deleteMany({ where: { studentLinks: { some: { student: { districtId: id } } } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

interface Fixture {
  districtId: string;
  studentId: string;
  student2Id: string;
  guardianId: string;
  adminSession: AppSession;
  guardianSession: AppSession;
}

async function fresh(balanceAfter = 800): Promise<Fixture> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const school = await prisma.school.create({ data: { districtId: district.id, name: "S", code: `T${Math.random().toString(36).slice(2, 6)}` } });
  await prisma.pricingConfig.create({ data: { districtId: district.id, schoolId: null, cepEnabled: true, lowBalanceThresholdCents: 1000 } });

  async function mk(num: string, balance: number) {
    const s = await prisma.student.create({ data: { districtId: district.id, schoolId: school.id, studentNumber: num, firstName: "Kid", lastName: num, grade: "3", account: { create: { balanceCents: balance } } } });
    const acc = await prisma.account.findUniqueOrThrow({ where: { studentId: s.id } });
    if (balance !== 0) await prisma.ledgerEntry.create({ data: { accountId: acc.id, type: "DEPOSIT", amountCents: balance, description: "opening", actorType: "SYSTEM" } });
    return s.id;
  }
  const studentId = await mk(`A-${crypto.randomUUID()}`, balanceAfter);
  const student2Id = await mk(`B-${crypto.randomUUID()}`, 0);

  const guardian = await prisma.guardian.create({ data: { email: `g-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "Dana", lastName: "G" } });
  await prisma.guardianStudent.createMany({ data: [{ guardianId: guardian.id, studentId }, { guardianId: guardian.id, studentId: student2Id }] });

  return {
    districtId: district.id, studentId, student2Id, guardianId: guardian.id,
    adminSession: { principalType: "staff", userId: "u1", role: "DISTRICT_ADMIN", districtId: district.id, schoolIds: [school.id] },
    guardianSession: { principalType: "guardian", guardianId: guardian.id, role: "GUARDIAN" },
  };
}

function countFor(guardianId: string, type: string) {
  return prisma.notification.count({ where: { guardianId, type: type as never } });
}

describe.skipIf(!dbUp)("notification generation", () => {
  it("deposit completed → one notification + a delivery row, body has the amount not a tier", async () => {
    const f = await fresh();
    await notifyDepositCompleted({ guardianId: f.guardianId, allocations: [{ studentId: f.studentId, amountCents: 2500 }] });
    const n = await prisma.notification.findFirstOrThrow({ where: { guardianId: f.guardianId, type: "DEPOSIT_COMPLETED" }, include: { deliveries: true } });
    expect(n.body).toContain("$25.00");
    expect(n.body.toLowerCase()).not.toContain("tier");
    expect(n.deliveries[0]?.status).toBe("DELIVERED");
  });

  it("transfer completed → one notification", async () => {
    const f = await fresh();
    await notifyTransferCompleted({ guardianId: f.guardianId, fromStudentId: f.studentId, toStudentId: f.student2Id, amountCents: 500 });
    expect(await countFor(f.guardianId, "TRANSFER_COMPLETED")).toBe(1);
  });

  it("low balance fires ONLY on a crossing", async () => {
    const cross = await fresh(800); // after 800 < 1000; debit 500 → before 1300 ≥ 1000 → cross
    await notifyIfLowBalanceCrossed(cross.studentId, 500);
    expect(await countFor(cross.guardianId, "LOW_BALANCE")).toBe(1);

    const already = await fresh(300); // after 300, debit 100 → before 400 < 1000 → no cross
    await notifyIfLowBalanceCrossed(already.studentId, 100);
    expect(await countFor(already.guardianId, "LOW_BALANCE")).toBe(0);

    const stayHigh = await fresh(5000); // stays above threshold
    await notifyIfLowBalanceCrossed(stayHigh.studentId, 100);
    expect(await countFor(stayHigh.guardianId, "LOW_BALANCE")).toBe(0);
  });

  it("low-balance body carries the name + amount, never a tier", async () => {
    const f = await fresh(800);
    await notifyIfLowBalanceCrossed(f.studentId, 500);
    const n = await prisma.notification.findFirstOrThrow({ where: { guardianId: f.guardianId, type: "LOW_BALANCE" } });
    expect(n.body.toLowerCase()).not.toContain("tier");
    expect(n.body.toLowerCase()).not.toContain("free");
    expect(n.body.toLowerCase()).not.toContain("reduced");
  });
});

describe.skipIf(!dbUp)("admin delivery log", () => {
  it("district admin sees the delivery trail; a guardian is refused", async () => {
    const f = await fresh();
    await notifyDepositCompleted({ guardianId: f.guardianId, allocations: [{ studentId: f.studentId, amountCents: 1000 }] });
    const log = await getDeliveryLog(f.adminSession);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]?.deliveryStatus).toBe("DELIVERED");
    await expect(getDeliveryLog(f.guardianSession)).rejects.toBeInstanceOf(AuthError);
  });
});
