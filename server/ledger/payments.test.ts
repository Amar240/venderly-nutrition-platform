import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll, beforeEach } from "vitest";

// Ensure a signing secret exists for the webhook path (won't override a real one).
process.env.PAYMENT_SIM_SECRET ||= "test-payment-secret";

import {
  recordDeposit,
  recordTransfer,
  deriveBalanceCents,
  LedgerError,
} from "./ledger";
import { paymentPort, PaymentError } from "@/server/ports/payment";
import { signPaymentEvent } from "@/server/ports/paymentSignature";
import { resetWebhookLimiter } from "@/server/ports/paymentRateLimit";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { POST as webhookPOST } from "@/app/api/payments/webhook/route";
import { getChildDetail } from "@/server/household/household";
import type { AppSession } from "@/server/auth/types";
import type { NextRequest } from "next/server";

/**
 * Phase-2 trust story (DB-backed). Covers ledger idempotency + transfer atomicity,
 * webhook signature/settlement idempotency, and the guardian household boundary.
 * Skipped when no dev database is reachable so pure-logic runs stay green.
 */
const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[payments.test] no database reachable — skipping DB payment tests");
}

const createdDistrictIds: string[] = [];
const createdGuardianIds: string[] = [];

afterAll(async () => {
  for (const id of createdDistrictIds) {
    // Deposits now generate guardian notifications; clear them before the district.
    await prisma.notificationDelivery.deleteMany({ where: { notification: { districtId: id } } });
    await prisma.notification.deleteMany({ where: { districtId: id } });
    await prisma.paymentAllocation.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) =>
      tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }),
    );
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.guardianStudent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  for (const gid of createdGuardianIds) {
    await prisma.paymentIntent.deleteMany({ where: { guardianId: gid } });
    await prisma.guardian.deleteMany({ where: { id: gid } });
  }
  await prisma.$disconnect();
});

interface Household {
  districtId: string;
  guardianAId: string;
  guardianBId: string;
  child1Id: string;
  child2Id: string;
}

