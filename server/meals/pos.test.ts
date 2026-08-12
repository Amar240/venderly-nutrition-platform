import { PrismaClient, type PriceTier } from "@prisma/client";
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { recordMeal } from "./recordMeal";
import { recordItemSale } from "./recordItemSale";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { getBalanceCents } from "@/server/ledger/ledger";
import { resetPosLimiter } from "@/server/pos/rateLimit";
import type { AppSession } from "@/server/auth/types";

/**
 * Phase 4 — POS. Meal/a-la-carte recording, duplicate + wrong-school handling,
 * insufficient-balance denial (reusing the D-7 guard), and — the rule that
 * matters most — that NO tier/price/eligibility ever appears in the result.
 */
const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[pos.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.mealEvent.deleteMany({ where: { student: { districtId: id } } });
    await prisma.itemSale.deleteMany({ where: { student: { districtId: id } } });
    await withLedgerAdmin(prisma, (tx) =>
      tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId: id } } } }),
    );
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.item.deleteMany({ where: { districtId: id } });
    await prisma.pricingConfig.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

beforeEach(() => resetPosLimiter());

interface Fixture {
  session: AppSession;
  districtId: string;
  schoolId: string;
  studentNumber: string;
  itemId: string;
}

async function freshPos(opts?: { balance?: number; cep?: boolean; tier?: PriceTier }): Promise<Fixture> {
  const balance = opts?.balance ?? 5000;
  const cep = opts?.cep ?? true;
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const school = await prisma.school.create({
    data: { districtId: district.id, name: "S", code: `T${Math.random().toString(36).slice(2, 6)}` },
  });
  await prisma.pricingConfig.create({
    data: {
      districtId: district.id,
      schoolId: null,
      cepEnabled: cep,
      breakfastPaidCents: 200,
      lunchPaidCents: 325,
      breakfastReducedCents: 30,
      lunchReducedCents: 40,
      lowBalanceThresholdCents: 1000,
    },
  });
  const studentNumber = `S-${crypto.randomUUID()}`;
  const student = await prisma.student.create({
    data: {
      districtId: district.id,
      schoolId: school.id,
      studentNumber,
      firstName: "Pat",
      lastName: "Kid",
      grade: "3",
      account: { create: { balanceCents: balance } },
      pricing: { create: { tier: opts?.tier ?? "FREE", source: "DEFAULT" } },
    },
  });
  if (balance !== 0) {
    const account = await prisma.account.findUniqueOrThrow({ where: { studentId: student.id } });
    await prisma.ledgerEntry.create({
      data: { accountId: account.id, type: "DEPOSIT", amountCents: balance, description: "opening", actorType: "SYSTEM" },
    });
  }
  const item = await prisma.item.create({
    data: { districtId: district.id, name: "Cookie", priceCents: 150 },
  });
  const session: AppSession = {
    principalType: "staff",
    userId: `cashier-${crypto.randomUUID()}`,
    role: "CASHIER",
    districtId: district.id,
    schoolIds: [school.id],
  };
  return { session, districtId: district.id, schoolId: school.id, studentNumber, itemId: item.id };
}

describe.skipIf(!dbUp)("recordMeal", () => {
  it("records a meal and returns only operational + display fields", async () => {
    const f = await freshPos();
    const r = await recordMeal({ studentNumber: f.studentNumber, mealType: "LUNCH", session: f.session });
    expect(r.status).toBe("recorded");
    if (r.status === "recorded") {
      expect(r.studentName).toBe("Pat Kid");
      expect(r.grade).toBe("3");
    }
  });

  it("returns duplicate on the same student + meal + day, recording nothing new", async () => {
    const f = await freshPos();
    await recordMeal({ studentNumber: f.studentNumber, mealType: "BREAKFAST", session: f.session });
    const again = await recordMeal({ studentNumber: f.studentNumber, mealType: "BREAKFAST", session: f.session });
    expect(again.status).toBe("duplicate");
    const count = await prisma.mealEvent.count({ where: { student: { districtId: f.districtId }, mealType: "BREAKFAST" } });
    expect(count).toBe(1);
  });

  it("returns not_active_at_school for a student outside the cashier's school scope", async () => {
    const f = await freshPos();
    // A second school + student the cashier is NOT assigned to.
    const otherSchool = await prisma.school.create({
      data: { districtId: f.districtId, name: "Other", code: `O${Math.random().toString(36).slice(2, 6)}` },
    });
    const otherNumber = `X-${crypto.randomUUID()}`;
    await prisma.student.create({
      data: {
        districtId: f.districtId,
        schoolId: otherSchool.id,
        studentNumber: otherNumber,
        firstName: "Off",
        lastName: "Site",
        grade: "4",
        account: { create: { balanceCents: 0 } },
      },
    });
    const r = await recordMeal({ studentNumber: otherNumber, mealType: "LUNCH", session: f.session });
    expect(r.status).toBe("not_active_at_school");
  });

  it("returns not_active_at_school for an unknown student number (no existence leak)", async () => {
    const f = await freshPos();
    const r = await recordMeal({ studentNumber: "does-not-exist", mealType: "LUNCH", session: f.session });
    expect(r.status).toBe("not_active_at_school");
  });
});

