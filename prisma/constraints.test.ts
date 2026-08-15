import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { withLedgerAdmin } from "@/server/ledger/admin";

/**
 * Schema-guarantee tests for the structural rules that protect the money and
 * roster integrity story (CLAUDE.md rules 1/4/6). These require a live dev
 * database; if none is reachable the suite is skipped so `npm test` stays
 * green for pure-logic runs. The end-to-end verification step runs with the DB
 * up, so these execute for real there.
 */
const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
  // eslint-disable-next-line no-console
  console.warn("[constraints.test] no database reachable — skipping DB constraint tests");
}

const createdDistrictIds: string[] = [];

afterAll(async () => {
  for (const id of createdDistrictIds) {
    await withLedgerAdmin(prisma, (tx) =>
      tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }),
    );
    await prisma.mealEvent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

async function freshDistrictSchool() {
  const district = await prisma.district.create({
    data: { name: `TEST-${crypto.randomUUID()}` },
  });
  createdDistrictIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "Test School", code: "TST" },
  });
  return { district, school };
}

describe.skipIf(!dbUp)("schema constraints", () => {
  it("enforces unique studentNumber within a district", async () => {
    const { district, school } = await freshDistrictSchool();
    await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        studentNumber: "DUP-1",
        firstName: "A",
        lastName: "One",
        grade: "3",
      },
    });
    await expect(
      prisma.student.create({
        data: {
          districtId: district.id,
          schoolId: school.id,
          studentNumber: "DUP-1",
          firstName: "B",
          lastName: "Two",
          grade: "4",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("prevents a duplicate meal event (student + date + meal type)", async () => {
    const { district, school } = await freshDistrictSchool();
    const student = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        studentNumber: "MEAL-1",
        firstName: "Meal",
        lastName: "Kid",
        grade: "5",
      },
    });
    const serviceDate = new Date("2026-08-12");
    await prisma.mealEvent.create({
      data: { studentId: student.id, schoolId: school.id, serviceDate, mealType: "LUNCH", priceCents: 0 },
    });
    await expect(
      prisma.mealEvent.create({
        data: { studentId: student.id, schoolId: school.id, serviceDate, mealType: "LUNCH", priceCents: 0 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces unique ledger idempotencyKey but allows many nulls", async () => {
    const { district, school } = await freshDistrictSchool();
    const student = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        studentNumber: "LEDG-1",
        firstName: "Ledger",
        lastName: "Kid",
        grade: "2",
        account: { create: { balanceCents: 0 } },
      },
    });
    const account = await prisma.account.findUniqueOrThrow({
      where: { studentId: student.id },
    });

    const key = `idem-${crypto.randomUUID()}`;
    await prisma.ledgerEntry.create({
      data: {
        accountId: account.id,
        type: "DEPOSIT",
        amountCents: 1000,
        description: "first",
        idempotencyKey: key,
        actorType: "SYSTEM",
      },
    });
    // Same key -> rejected (no double credit).
    await expect(
      prisma.ledgerEntry.create({
        data: {
          accountId: account.id,
          type: "DEPOSIT",
          amountCents: 1000,
          description: "retry",
          idempotencyKey: key,
          actorType: "SYSTEM",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Null keys are allowed multiple times.
    await prisma.ledgerEntry.create({
      data: {
        accountId: account.id,
        type: "ADJUSTMENT",
        amountCents: -100,
        description: "no key A",
        actorType: "SYSTEM",
      },
    });
    await expect(
      prisma.ledgerEntry.create({
        data: {
          accountId: account.id,
          type: "ADJUSTMENT",
          amountCents: -100,
          description: "no key B",
          actorType: "SYSTEM",
        },
      }),
    ).resolves.toBeTruthy();
  });
});
