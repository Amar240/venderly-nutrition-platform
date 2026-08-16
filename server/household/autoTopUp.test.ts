import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import type { AppSession } from "@/server/auth/types";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { deriveBalanceCents } from "@/server/ledger/ledger";
import {
  cancelAutomaticTopUpRule,
  saveAutomaticTopUpRule,
  triggerAutomaticTopUpsForDebit,
} from "./autoTopUp";
import { AuthError } from "@/server/auth/errors";

const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[autoTopUp.test] no database reachable — skipping");
}

const districtIds: string[] = [];
const guardianIds: string[] = [];

afterAll(async () => {
  for (const id of districtIds) {
    await prisma.notificationDelivery.deleteMany({ where: { notification: { districtId: id } } });
    await prisma.notification.deleteMany({ where: { districtId: id } });
    await prisma.paymentAllocation.deleteMany({ where: { student: { districtId: id } } });
    await prisma.paymentIntent.deleteMany({ where: { guardian: { studentLinks: { some: { student: { districtId: id } } } } } });
    await prisma.automaticTopUpRun.deleteMany({ where: { rule: { student: { districtId: id } } } });
    await prisma.automaticTopUpRule.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) => tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }));
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.guardianStudent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  for (const id of guardianIds) {
    await prisma.guardian.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

interface Fixture {
  districtId: string;
  studentId: string;
  accountId: string;
  guardianId: string;
  otherGuardianId: string;
  guardianSession: AppSession;
  otherGuardianSession: AppSession;
}

async function fresh(balanceCents = 900): Promise<Fixture> {
  const district = await prisma.district.create({
    data: { name: `TEST-${crypto.randomUUID()}`, timeZone: "America/New_York" },
  });
  districtIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "Test School", code: `T${Math.random().toString(36).slice(2, 6)}` },
  });
  await prisma.pricingConfig.create({ data: { districtId: district.id, cepEnabled: true } });
  const student = await prisma.student.create({
    data: {
      districtId: district.id,
      schoolId: school.id,
      studentNumber: `S-${crypto.randomUUID()}`,
      firstName: "Maya",
      lastName: "Chen",
      grade: "4",
      account: { create: { balanceCents } },
    },
  });
  const account = await prisma.account.findUniqueOrThrow({ where: { studentId: student.id } });
  if (balanceCents !== 0) {
    await prisma.ledgerEntry.create({
      data: {
        accountId: account.id,
        type: "DEPOSIT",
        amountCents: balanceCents,
        description: "opening",
        actorType: "SYSTEM",
      },
    });
  }
  const guardian = await prisma.guardian.create({
    data: { email: `g-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "Dana", lastName: "G" },
  });
  const otherGuardian = await prisma.guardian.create({
    data: { email: `o-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "Other", lastName: "G" },
  });
  guardianIds.push(guardian.id, otherGuardian.id);
  await prisma.guardianStudent.create({ data: { guardianId: guardian.id, studentId: student.id } });
  return {
    districtId: district.id,
    studentId: student.id,
    accountId: account.id,
    guardianId: guardian.id,
    otherGuardianId: otherGuardian.id,
    guardianSession: { principalType: "guardian", guardianId: guardian.id, role: "GUARDIAN" },
    otherGuardianSession: { principalType: "guardian", guardianId: otherGuardian.id, role: "GUARDIAN" },
  };
}

async function writeDebit(f: Fixture, amountCents: number) {
  const debit = await prisma.ledgerEntry.create({
    data: {
      accountId: f.accountId,
      type: "ALACARTE_CHARGE",
      amountCents: -amountCents,
      description: "Snack",
      actorType: "SYSTEM",
    },
  });
  const balance = await deriveBalanceCents(f.accountId);
  await prisma.account.update({ where: { id: f.accountId }, data: { balanceCents: balance } });
  return debit;
}