async function freshHousehold(seed = { c1: 5000, c2: 1000 }): Promise<Household> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  createdDistrictIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "Test School", code: `T${Math.random().toString(36).slice(2, 6)}` },
  });

  async function makeChild(num: string, balance: number) {
    const student = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        studentNumber: num,
        firstName: "Kid",
        lastName: num,
        grade: "3",
        account: { create: { balanceCents: balance } },
      },
    });
    if (balance !== 0) {
      const account = await prisma.account.findUniqueOrThrow({ where: { studentId: student.id } });
      await prisma.ledgerEntry.create({
        data: { accountId: account.id, type: "DEPOSIT", amountCents: balance, description: "opening", actorType: "SYSTEM" },
      });
    }
    return student;
  }

  const child1 = await makeChild(`C1-${crypto.randomUUID()}`, seed.c1);
  const child2 = await makeChild(`C2-${crypto.randomUUID()}`, seed.c2);

  const guardianA = await prisma.guardian.create({
    data: { email: `ga-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "A", lastName: "G" },
  });
  const guardianB = await prisma.guardian.create({
    data: { email: `gb-${crypto.randomUUID()}@t.demo`, passwordHash: "x", firstName: "B", lastName: "G" },
  });
  createdGuardianIds.push(guardianA.id, guardianB.id);
  await prisma.guardianStudent.createMany({
    data: [
      { guardianId: guardianA.id, studentId: child1.id },
      { guardianId: guardianA.id, studentId: child2.id },
    ],
  });

  return {
    districtId: district.id,
    guardianAId: guardianA.id,
    guardianBId: guardianB.id,
    child1Id: child1.id,
    child2Id: child2.id,
  };
}

function accountBalance(studentId: string) {
  return prisma.account
    .findUniqueOrThrow({ where: { studentId } })
    .then((a) => deriveBalanceCents(a.id, prisma));
}

function guardianSession(guardianId: string): AppSession {
  return { principalType: "guardian", guardianId, role: "GUARDIAN" };
}

async function pendingIntent(guardianId: string, studentId: string, amountCents: number) {
  return prisma.paymentIntent.create({
    data: {
      guardianId,
      totalCents: amountCents,
      allocations: { create: [{ studentId, amountCents }] },
    },
  });
}

function webhookRequest(body: string, signature: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("x-payment-signature", signature);
  return new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers,
    body,
  }) as unknown as NextRequest;
}

beforeEach(() => resetWebhookLimiter());

describe.skipIf(!dbUp)("ledger", () => {
  it("credits a deposit and updates the derived balance", async () => {
    const h = await freshHousehold({ c1: 0, c2: 0 });
    await recordDeposit({
      studentId: h.child1Id,
      amountCents: 1500,
      idempotencyKey: `k-${crypto.randomUUID()}`,
      actor: { actorType: "SYSTEM" },
    });
    expect(await accountBalance(h.child1Id)).toBe(1500);
  });

  it("is idempotent — replaying the same key credits exactly once", async () => {
    const h = await freshHousehold({ c1: 0, c2: 0 });
    const key = `k-${crypto.randomUUID()}`;
    const first = await recordDeposit({ studentId: h.child1Id, amountCents: 2000, idempotencyKey: key, actor: { actorType: "SYSTEM" } });
    const replay = await recordDeposit({ studentId: h.child1Id, amountCents: 2000, idempotencyKey: key, actor: { actorType: "SYSTEM" } });
    expect(replay.id).toBe(first.id);
    expect(await accountBalance(h.child1Id)).toBe(2000);
    const count = await prisma.ledgerEntry.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it("transfers as a linked debit+credit sharing one transferRef (zero-sum)", async () => {
    const h = await freshHousehold({ c1: 5000, c2: 1000 });
    const { transferRef } = await recordTransfer({
      fromStudentId: h.child1Id,
      toStudentId: h.child2Id,
      amountCents: 1200,
      actor: { actorType: "GUARDIAN", actorId: h.guardianAId },
    });
    expect(await accountBalance(h.child1Id)).toBe(3800);
    expect(await accountBalance(h.child2Id)).toBe(2200);
    const pair = await prisma.ledgerEntry.findMany({ where: { transferRef } });
    expect(pair).toHaveLength(2);
    expect(pair.reduce((s, e) => s + e.amountCents, 0)).toBe(0);
  });

  it("rejects a transfer over the source balance and writes nothing", async () => {
    const h = await freshHousehold({ c1: 300, c2: 0 });
    await expect(
      recordTransfer({ fromStudentId: h.child1Id, toStudentId: h.child2Id, amountCents: 999999, actor: { actorType: "GUARDIAN", actorId: h.guardianAId } }),
    ).rejects.toBeInstanceOf(LedgerError);
    expect(await accountBalance(h.child1Id)).toBe(300);
    expect(await accountBalance(h.child2Id)).toBe(0);
    const xfers = await prisma.ledgerEntry.count({ where: { account: { studentId: h.child1Id }, type: "TRANSFER_DEBIT" } });
    expect(xfers).toBe(0);
  });
});

describe.skipIf(!dbUp)("payment settlement (webhook)", () => {
  it("a valid signed event credits the deposit exactly once", async () => {
    const h = await freshHousehold({ c1: 0, c2: 0 });
    const intent = await pendingIntent(h.guardianAId, h.child1Id, 2500);
    const { body, signature } = signPaymentEvent({ id: `evt_${intent.id}`, type: "checkout.settled", intentId: intent.id, createdAt: new Date().toISOString() });

    const res = await webhookPOST(webhookRequest(body, signature));
    expect(res.status).toBe(200);
    expect(await accountBalance(h.child1Id)).toBe(2500);
    const settled = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    expect(settled.status).toBe("COMPLETED");
  });

  it("replaying the identical event credits zero more", async () => {
    const h = await freshHousehold({ c1: 0, c2: 0 });
    const intent = await pendingIntent(h.guardianAId, h.child1Id, 2500);
    const event = signPaymentEvent({ id: `evt_${intent.id}`, type: "checkout.settled", intentId: intent.id, createdAt: new Date().toISOString() });

    await webhookPOST(webhookRequest(event.body, event.signature));
    const res2 = await webhookPOST(webhookRequest(event.body, event.signature));
    expect(res2.status).toBe(200);
    expect(await res2.json()).toMatchObject({ alreadySettled: true });
    expect(await accountBalance(h.child1Id)).toBe(2500);
    const deposits = await prisma.ledgerEntry.count({ where: { account: { studentId: h.child1Id }, type: "DEPOSIT" } });
    expect(deposits).toBe(1);
  });

  it("rejects a tampered payload (signature mismatch)", async () => {
    const h = await freshHousehold({ c1: 0, c2: 0 });
    const intent = await pendingIntent(h.guardianAId, h.child1Id, 2500);
    const { signature } = signPaymentEvent({ id: `evt_${intent.id}`, type: "checkout.settled", intentId: intent.id, createdAt: new Date().toISOString() });
    // Sign one body, send a different one under the same signature.
    const tampered = JSON.stringify({ id: `evt_${intent.id}`, type: "checkout.settled", intentId: intent.id, createdAt: "tampered" });

    const res = await webhookPOST(webhookRequest(tampered, signature));
    expect(res.status).toBe(400);
    expect(await accountBalance(h.child1Id)).toBe(0);
  });

  it("rejects an unsigned event", async () => {
    const h = await freshHousehold({ c1: 0, c2: 0 });
    const intent = await pendingIntent(h.guardianAId, h.child1Id, 2500);
    const body = JSON.stringify({ id: `evt_${intent.id}`, type: "checkout.settled", intentId: intent.id, createdAt: new Date().toISOString() });

    const res = await webhookPOST(webhookRequest(body, null));
    expect(res.status).toBe(400);
    expect(await accountBalance(h.child1Id)).toBe(0);
  });

  it("rejects an unknown intent id", async () => {
    const unknownId = `missing-${crypto.randomUUID()}`;
    const { body, signature } = signPaymentEvent({ id: `evt_${unknownId}`, type: "checkout.settled", intentId: unknownId, createdAt: new Date().toISOString() });
    const res = await webhookPOST(webhookRequest(body, signature));
    expect(res.status).toBe(404);
  });

  it("settle() throws PaymentError for an unknown intent", async () => {
    await expect(
      paymentPort.settle({ intentId: `nope-${crypto.randomUUID()}`, eventId: "evt_x" }),
    ).rejects.toBeInstanceOf(PaymentError);
  });
});

describe.skipIf(!dbUp)("household boundary", () => {
  it("lets a guardian read their own child's history", async () => {
    const h = await freshHousehold();
    const detail = await getChildDetail(guardianSession(h.guardianAId), h.child1Id);
    expect(detail?.studentId).toBe(h.child1Id);
  });

  it("blocks a guardian from another household's child", async () => {
    const h = await freshHousehold();
    await expect(getChildDetail(guardianSession(h.guardianBId), h.child1Id)).rejects.toThrow();
  });
});
