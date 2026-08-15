import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { recordDeposit, getBalanceCents } from "@/server/ledger/ledger";
import {
  commitSituationCorrection,
  completeWrongStudentFollowUp,
  getCorrectionPanelModel,
  reviewSituationCorrection,
} from "./situationCorrections";
import type { AppSession } from "@/server/auth/types";

const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[situationCorrections.test] no database reachable - skipping");
}

const districtIds: string[] = [];

afterAll(async () => {
  for (const id of districtIds) {
    await prisma.correctionCase.deleteMany({ where: { student: { districtId: id } } });
    await prisma.auditLog.deleteMany({ where: { districtId: id } });
    await prisma.itemSale.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) =>
      tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }),
    );
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.item.deleteMany({ where: { districtId: id } });
    await prisma.userSchool.deleteMany({ where: { school: { districtId: id } } });
    await prisma.user.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

async function fresh() {
  const district = await prisma.district.create({ data: { name: `CORR-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "Wheatley", code: `W${crypto.randomUUID().slice(0, 6)}` },
  });
  await prisma.pricingConfig.create({ data: { districtId: district.id, schoolId: null } });
  const admin = await prisma.user.create({
    data: {
      email: `admin-${crypto.randomUUID()}@test.invalid`,
      passwordHash: "x",
      firstName: "Admin",
      lastName: "User",
      role: "DISTRICT_ADMIN",
      districtId: district.id,
      schools: { create: { schoolId: school.id } },
    },
  });
  const session: AppSession = {
    principalType: "staff",
    userId: admin.id,
    role: "DISTRICT_ADMIN",
    districtId: district.id,
    schoolIds: [school.id],
  };
  const item = await prisma.item.create({
    data: { districtId: district.id, name: "Cookie", priceCents: 125 },
  });

  async function student(num: string, balanceCents: number) {
    const s = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        studentNumber: num,
        firstName: `Kid${num}`,
        lastName: "Test",
        grade: "3",
        account: { create: { balanceCents } },
        pricing: { create: { tier: "FREE", source: "DEFAULT" } },
      },
    });
    const account = await prisma.account.findUniqueOrThrow({ where: { studentId: s.id } });
    if (balanceCents > 0) {
      await prisma.ledgerEntry.create({
        data: { accountId: account.id, type: "DEPOSIT", amountCents: balanceCents, description: "opening", actorType: "SYSTEM" },
      });
    }
    return { ...s, accountId: account.id };
  }

  async function snack(studentId: string, accountId: string) {
    const entry = await prisma.ledgerEntry.create({
      data: {
        accountId,
        type: "ALACARTE_CHARGE",
        amountCents: -125,
        description: "Cookie",
        actorType: "SYSTEM",
      },
    });
    await prisma.itemSale.create({
      data: { itemId: item.id, studentId, priceCentsAtSale: 125, ledgerEntryId: entry.id },
    });
    return entry;
  }

  const a = await student(`A-${crypto.randomUUID()}`, 500);
  const b = await student(`B-${crypto.randomUUID()}`, 0);
  return { district, school, admin, session, item, a, b, snack };
}

describe.skipIf(!dbUp)("situation-first corrections", () => {
  it("reviews and records a returned snack as a linked give-back case", async () => {
    const f = await fresh();
    const charge = await f.snack(f.a.id, f.a.accountId);

    const review = await reviewSituationCorrection(f.session, {
      studentId: f.a.id,
      situation: "SNACK_RETURNED",
      originalEntryId: charge.id,
    });
    expect(review.ok && review.confirmLabel).toBe("Give back $1.25");

    const result = await commitSituationCorrection(f.session, {
      studentId: f.a.id,
      situation: "SNACK_RETURNED",
      originalEntryId: charge.id,
      reason: "Snack was returned",
    });
    expect(result.ok).toBe(true);
    expect(await getBalanceCents(f.a.accountId)).toBe(500);

    const rows = await prisma.ledgerEntry.findMany({ where: { accountId: f.a.accountId }, orderBy: { createdAt: "asc" } });
    expect(rows.map((row) => row.amountCents)).toEqual([500, -125, 125]);
    expect(rows[2]?.correctsEntryId).toBe(charge.id);
    const caseRecord = await prisma.correctionCase.findUnique({ where: { originalEntryId: charge.id } });
    expect(caseRecord?.status).toBe("COMPLETED");

    const model = await getCorrectionPanelModel(f.session, f.a.id);
    expect(model.snackCharges.map((item) => item.id)).not.toContain(charge.id);
  });

  it("computes a signed difference for a charge whose amount should have been lower", async () => {
    const f = await fresh();
    const charge = await f.snack(f.a.id, f.a.accountId);

    const review = await reviewSituationCorrection(f.session, {
      studentId: f.a.id,
      situation: "SOMETHING_ELSE",
      originalEntryId: charge.id,
      expectedAmount: "1.00",
    });
    expect(review.ok && review.confirmLabel).toBe("Give back $0.25");

    const result = await commitSituationCorrection(f.session, {
      studentId: f.a.id,
      situation: "SOMETHING_ELSE",
      originalEntryId: charge.id,
      expectedAmount: "1.00",
      reason: "Snack amount was reviewed",
    });
    expect(result.ok).toBe(true);
    const fix = await prisma.ledgerEntry.findFirst({ where: { correctsEntryId: charge.id } });
    expect(fix?.amountCents).toBe(25);
    expect(fix?.type).toBe("ADJUSTMENT");
  });

  it("keeps the refund when the correct student cannot be charged, then completes the same case later", async () => {
    const f = await fresh();
    const charge = await f.snack(f.a.id, f.a.accountId);

    const partial = await commitSituationCorrection(f.session, {
      studentId: f.a.id,
      situation: "WRONG_STUDENT",
      originalEntryId: charge.id,
      targetStudentNumber: f.b.studentNumber,
      reason: "Wrong student charged",
    });
    expect(partial.ok).toBe(true);
    expect(await getBalanceCents(f.a.accountId)).toBe(500);
    expect(await getBalanceCents(f.b.accountId)).toBe(0);

    const caseRecord = await prisma.correctionCase.findUniqueOrThrow({ where: { originalEntryId: charge.id } });
    expect(caseRecord.status).toBe("FOLLOW_UP_REQUIRED");
    expect(caseRecord.refundEntryId).toBeTruthy();
    expect(caseRecord.chargeEntryId).toBeNull();

    await recordDeposit({
      studentId: f.b.id,
      amountCents: 200,
      idempotencyKey: `test:${crypto.randomUUID()}`,
      actor: { actorType: "SYSTEM" },
      description: "test money",
    });

    const finished = await completeWrongStudentFollowUp(f.session, caseRecord.id);
    expect(finished.ok).toBe(true);
    expect(await getBalanceCents(f.b.accountId)).toBe(75);
    const completed = await prisma.correctionCase.findUniqueOrThrow({ where: { id: caseRecord.id } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.refundEntryId).toBe(caseRecord.refundEntryId);
    expect(completed.chargeEntryId).toBeTruthy();
  });

  it("rejects an unchanged something-else amount", async () => {
    const f = await fresh();
    const charge = await f.snack(f.a.id, f.a.accountId);
    const review = await reviewSituationCorrection(f.session, {
      studentId: f.a.id,
      situation: "SOMETHING_ELSE",
      originalEntryId: charge.id,
      expectedAmount: "1.25",
    });
    expect(review.ok).toBe(false);
    expect(!review.ok && review.error).toContain("already matches");
  });
});
