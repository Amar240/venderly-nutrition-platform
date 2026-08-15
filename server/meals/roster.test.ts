import { PrismaClient, type PriceTier } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import type { AppSession } from "@/server/auth/types";
import { withLedgerAdmin } from "@/server/ledger/admin";
import { getBalanceCents } from "@/server/ledger/ledger";
import { districtToday } from "@/server/time/district";
import { countServedMeals } from "./mealCounts";
import { recordMeal } from "./recordMeal";
import { undoLastMealEntry } from "./undoMealEntry";
import { getRosterGroup, listRosterClasses, recordRosterBatch } from "./roster";

const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[roster.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const districtId of districtIds) {
    await prisma.mealEvent.deleteMany({ where: { student: { districtId } } });
    await prisma.auditLog.deleteMany({ where: { districtId } });
    await withLedgerAdmin(prisma, (tx) => tx.ledgerEntry.deleteMany({ where: { account: { student: { districtId } } } }));
    await prisma.account.deleteMany({ where: { student: { districtId } } });
    await prisma.student.deleteMany({ where: { districtId } });
    await prisma.classroom.deleteMany({ where: { school: { districtId } } });
    await prisma.pricingConfig.deleteMany({ where: { districtId } });
    await prisma.userSchool.deleteMany({ where: { user: { districtId } } });
    await prisma.user.deleteMany({ where: { districtId } });
    await prisma.school.deleteMany({ where: { districtId } });
    await prisma.district.deleteMany({ where: { id: districtId } });
  }
  await prisma.$disconnect();
});