describe.skipIf(!dbUp)("automatic top-up", () => {
  it("lets a linked guardian save and cancel a rule, and refuses another guardian", async () => {
    const f = await fresh();
    const rule = await saveAutomaticTopUpRule(f.guardianSession, {
      studentId: f.studentId,
      triggerBalanceCents: 800,
      topUpAmountCents: 1000,
      monthlyCeilingCents: 3000,
    });
    expect(rule.active).toBe(true);
    await expect(
      saveAutomaticTopUpRule(f.otherGuardianSession, {
        studentId: f.studentId,
        triggerBalanceCents: 800,
        topUpAmountCents: 1000,
        monthlyCeilingCents: 3000,
      }),
    ).rejects.toBeInstanceOf(AuthError);

    const cancelled = await cancelAutomaticTopUpRule(f.guardianSession, rule.id);
    expect(cancelled.active).toBe(false);
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  it("settles one payment and one notification when a debit crosses the rule threshold", async () => {
    const f = await fresh(900);
    await saveAutomaticTopUpRule(f.guardianSession, {
      studentId: f.studentId,
      triggerBalanceCents: 800,
      topUpAmountCents: 1000,
      monthlyCeilingCents: 3000,
    });
    const debit = await writeDebit(f, 200);

    await triggerAutomaticTopUpsForDebit({
      studentId: f.studentId,
      debitCents: 200,
      triggeringLedgerEntryId: debit.id,
    });
    await triggerAutomaticTopUpsForDebit({
      studentId: f.studentId,
      debitCents: 200,
      triggeringLedgerEntryId: debit.id,
    });

    expect(await deriveBalanceCents(f.accountId)).toBe(1700);
    expect(await prisma.automaticTopUpRun.count({ where: { rule: { studentId: f.studentId } } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { accountId: f.accountId, type: "DEPOSIT", description: "Payment (simulated checkout)" } })).toBe(1);
    expect(await prisma.notification.count({ where: { guardianId: f.guardianId, type: "AUTO_TOP_UP_COMPLETED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { guardianId: f.guardianId, body: { contains: "tier", mode: "insensitive" } } })).toBe(0);
  });

  it("skips and notifies when the family monthly limit has already been reached", async () => {
    const f = await fresh(900);
    const rule = await saveAutomaticTopUpRule(f.guardianSession, {
      studentId: f.studentId,
      triggerBalanceCents: 800,
      topUpAmountCents: 1000,
      monthlyCeilingCents: 1500,
    });
    await prisma.automaticTopUpRun.create({
      data: {
        ruleId: rule.id,
        idempotencyKey: `seed:${crypto.randomUUID()}`,
        status: "COMPLETED",
        balanceAfterCents: 700,
        amountCents: 1000,
        ceilingCents: 1500,
        completedAt: new Date(),
      },
    });
    const debit = await writeDebit(f, 200);

    await triggerAutomaticTopUpsForDebit({
      studentId: f.studentId,
      debitCents: 200,
      triggeringLedgerEntryId: debit.id,
    });

    expect(await deriveBalanceCents(f.accountId)).toBe(700);
    expect(await prisma.paymentIntent.count({ where: { guardianId: f.guardianId } })).toBe(0);
    expect(await prisma.notification.count({ where: { guardianId: f.guardianId, type: "AUTO_TOP_UP_SKIPPED" } })).toBe(1);
  });

  it("does not count a manual deposit against the automatic top-up ceiling", async () => {
    const f = await fresh(900);
    await saveAutomaticTopUpRule(f.guardianSession, {
      studentId: f.studentId,
      triggerBalanceCents: 800,
      topUpAmountCents: 1000,
      monthlyCeilingCents: 1000,
    });
    await prisma.ledgerEntry.create({
      data: {
        accountId: f.accountId,
        type: "DEPOSIT",
        amountCents: 5000,
        description: "Manual deposit",
        actorType: "GUARDIAN",
        actorId: f.guardianId,
      },
    });
    const debit = await writeDebit(f, 5200);

    await triggerAutomaticTopUpsForDebit({
      studentId: f.studentId,
      debitCents: 5200,
      triggeringLedgerEntryId: debit.id,
    });

    expect(await deriveBalanceCents(f.accountId)).toBe(1700);
    expect(await prisma.notification.count({ where: { guardianId: f.guardianId, type: "AUTO_TOP_UP_COMPLETED" } })).toBe(1);
  });
});