describe.skipIf(!dbUp)("eligibility confidentiality (the rule that matters most)", () => {
  it("a PAID-tier recorded meal exposes NO tier/price/eligibility field", async () => {
    // Non-CEP + PAID tier means a real, non-zero price is computed internally.
    const f = await freshPos({ cep: false, tier: "PAID", balance: 5000 });
    const r = await recordMeal({ studentNumber: f.studentNumber, mealType: "LUNCH", session: f.session });
    expect(r.status).toBe("recorded");

    const keys = Object.keys(r).sort();
    expect(keys).toEqual(["grade", "schoolName", "status", "studentName"]);
    const forbidden = ["tier", "priceTier", "price", "priceCents", "amountCents", "eligibility", "category"];
    const serialized = JSON.stringify(r).toLowerCase();
    for (const bad of forbidden) {
      expect(keys).not.toContain(bad);
      expect(serialized).not.toContain(bad.toLowerCase());
    }
    // The meal WAS charged internally (proves a price existed but never surfaced).
    const account = await prisma.account.findFirstOrThrow({ where: { student: { districtId: f.districtId } } });
    expect(account.balanceCents).toBe(5000 - 325);
  });

  it("an a-la-carte result exposes only status + studentName", async () => {
    const f = await freshPos({ balance: 5000 });
    const r = await recordItemSale({ studentNumber: f.studentNumber, itemId: f.itemId, session: f.session });
    expect(Object.keys(r).sort()).toEqual(["status", "studentName"]);
  });
});

describe.skipIf(!dbUp)("recordItemSale (a-la-carte, reuses the D-7 guard)", () => {
  it("records a sale, capturing price at time of purchase", async () => {
    const f = await freshPos({ balance: 5000 });
    const r = await recordItemSale({ studentNumber: f.studentNumber, itemId: f.itemId, session: f.session });
    expect(r.status).toBe("recorded");
    const sale = await prisma.itemSale.findFirstOrThrow({ where: { student: { districtId: f.districtId } } });
    expect(sale.priceCentsAtSale).toBe(150);
    const account = await prisma.account.findFirstOrThrow({ where: { student: { districtId: f.districtId } } });
    expect(account.balanceCents).toBe(4850);
  });

  it("denies a purchase below zero, writing nothing", async () => {
    const f = await freshPos({ balance: 100 }); // item is 150
    const r = await recordItemSale({ studentNumber: f.studentNumber, itemId: f.itemId, session: f.session });
    expect(r.status).toBe("insufficient_balance");
    const sales = await prisma.itemSale.count({ where: { student: { districtId: f.districtId } } });
    expect(sales).toBe(0);
    const account = await prisma.account.findFirstOrThrow({ where: { student: { districtId: f.districtId } } });
    expect(account.balanceCents).toBe(100); // untouched
  });

  it("two concurrent purchases that together exceed balance → one recorded, one denied, never negative", async () => {
    const f = await freshPos({ balance: 150 }); // exactly one $1.50 item
    const buy = () => recordItemSale({ studentNumber: f.studentNumber, itemId: f.itemId, session: f.session });
    const results = await Promise.all([buy(), buy()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["insufficient_balance", "recorded"]);
    const account = await prisma.account.findFirstOrThrow({ where: { student: { districtId: f.districtId } } });
    expect(account.balanceCents).toBe(0);
    expect(account.balanceCents).toBeGreaterThanOrEqual(0);
  });
});