async function fixture(opts: { cep?: boolean } = {}) {
  const district = await prisma.district.create({ data: { name: `ROSTER-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const [school, otherSchool] = await Promise.all([
    prisma.school.create({ data: { districtId: district.id, name: "Roster Elementary", code: `R${crypto.randomUUID()}` } }),
    prisma.school.create({ data: { districtId: district.id, name: "Other School", code: `O${crypto.randomUUID()}` } }),
  ]);
  await prisma.pricingConfig.create({
    data: {
      districtId: district.id,
      schoolId: null,
      cepEnabled: opts.cep ?? true,
      breakfastPaidCents: 200,
      breakfastReducedCents: 30,
      lunchPaidCents: 325,
      lunchReducedCents: 40,
      lowBalanceThresholdCents: 1000,
      lowBalanceMealsThreshold: 5,
    },
  });
  const [classroom, inactiveClassroom] = await Promise.all([
    prisma.classroom.create({ data: { schoolId: school.id, teacherName: "Priya Shah", grade: "3" } }),
    prisma.classroom.create({ data: { schoolId: school.id, teacherName: "Retired Teacher", grade: "3", active: false } }),
  ]);
  const cashier = await prisma.user.create({
    data: {
      email: `cashier-${crypto.randomUUID()}@test.invalid`,
      passwordHash: "x",
      firstName: "Casey",
      lastName: "Cashier",
      role: "CASHIER",
      districtId: district.id,
      schools: { create: { schoolId: school.id } },
    },
  });
  const session: AppSession = {
    principalType: "staff",
    userId: cashier.id,
    role: "CASHIER",
    districtId: district.id,
    schoolIds: [school.id],
  };

  async function student(input: {
    firstName: string;
    lastName: string;
    classroomId?: string | null;
    tier?: PriceTier;
  }) {
    const created = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: school.id,
        classroomId: input.classroomId === undefined ? classroom.id : input.classroomId,
        studentNumber: `S-${crypto.randomUUID()}`,
        firstName: input.firstName,
        lastName: input.lastName,
        grade: "3",
        account: { create: { balanceCents: 5000 } },
        pricing: { create: { tier: input.tier ?? "FREE", source: "DEFAULT" } },
      },
      include: { account: true },
    });
    await prisma.ledgerEntry.create({
      data: {
        accountId: created.account!.id,
        type: "DEPOSIT",
        amountCents: 5000,
        description: "opening",
        actorType: "SYSTEM",
      },
    });
    return created;
  }

  return { district, school, otherSchool, classroom, inactiveClassroom, cashier, session, student };
}

describe.skipIf(!dbUp)("roster read model", () => {
  it("shows only first name and last initial and shares the live normal-meal definition", async () => {
    const f = await fixture();
    const [live, overrideOnly, reversed, unassigned, inactiveLinked] = await Promise.all([
      f.student({ firstName: "Nora", lastName: "Bell" }),
      f.student({ firstName: "Maya", lastName: "Santos" }),
      f.student({ firstName: "Leo", lastName: "Hernandez" }),
      f.student({ firstName: "Amina", lastName: "Cole", classroomId: null }),
      f.student({ firstName: "Isaac", lastName: "Williams", classroomId: f.inactiveClassroom.id }),
    ]);
    const serviceDate = await districtToday(f.district.id);
    await prisma.mealEvent.create({ data: { studentId: live.id, schoolId: f.school.id, serviceDate, mealType: "LUNCH", priceCents: 0 } });
    await prisma.mealEvent.create({ data: { studentId: overrideOnly.id, schoolId: f.school.id, serviceDate, mealType: "LUNCH", priceCents: 0, overrideSeq: 1, overrideReason: "test" } });
    await prisma.mealEvent.create({ data: { studentId: reversed.id, schoolId: f.school.id, serviceDate, mealType: "LUNCH", priceCents: 0, reversedAt: new Date(), reversedByUserId: f.cashier.id } });

    const options = await listRosterClasses(f.session);
    expect(options.map((option) => option.teacherName)).toEqual(["Priya Shah", "Needs class assignment"]);
    const group = await getRosterGroup(f.session, { mealType: "LUNCH", groupKey: `classroom:${f.classroom.id}` });
    expect(group?.students).toEqual(expect.arrayContaining([
      expect.objectContaining({ firstName: "Nora", lastInitial: "B.", alreadyRecorded: true }),
      expect.objectContaining({ firstName: "Maya", lastInitial: "S.", alreadyRecorded: false }),
      expect.objectContaining({ firstName: "Leo", lastInitial: "H.", alreadyRecorded: false }),
    ]));
    const serialized = JSON.stringify(group);
    for (const forbidden of ["Bell", "Santos", "studentNumber", "priceCents", "tier", "account"]) {
      expect(serialized).not.toContain(forbidden);
    }

    const needs = options.find((option) => option.needsAssignment)!;
    const needsGroup = await getRosterGroup(f.session, { mealType: "LUNCH", groupKey: needs.groupKey });
    expect(new Set(needsGroup?.students.map((student) => student.firstName))).toEqual(new Set([unassigned.firstName, inactiveLinked.firstName]));
  });
});

describe.skipIf(!dbUp)("atomic roster recording", () => {
  it("records and undoes a whole CEP batch through the existing undo service", async () => {
    const f = await fixture({ cep: true });
    const [first, second] = await Promise.all([
      f.student({ firstName: "Ari", lastName: "Alpha" }),
      f.student({ firstName: "Zoe", lastName: "Zulu" }),
    ]);
    const result = await recordRosterBatch({
      session: f.session,
      mealType: "BREAKFAST",
      groupKey: `classroom:${f.classroom.id}`,
      studentIds: [first.id, second.id],
    });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") return;
    const events = await prisma.mealEvent.findMany({ where: { recordingBatchId: result.undo.batchId } });
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.recordingBatchId))).toEqual(new Set([result.undo.batchId]));
    expect(await prisma.ledgerEntry.count({ where: { account: { studentId: { in: [first.id, second.id] } }, type: "MEAL_CHARGE" } })).toBe(0);

    const undone = await undoLastMealEntry({ batchId: result.undo.batchId, session: f.session });
    expect(undone).toMatchObject({ status: "undone", mealType: "BREAKFAST" });
    expect(await countServedMeals({ studentId: { in: [first.id, second.id] }, mealType: "BREAKFAST" })).toBe(0);
    expect(await prisma.auditLog.count({ where: { districtId: f.district.id, action: "MEAL_ENTRY_UNDONE" } })).toBe(2);

    const rerecorded = await recordRosterBatch({
      session: f.session,
      mealType: "BREAKFAST",
      groupKey: `classroom:${f.classroom.id}`,
      studentIds: [first.id, second.id],
    });
    expect(rerecorded.status).toBe("recorded");
    expect(await countServedMeals({ studentId: { in: [first.id, second.id] }, mealType: "BREAKFAST" })).toBe(2);
  });

  it("prices each student internally, updates money, and exposes no protected inputs", async () => {
    const f = await fixture({ cep: false });
    const [paid, reduced] = await Promise.all([
      f.student({ firstName: "Paid", lastName: "Student", tier: "PAID" }),
      f.student({ firstName: "Reduced", lastName: "Student", tier: "REDUCED" }),
    ]);
    const result = await recordRosterBatch({
      session: f.session,
      mealType: "LUNCH",
      groupKey: `classroom:${f.classroom.id}`,
      studentIds: [paid.id, reduced.id],
    });
    expect(result.status).toBe("recorded");
    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of ["paid", "reduced", "tier", "price", "amountcents", "eligibility"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(await getBalanceCents(paid.account!.id)).toBe(4675);
    expect(await getBalanceCents(reduced.account!.id)).toBe(4960);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: paid.account!.id } })).balanceCents).toBe(4675);

    if (result.status === "recorded") await undoLastMealEntry({ batchId: result.undo.batchId, session: f.session });
    expect(await getBalanceCents(paid.account!.id)).toBe(5000);
    expect(await getBalanceCents(reduced.account!.id)).toBe(5000);
  });

  it("rolls back earlier children and names the child whose write failed", async () => {
    const f = await fixture({ cep: false });
    const [first, second] = await Promise.all([
      f.student({ firstName: "Ari", lastName: "Alpha", tier: "PAID" }),
      f.student({ firstName: "Zoe", lastName: "Zulu", tier: "PAID" }),
    ]);
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const fn = `reject_roster_meal_${suffix}`;
    const trigger = `reject_roster_meal_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN IF NEW."studentId" = '${second.id}' THEN RAISE EXCEPTION 'forced roster failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "MealEvent" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
    try {
      const result = await recordRosterBatch({ session: f.session, mealType: "LUNCH", groupKey: `classroom:${f.classroom.id}`, studentIds: [first.id, second.id] });
      expect(result).toMatchObject({ status: "student_failed", studentName: "Zoe Z.", reason: "could_not_record" });
      expect(await prisma.mealEvent.count({ where: { studentId: { in: [first.id, second.id] } } })).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { account: { studentId: { in: [first.id, second.id] } }, type: "MEAL_CHARGE" } })).toBe(0);
      expect(await getBalanceCents(first.account!.id)).toBe(5000);
      expect((await prisma.account.findUniqueOrThrow({ where: { id: first.account!.id } })).balanceCents).toBe(5000);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "MealEvent"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });

  it("allows keypad or roster to win a race but never both", async () => {
    const f = await fixture();
    const student = await f.student({ firstName: "Nora", lastName: "Bell" });
    const [keypad, roster] = await Promise.all([
      recordMeal({ studentNumber: student.studentNumber, mealType: "LUNCH", session: f.session }),
      recordRosterBatch({ session: f.session, mealType: "LUNCH", groupKey: `classroom:${f.classroom.id}`, studentIds: [student.id] }),
    ]);
    const successes = [keypad.status, roster.status].filter((status) => status === "recorded");
    expect(successes).toHaveLength(1);
    expect(await countServedMeals({ studentId: student.id, mealType: "LUNCH" })).toBe(1);
  });

  it("rolls back when a selected student changed classes and returns safe guidance", async () => {
    const f = await fixture();
    const [first, moved] = await Promise.all([
      f.student({ firstName: "Ari", lastName: "Alpha" }),
      f.student({ firstName: "Nora", lastName: "Bell", classroomId: null }),
    ]);
    const result = await recordRosterBatch({ session: f.session, mealType: "LUNCH", groupKey: `classroom:${f.classroom.id}`, studentIds: [first.id, moved.id] });
    expect(result).toMatchObject({ status: "student_failed", studentName: "Nora B.", reason: "class_changed" });
    expect(await prisma.mealEvent.count({ where: { studentId: { in: [first.id, moved.id] } } })).toBe(0);
  });
});
