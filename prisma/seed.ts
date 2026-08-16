/**
 * Synthetic seed — idempotent (full reset + reload). Produces:
 *  - 1 district, 6 real Woodbridge schools with proportional synthetic enrollment
 *  - 200 students in multi-child households with differing surnames
 *  - guardians linked via GuardianStudent, accounts with varied balances
 *    (balances derive from opening ledger entries; cached balanceCents matches)
 *  - four evaluator sign-ins; staff pre-enrolled with a TOTP secret
 *  - free meals on, with synthetic fallback prices ready for the CEP-off demo
 *
 * All data is synthetic. No real student information (CLAUDE.md).
 * Imports concrete packages (not "@/" aliases) so it runs under tsx directly.
 */
import {
  Prisma,
  PrismaClient,
  type ActorType,
  type LedgerEntryType,
  type MealType,
  type Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { setUserDisabled } from "../server/config/users";
import { withLedgerAdmin } from "../server/ledger/admin";
import { deriveBalanceCents, recordAdjustment } from "../server/ledger/ledger";
import { countServedMeals } from "../server/meals/mealCounts";
import { editCheckReport } from "../server/reports/editCheck";
import { districtToday } from "../server/time/district";
import {
  addUtcDays,
  buildMealHistoryCalendar,
  buildRemainingSchoolSlots,
  buildStudentPricingRows,
  classroomTeacherForPosition,
  dailyParticipationPercent,
  dateKey,
  DEMO_STUDENT_COUNT,
  MEAL_HISTORY_SEED,
  orderStudentsForMeal,
  participationTarget,
  mulberry32,
  WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS,
  WOODBRIDGE_IDENTIFIED_STUDENT_PERCENTAGE_BPS,
  WOODBRIDGE_CLASSROOMS,
  WOODBRIDGE_MEAL_PARTICIPATION,
  WOODBRIDGE_SEED_SCHOOLS,
} from "./seed-data";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1";
const STAFF_TOTP_ENV: Partial<Record<Role, string | undefined>> = {
  CASHIER: process.env.SEED_TOTP_CASHIER,
  SCHOOL_STAFF: process.env.SEED_TOTP_SCHOOL_STAFF,
  DISTRICT_ADMIN: process.env.SEED_TOTP_DISTRICT_ADMIN,
  SUPER_ADMIN: process.env.SEED_TOTP_SUPER_ADMIN,
};
const EVALUATOR_STAFF_LABELS: Record<string, string> = {
  "cashier@woodbridge.demo": "Cashier",
  "districtadmin@woodbridge.demo": "Staff",
  "superadmin@woodbridge.demo": "Super admin",
};

// --- deterministic RNG so reloads reproduce the same dataset ---------------
const rng = mulberry32(20260812);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
const randint = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
const WOODBRIDGE_TIME_ZONE = "America/New_York";
const BREAKFAST_END_MINUTES = 9 * 60;
const LUNCH_END_MINUTES = 13 * 60;

const FIRST_NAMES = [
  "Ava", "Liam", "Sofia", "Noah", "Mia", "Ethan", "Isabella", "Mason",
  "Amara", "Lucas", "Priya", "Elijah", "Zoe", "Diego", "Layla", "Omar",
  "Nina", "Kai", "Harper", "Malik", "Chloe", "Aarav", "Grace", "Mateo",
  "Ruby", "Ibrahim", "Elena", "Jonah", "Aisha", "Leo", "Fatima", "Wyatt",
  "Naomi", "Andre", "Talia", "Hugo", "Maya", "Santiago", "Nora", "Yusuf",
];
const LAST_NAMES = [
  "Nguyen", "Patel", "Johnson", "Garcia", "Okafor", "Kim", "Rossi",
  "Hernandez", "Cohen", "Ahmed", "Williams", "Silva", "Martin", "Khan",
  "Brooks", "Torres", "Rivera", "Bauer", "Osei", "Delgado", "Ford",
  "Petrov", "Nakamura", "Flores", "Abbott", "Reyes", "Haddad", "Long",
];

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function reset() {
  // Delete in FK-safe order.
  await prisma.correctionCase.deleteMany();
  await prisma.itemSale.deleteMany();
  await prisma.mealEvent.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.automaticTopUpRun.deleteMany();
  await prisma.automaticTopUpRule.deleteMany();
  // LedgerEntry is append-only at the DB level; clear it via the admin escape.
  await withLedgerAdmin(prisma, (tx) => tx.ledgerEntry.deleteMany());
  await prisma.account.deleteMany();
  await prisma.guardianStudent.deleteMany();
  await prisma.item.deleteMany();
  await prisma.pricingConfig.deleteMany();
  await prisma.importRun.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.userSchool.deleteMany();
  await prisma.user.deleteMany();
  await prisma.student.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.school.deleteMany();
  await prisma.district.deleteMany();
}

let studentSeq = 100000;
function nextStudentNumber() {
  studentSeq += 1;
  return String(studentSeq);
}

interface CreatedStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  grade: string;
}

async function createStudentWithAccount(
  districtId: string,
  school: { id: string; grades: string[] },
  lastNameHint: string | null,
  balanceCents: number,
): Promise<CreatedStudent> {
  const firstName = pick(FIRST_NAMES);
  // Differing surnames: ~30% of household children use a different last name.
  const lastName =
    lastNameHint && rng() < 0.7 ? lastNameHint : pick(LAST_NAMES);
  const grade = pick(school.grades);
  const studentNumber = nextStudentNumber();
  // Leaving-students demo fixture: the deterministic roster contains 12 grade-
  // 12 students holding $235.24 in total, with each amount from $3 through $40.
  // Mapping the already selected amount avoids consuming the student RNG
  // differently or rewriting money after creation.
  const openingBalanceCents = grade === "12"
    ? 300 + (Math.abs(balanceCents) % 3701)
    : balanceCents;

  const student = await prisma.student.create({
    data: {
      districtId,
      schoolId: school.id,
      studentNumber,
      firstName,
      lastName,
      grade,
      enrollmentStatus: "ACTIVE",
      account: { create: { balanceCents: openingBalanceCents } },
    },
  });

  // Opening balance as ledger entries so balance is ledger-derived.
  const account = await prisma.account.findUniqueOrThrow({
    where: { studentId: student.id },
  });
  const entries: {
    type: LedgerEntryType;
    amountCents: number;
    description: string;
    actorType: ActorType;
  }[] = [];
  if (openingBalanceCents >= 0) {
    entries.push({
      type: "DEPOSIT",
      amountCents: openingBalanceCents,
      description: "Opening snack money (synthetic)",
      actorType: "SYSTEM",
    });
  } else {
    // Model a negative balance as a deposit followed by an a-la-carte debit.
    entries.push({
      type: "DEPOSIT",
      amountCents: 500,
      description: "Opening snack money (synthetic)",
      actorType: "SYSTEM",
    });
    entries.push({
      type: "ALACARTE_CHARGE",
      amountCents: openingBalanceCents - 500,
      description: "A-la-carte purchases (synthetic)",
      actorType: "SYSTEM",
    });
  }
  for (const e of entries) {
    await prisma.ledgerEntry.create({ data: { accountId: account.id, ...e } });
  }

  return { id: student.id, firstName, lastName, studentNumber, grade };
}

function pickBalanceCents(): number {
  const r = rng();
  if (r < 0.05) return -randint(150, 800); // negative — danger pill
  if (r < 0.2) return randint(0, 900); // low — warn pill
  return randint(1200, 8000); // healthy
}

interface SeedSchool {
  id: string;
  name: string;
  code: string;
}

interface SeedStudentRow {
  id: string;
  schoolId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  grade: string;
  account: { id: string; balanceCents: number } | null;
  school: { code: string; name: string };
}

interface DeepHistoryFixture {
  today: Date;
  operatingDays: Date[];
  closureDays: Date[];
  recentOperatingDays: Date[];
  breachDate: Date;
  stoppedStudentIds: string[];
  snackStudentIds: string[];
  snackLedgerEntriesBefore: number;
  snackPurchasesCreated: number;
  mealLedgerEntriesBefore: number;
  mealLedgerEntriesAfter: number;
}

function assertSeed(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Seed assertion failed: ${message}`);
}

function mealKey(studentId: string, serviceDate: Date, mealType: MealType): string {
  return `${studentId}|${dateKey(serviceDate)}|${mealType}`;
}

function historicalRecordedAt(
  serviceDate: Date,
  mealType: MealType,
  studentNumber: string,
): Date {
  const baseHourUtc = mealType === "BREAKFAST" ? 12 : 16;
  const minute = Number(studentNumber.slice(-2)) % 50;
  return new Date(Date.UTC(
    serviceDate.getUTCFullYear(),
    serviceDate.getUTCMonth(),
    serviceDate.getUTCDate(),
    baseHourUtc,
    minute,
  ));
}

async function seedDeepHistory(input: {
  districtId: string;
  schools: SeedSchool[];
  cashierUserId: string;
  districtAdminUserId: string;
  superAdminUserId: string;
  demoChildAId: string;
  demoChildBId: string;
  items: { id: string; name: string; priceCents: number }[];
}): Promise<DeepHistoryFixture> {
  const today = await districtToday(input.districtId);
  const { operatingDays, closureDays } = buildMealHistoryCalendar(today);
  assertSeed(operatingDays.length >= 5, "meal history needs at least five operating days");
  const recentOperatingDays = operatingDays.slice(-5);
  const earlierOperatingDays = operatingDays.slice(0, -5);
  const breachDate = operatingDays.at(-1)!;
  const breachDateKey = dateKey(breachDate);
  const todayKey = dateKey(today);

  const students = (await prisma.student.findMany({
    where: { districtId: input.districtId, enrollmentStatus: "ACTIVE" },
    select: {
      id: true,
      schoolId: true,
      studentNumber: true,
      firstName: true,
      lastName: true,
      grade: true,
      account: { select: { id: true, balanceCents: true } },
      school: { select: { code: true, name: true } },
    },
    orderBy: { studentNumber: "asc" },
  })) satisfies SeedStudentRow[];
  const studentsBySchool = new Map<string, SeedStudentRow[]>();
  for (const school of input.schools) {
    studentsBySchool.set(
      school.code,
      students.filter((student) => student.schoolId === school.id),
    );
  }

  const protectedNumbers = new Set([
    "100001", "100002", "100003", "100004", "100005", "100006", "100007",
  ]);

  // Welfare-signal fixture: exactly seven students across three schools ate
  // consistently earlier in the period and have no records on the last five
  // operating days. Marcus is deliberately excluded because his guardian card
  // demonstrates a different, settled 3-of-5 pattern.
  const stoppedPlan = [
    { schoolCode: "7760", count: 2 },
    { schoolCode: "0779", count: 2 },
    { schoolCode: "0780", count: 3 },
  ];
  const stoppedStudents = stoppedPlan.flatMap(({ schoolCode, count }) => {
    const candidates = (studentsBySchool.get(schoolCode) ?? []).filter(
      (student) => !protectedNumbers.has(student.studentNumber) && student.grade !== "12",
    );
    return orderStudentsForMeal(candidates, {
      schoolCode,
      serviceDate: operatingDays[0]!,
      mealType: "LUNCH",
      purpose: "stopped-eating",
    }).slice(0, count);
  });
  assertSeed(stoppedStudents.length === 7, "exactly seven stopped-eating students must be selected");
  const stoppedIds = new Set(stoppedStudents.map((student) => student.id));

  const mealRows = new Map<string, Prisma.MealEventCreateManyInput>();
  const putMeal = (student: SeedStudentRow, serviceDate: Date, mealType: MealType) => {
    mealRows.set(mealKey(student.id, serviceDate, mealType), {
      studentId: student.id,
      schoolId: student.schoolId,
      serviceDate,
      mealType,
      priceCents: 0,
      overrideSeq: 0,
      createdAt: historicalRecordedAt(serviceDate, mealType, student.studentNumber),
    });
  };

  const recentKeys = new Set(recentOperatingDays.map(dateKey));
  for (const serviceDate of operatingDays) {
    for (const school of input.schools) {
      const rate = WOODBRIDGE_MEAL_PARTICIPATION[school.code];
      const schoolStudents = studentsBySchool.get(school.code) ?? [];
      assertSeed(rate, `participation rates must exist for school ${school.code}`);
      const ceiling = Math.floor(
        (schoolStudents.length * WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS) / 10_000,
      );

      for (const mealType of ["BREAKFAST", "LUNCH"] as const) {
        if (
          school.code === "7750" &&
          mealType === "LUNCH" &&
          dateKey(serviceDate) === breachDateKey
        ) {
          continue;
        }
        const basePercent = mealType === "BREAKFAST"
          ? rate.breakfastPercent
          : rate.lunchPercent;
        const percent = dailyParticipationPercent({
          basePercent,
          schoolCode: school.code,
          serviceDate,
          mealType,
        });
        const target = participationTarget(schoolStudents.length, percent, ceiling);
        const candidates = schoolStudents.filter((student) => {
          if (recentKeys.has(dateKey(serviceDate)) && stoppedIds.has(student.id)) return false;
          if (dateKey(serviceDate) !== todayKey) return true;
          if (student.id === input.demoChildBId) return false;
          if (school.code === "0779" && protectedNumbers.has(student.studentNumber)) return false;
          return true;
        });
        const selected = orderStudentsForMeal(candidates, {
          schoolCode: school.code,
          serviceDate,
          mealType,
        }).slice(0, target);
        for (const student of selected) putMeal(student, serviceDate, mealType);
      }
    }
  }

  // Make the earlier pattern unambiguous under any reasonable future
  // definition of "ate regularly": each selected student has both meals on
  // every earlier operating day, then no meal on the five recent days.
  for (const student of stoppedStudents) {
    for (const serviceDate of earlierOperatingDays) {
      putMeal(student, serviceDate, "BREAKFAST");
      putMeal(student, serviceDate, "LUNCH");
    }
  }

  // Ensure no eighth student accidentally matches the no-recent-meal fixture.
  // Breakfast is used so these guarantees cannot create another lunch ceiling
  // exception. Protected POS students are placed before today so they remain
  // clean for live entry.
  const nonTodayRecentDays = recentOperatingDays.filter((date) => dateKey(date) !== todayKey);
  for (const school of input.schools) {
    const recentStudents = (studentsBySchool.get(school.code) ?? []).filter(
      (student) => !stoppedIds.has(student.id) && student.id !== input.demoChildBId,
    );
    for (const [index, student] of recentStudents.entries()) {
      const alreadyHasRecentMeal = recentOperatingDays.some((date) =>
        mealRows.has(mealKey(student.id, date, "BREAKFAST")) ||
        mealRows.has(mealKey(student.id, date, "LUNCH")),
      );
      if (alreadyHasRecentMeal) continue;
      const availableDays = protectedNumbers.has(student.studentNumber)
        ? nonTodayRecentDays
        : recentOperatingDays;
      const serviceDate = availableDays[index % availableDays.length];
      assertSeed(serviceDate, "a recent operating day must be available for coverage fixtures");
      putMeal(student, serviceDate, "BREAKFAST");
    }
  }

  const ella = students.find((student) => student.id === input.demoChildAId)!;
  const marcus = students.find((student) => student.id === input.demoChildBId)!;
  // Existing guardian and POS fixtures win over the generated history.
  putMeal(ella, today, "BREAKFAST");
  putMeal(ella, today, "LUNCH");
  putMeal(marcus, today, "BREAKFAST");
  const priorOperatingDays = operatingDays
    .filter((date) => date.getTime() < today.getTime())
    .slice(-5)
    .reverse();
  assertSeed(priorOperatingDays.length === 5, "Marcus needs five prior operating days");
  for (const [index, serviceDate] of priorOperatingDays.entries()) {
    putMeal(marcus, serviceDate, "BREAKFAST");
    const key = mealKey(marcus.id, serviceDate, "LUNCH");
    if (index < 2) putMeal(marcus, serviceDate, "LUNCH");
    else mealRows.delete(key);
  }

  // Edit-check fixture: Woodbridge Middle has 43 active students, so 42 live
  // lunches are roughly 97% participation and two above the floor ceiling of
  // 40. It is high but possible—never an impossible duplicate count.
  const middleStudents = studentsBySchool.get("7750") ?? [];
  const marcusNeeded = mealRows.has(mealKey(marcus.id, breachDate, "LUNCH"));
  for (const student of middleStudents) {
    mealRows.delete(mealKey(student.id, breachDate, "LUNCH"));
  }
  const orderedMiddle = orderStudentsForMeal(
    middleStudents.filter((student) => student.id !== marcus.id),
    { schoolCode: "7750", serviceDate: breachDate, mealType: "LUNCH", purpose: "edit-check-breach" },
  );
  const breachStudents = marcusNeeded
    ? [marcus, ...orderedMiddle.slice(0, 41)]
    : orderedMiddle.slice(0, 42);
  assertSeed(breachStudents.length === 42, "the edit-check breach must contain 42 lunches");
  for (const student of breachStudents) putMeal(student, breachDate, "LUNCH");

  const mealLedgerEntriesBefore = await prisma.ledgerEntry.count();
  const rows = [...mealRows.values()];
  for (let offset = 0; offset < rows.length; offset += 1_000) {
    await prisma.mealEvent.createMany({ data: rows.slice(offset, offset + 1_000) });
  }
  const mealLedgerEntriesAfter = await prisma.ledgerEntry.count();

  // Claim-filter fixtures: three reversed rows remain as history with matching
  // audit evidence, but the shared live count must exclude them.
  const wheatleyCandidates = (studentsBySchool.get("0779") ?? []).filter(
    (student) => !protectedNumbers.has(student.studentNumber),
  );
  for (let index = 0; index < 3; index += 1) {
    const student = wheatleyCandidates[index]!;
    const serviceDate = earlierOperatingDays[2 + index * 4]!;
    const createdAt = historicalRecordedAt(serviceDate, "BREAKFAST", student.studentNumber);
    const reversedAt = new Date(createdAt.getTime() + 60_000);
    const event = await prisma.mealEvent.create({
      data: {
        studentId: student.id,
        schoolId: student.schoolId,
        serviceDate,
        mealType: "BREAKFAST",
        priceCents: 0,
        overrideSeq: 0,
        recordedByUserId: input.cashierUserId,
        recordingBatchId: `seed-reversed-${index + 1}`,
        reversedAt,
        reversedByUserId: input.cashierUserId,
        createdAt,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: input.cashierUserId,
        action: "MEAL_ENTRY_UNDONE",
        subjectType: "student",
        subjectId: student.id,
        districtId: input.districtId,
        schoolId: student.schoolId,
        reason: "Synthetic reversed meal for claim-count demonstration",
        beforeJson: {
          mealEventId: event.id,
          serviceDate: dateKey(serviceDate),
          mealType: "BREAKFAST",
          recordedAt: createdAt.toISOString(),
        },
        afterJson: { mealEventId: event.id, reversedAt: reversedAt.toISOString() },
        createdAt: reversedAt,
      },
    });
  }

  // One administrator override exists solely to prove it is shown separately
  // and excluded from headline claim figures (D-10).
  const overrideDate = earlierOperatingDays.at(-2)!;
  const overrideOriginal = await prisma.mealEvent.findFirstOrThrow({
    where: {
      serviceDate: overrideDate,
      mealType: "LUNCH",
      overrideSeq: 0,
      reversedAt: null,
      schoolId: input.schools.find((school) => school.code === "0780")!.id,
    },
    select: { studentId: true, schoolId: true },
  });
  const overrideReason = "Synthetic second serving for claim-report demonstration";
  await prisma.mealEvent.create({
    data: {
      studentId: overrideOriginal.studentId,
      schoolId: overrideOriginal.schoolId,
      serviceDate: overrideDate,
      mealType: "LUNCH",
      priceCents: 0,
      overrideSeq: 1,
      overrideReason,
      recordedByUserId: input.superAdminUserId,
      createdAt: historicalRecordedAt(overrideDate, "LUNCH", "100099"),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorType: "USER",
      actorId: input.superAdminUserId,
      action: "DUPLICATE_MEAL_OVERRIDE",
      subjectType: "student",
      subjectId: overrideOriginal.studentId,
      districtId: input.districtId,
      schoolId: overrideOriginal.schoolId,
      reason: overrideReason,
      afterJson: { serviceDate: dateKey(overrideDate), mealType: "LUNCH", overrideSeq: 1 },
      createdAt: historicalRecordedAt(overrideDate, "LUNCH", "100099"),
    },
  });

  // Forty modest historical snack purchases exercise real append-only money
  // history without touching Ella, Marcus, POS students, graduates, or arrears.
  const snackLedgerEntriesBefore = await prisma.ledgerEntry.count({
    where: { type: "ALACARTE_CHARGE" },
  });
  const snackCandidates = students.filter((student) =>
    !protectedNumbers.has(student.studentNumber) &&
    student.grade !== "12" &&
    student.account !== null &&
    student.account.balanceCents >= 150,
  );
  const snackStudents = orderStudentsForMeal(snackCandidates, {
    schoolCode: "district",
    serviceDate: operatingDays[0]!,
    mealType: "LUNCH",
    purpose: `snack-history-${MEAL_HISTORY_SEED}`,
  }).slice(0, 40);
  assertSeed(snackStudents.length === 40, "forty students must be able to fund a snack fixture");
  await prisma.$transaction(async (tx) => {
    for (const [index, student] of snackStudents.entries()) {
      const item = input.items[index % input.items.length]!;
      const serviceDate = operatingDays[index % operatingDays.length]!;
      const createdAt = historicalRecordedAt(serviceDate, "LUNCH", student.studentNumber);
      const entry = await tx.ledgerEntry.create({
        data: {
          accountId: student.account!.id,
          type: "ALACARTE_CHARGE",
          amountCents: -item.priceCents,
          description: item.name,
          actorType: "USER",
          actorId: input.districtAdminUserId,
          createdAt,
        },
      });
      await tx.itemSale.create({
        data: {
          itemId: item.id,
          studentId: student.id,
          priceCentsAtSale: item.priceCents,
          ledgerEntryId: entry.id,
          createdAt,
        },
      });
    }
  });

  // Roster-freshness fixture: the most recent completed student-list upload is
  // deliberately nine district-calendar days old.
  await prisma.importRun.create({
    data: {
      districtId: input.districtId,
      source: "woodbridge-student-list.csv",
      operator: "superadmin@woodbridge.demo",
      checksum: "synthetic-stale-roster-nine-days",
      status: "committed",
      updatedCount: DEMO_STUDENT_COUNT,
      createdAt: addUtcDays(today, -9),
    },
  });

  return {
    today,
    operatingDays,
    closureDays,
    recentOperatingDays,
    breachDate,
    stoppedStudentIds: [...stoppedIds],
    snackStudentIds: snackStudents.map((student) => student.id),
    snackLedgerEntriesBefore,
    snackPurchasesCreated: 40,
    mealLedgerEntriesBefore,
    mealLedgerEntriesAfter,
  };
}

interface DeepSeedSummary {
  breachClaimed: number;
  breachCeiling: number;
  reversedCount: number;
  overrideCount: number;
  graduateCount: number;
  graduateTotalCents: number;
  negativeBalanceCount: number;
  schoolMealTotals: { schoolName: string; breakfasts: number; lunches: number }[];
}

async function verifyDeepSeed(input: {
  districtId: string;
  schools: SeedSchool[];
  superAdminUserId: string;
  cashierUserId: string;
  fixture: DeepHistoryFixture;
  demoChildAId: string;
  demoChildBId: string;
  posDemoStudentRows: { id: string; studentNumber: string; balanceCents: number }[];
}): Promise<DeepSeedSummary> {
  const session = {
    principalType: "staff" as const,
    userId: input.superAdminUserId,
    role: "SUPER_ADMIN" as const,
    districtId: input.districtId,
    schoolIds: input.schools.map((school) => school.id),
  };
  const range = {
    from: input.fixture.operatingDays[0]!,
    to: input.fixture.today,
  };
  const editCheck = await editCheckReport(session, range);
  assertSeed(editCheck.status === "available", "edit-check report must be available");
  const exceptions = editCheck.rows.filter((row) => row.needsAttention);
  assertSeed(exceptions.length === 1, `exactly one edit-check exception must exist, found ${exceptions.length}`);
  const exception = exceptions[0]!;
  const middle = input.schools.find((school) => school.code === "7750")!;
  assertSeed(exception.schoolId === middle.id, "the edit-check exception must belong to Woodbridge Middle");
  assertSeed(exception.mealType === "LUNCH", "the edit-check exception must be lunch");
  assertSeed(dateKey(exception.serviceDate) === dateKey(input.fixture.breachDate), "the edit-check exception date must match the planted breach");
  assertSeed(exception.claimedCount === 42 && exception.ceiling === 40, "the planted breach must be 42 lunches against a ceiling of 40");

  const recentMeals = await prisma.mealEvent.findMany({
    where: {
      serviceDate: { in: input.fixture.recentOperatingDays },
      overrideSeq: 0,
      reversedAt: null,
    },
    select: { studentId: true },
  });
  const recentStudentIds = new Set(recentMeals.map((meal) => meal.studentId));
  assertSeed(
    input.fixture.stoppedStudentIds.every((studentId) => !recentStudentIds.has(studentId)),
    "all seven stopped-eating students must have no recent meal records",
  );
  const allActiveStudentIds = await prisma.student.findMany({
    where: { districtId: input.districtId, enrollmentStatus: "ACTIVE" },
    select: { id: true },
  });
  const stoppedIds = new Set(input.fixture.stoppedStudentIds);
  const accidentalStopped = allActiveStudentIds.filter(
    (student) => !stoppedIds.has(student.id) && !recentStudentIds.has(student.id),
  );
  assertSeed(accidentalStopped.length === 0, "no eighth student may match the stopped-eating fixture");
  const earlierDates = input.fixture.operatingDays.slice(0, -5);
  for (const studentId of input.fixture.stoppedStudentIds) {
    const earlierMeals = await countServedMeals({
      studentId,
      serviceDate: { in: earlierDates },
    });
    assertSeed(
      earlierMeals === earlierDates.length * 2,
      "each stopped-eating student must have both meals on every earlier operating day",
    );
  }

  const [reversedCount, overrideCount, reversalAudits, overrideAudits] = await Promise.all([
    prisma.mealEvent.count({ where: { reversedAt: { not: null }, overrideSeq: 0 } }),
    prisma.mealEvent.count({ where: { reversedAt: null, overrideSeq: { gt: 0 } } }),
    prisma.auditLog.count({ where: { action: "MEAL_ENTRY_UNDONE", actorId: input.cashierUserId } }),
    prisma.auditLog.count({ where: { action: "DUPLICATE_MEAL_OVERRIDE", actorId: input.superAdminUserId } }),
  ]);
  assertSeed(reversedCount === 3, "exactly three reversed meal events must exist");
  assertSeed(overrideCount === 1, "exactly one administrator override must exist");
  assertSeed(reversalAudits === 3, "every reversed seed event must have audit evidence");
  assertSeed(overrideAudits === 1, "the seeded override must have audit evidence");
  assertSeed(
    input.fixture.mealLedgerEntriesBefore === input.fixture.mealLedgerEntriesAfter,
    "zero-price meal history must not create money entries",
  );
  assertSeed(
    await prisma.mealEvent.count({ where: { ledgerEntryId: { not: null } } }) === 0,
    "no seeded CEP meal may link to a money entry",
  );

  const snackLedgerEntriesAfter = await prisma.ledgerEntry.count({
    where: { type: "ALACARTE_CHARGE" },
  });
  assertSeed(
    snackLedgerEntriesAfter - input.fixture.snackLedgerEntriesBefore === input.fixture.snackPurchasesCreated,
    "deep history must add exactly forty snack charges",
  );
  assertSeed(await prisma.itemSale.count() === 42, "forty history sales plus two correction-demo cookies must exist");
  for (const studentId of input.fixture.snackStudentIds) {
    assertSeed(await deriveBalanceCents((await prisma.account.findUniqueOrThrow({ where: { studentId } })).id) >= 0, "a snack fixture must never overdraw an account");
  }

  const graduates = await prisma.student.findMany({
    where: { schoolId: input.schools.find((school) => school.code === "0780")!.id, grade: "12" },
    select: { account: { select: { id: true } } },
  });
  let graduateTotalCents = 0;
  for (const graduate of graduates) {
    assertSeed(graduate.account, "every graduate must have an account");
    const amount = await deriveBalanceCents(graduate.account.id);
    assertSeed(amount >= 300 && amount <= 4_000, "every graduate amount must be from $3 through $40");
    graduateTotalCents += amount;
  }

  const latestImport = await prisma.importRun.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  assertSeed(
    dateKey(latestImport.createdAt) === dateKey(addUtcDays(input.fixture.today, -9)),
    "the latest student-list record must be nine district-calendar days old",
  );
  for (const closure of input.fixture.closureDays) {
    assertSeed(
      await countServedMeals({ serviceDate: closure }) === 0,
      "synthetic closure days must contain no live meal events",
    );
  }

  const todayMeals = await prisma.mealEvent.findMany({
    where: {
      serviceDate: input.fixture.today,
      studentId: { in: [input.demoChildAId, input.demoChildBId, ...input.posDemoStudentRows.map((row) => row.id)] },
      overrideSeq: 0,
      reversedAt: null,
    },
    select: { studentId: true, mealType: true },
  });
  const todayKeys = new Set(todayMeals.map((meal) => `${meal.studentId}|${meal.mealType}`));
  assertSeed(todayKeys.has(`${input.demoChildAId}|BREAKFAST`) && todayKeys.has(`${input.demoChildAId}|LUNCH`), "Ella must retain breakfast and lunch today");
  assertSeed(todayKeys.has(`${input.demoChildBId}|BREAKFAST`) && !todayKeys.has(`${input.demoChildBId}|LUNCH`), "Marcus must retain breakfast only today");
  assertSeed(input.posDemoStudentRows.every((row) => !todayMeals.some((meal) => meal.studentId === row.id)), "reserved POS students must remain unrecorded today");

  const protectedExpected = new Map<string, number>([
    [input.demoChildAId, 4_200],
    [input.demoChildBId, 900],
    ...input.posDemoStudentRows.map((row) => [row.id, row.balanceCents] as const),
  ]);
  for (const [studentId, expected] of protectedExpected) {
    const account = await prisma.account.findUniqueOrThrow({ where: { studentId } });
    assertSeed(await deriveBalanceCents(account.id) === expected, "protected demo balances must remain unchanged");
    assertSeed(account.balanceCents === expected, "protected cached demo balances must remain unchanged");
  }
  const marcusTopUp = await prisma.automaticTopUpRule.findFirst({
    where: { studentId: input.demoChildBId, active: true },
  });
  assertSeed(
    marcusTopUp?.triggerBalanceCents === 800 &&
      marcusTopUp.topUpAmountCents === 1_000 &&
      marcusTopUp.monthlyCeilingCents === 3_000,
    "Marcus must retain the automatic top-up demo fixture",
  );
  const rosterStudents = await prisma.student.findMany({
    where: { school: { code: { in: ["7760", "0779"] } }, enrollmentStatus: "ACTIVE" },
    select: { classroomId: true },
  });
  assertSeed(rosterStudents.every((student) => student.classroomId !== null), "roster-school classroom assignments must remain complete");
  assertSeed(await prisma.correctionCase.count({ where: { status: "COMPLETED" } }) === 1, "the completed correction fixture must remain");
  assertSeed(await prisma.studentPricing.count() === DEMO_STUDENT_COUNT, "every student must retain one pricing row");
  const pricing = await prisma.pricingConfig.findFirstOrThrow({
    where: { districtId: input.districtId, schoolId: null, cancelledAt: null },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  assertSeed(pricing.cepEnabled, "Woodbridge must reset with free meals for all students on");
  assertSeed(
    pricing.breakfastReducedCents === 30 &&
      pricing.breakfastPaidCents === 200 &&
      pricing.lunchReducedCents === 40 &&
      pricing.lunchPaidCents === 325,
    "synthetic fallback meal prices must remain seeded for the CEP-off demo",
  );

  const negativeBalanceCount = await prisma.account.count({ where: { balanceCents: { lt: 0 } } });
  assertSeed(negativeBalanceCount > 0, "negative-balance fixtures must remain present");
  const schoolMealTotals = [];
  for (const school of input.schools) {
    const [breakfasts, lunches] = await Promise.all([
      countServedMeals({ schoolId: school.id, serviceDate: { gte: range.from, lte: range.to }, mealType: "BREAKFAST" }),
      countServedMeals({ schoolId: school.id, serviceDate: { gte: range.from, lte: range.to }, mealType: "LUNCH" }),
    ]);
    schoolMealTotals.push({ schoolName: school.name, breakfasts, lunches });
  }

  return {
    breachClaimed: exception.claimedCount,
    breachCeiling: exception.ceiling,
    reversedCount,
    overrideCount,
    graduateCount: graduates.length,
    graduateTotalCents,
    negativeBalanceCount,
    schoolMealTotals,
  };
}

async function main() {
  console.log("Resetting database…");
  await reset();

  const district = await prisma.district.create({
    data: {
      name: "Woodbridge School District",
      identifiedStudentPercentageBps: WOODBRIDGE_IDENTIFIED_STUDENT_PERCENTAGE_BPS,
      // FNS federal default; no Delaware-specific published percentage was found.
      stateAttendanceFactorBps: WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS,
      stateAttendanceFactorProvenance: "FNS_FEDERAL_DEFAULT",
      timeZone: WOODBRIDGE_TIME_ZONE,
    },
  });

  // A-la-carte items (used by later phases; priced now).
  const itemSpecs = [
    { name: "Milk", priceCents: 50 },
    { name: "Bottled Water", priceCents: 100 },
    { name: "Cookie", priceCents: 125 },
    { name: "Chips", priceCents: 150 },
  ];
  const items = [];
  for (const it of itemSpecs) {
    const item = await prisma.item.create({
      data: { districtId: district.id, name: it.name, priceCents: it.priceCents },
    });
    items.push(item);
  }

  const schools = [];
  for (const spec of WOODBRIDGE_SEED_SCHOOLS) {
    const school = await prisma.school.create({
      data: {
        districtId: district.id,
        name: spec.name,
        code: spec.code,
        breakfastServiceEndMinutes: BREAKFAST_END_MINUTES,
        lunchServiceEndMinutes: LUNCH_END_MINUTES,
      },
    });
    schools.push({ ...school, grades: spec.grades, seedCount: spec.seedCount });
  }
  const schoolsByCode = new Map(schools.map((school) => [school.code, school]));
  const wheatley = schoolsByCode.get("0779")!;
  const middle = schoolsByCode.get("7750")!;

  const classroomsByTeacher = new Map<string, { id: string }>();
  for (const spec of WOODBRIDGE_CLASSROOMS) {
    const school = schoolsByCode.get(spec.schoolCode)!;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: school.id,
        teacherName: spec.teacherName,
        grade: spec.grade,
      },
      select: { id: true },
    });
    classroomsByTeacher.set(`${spec.schoolCode}|${spec.teacherName}`, classroom);
  }

  const guardianPasswordHash = await hash(DEMO_PASSWORD);

  // --- Featured demo guardian: 2 children, DIFFERING surnames, healthy ------
  const demoGuardian = await prisma.guardian.create({
    data: {
      email: "guardian@woodbridge.demo",
      passwordHash: guardianPasswordHash,
      firstName: "Dana",
      lastName: "Whitfield",
      phone: "555-0100",
    },
  });
  const demoChildA = await prisma.student.create({
    data: {
      districtId: district.id,
      schoolId: wheatley.id,
      studentNumber: nextStudentNumber(),
      firstName: "Ella",
      lastName: "Whitfield",
      grade: "3",
      account: { create: { balanceCents: 4450 } },
    },
  });
  const demoChildB = await prisma.student.create({
    data: {
      districtId: district.id,
      schoolId: middle.id,
      studentNumber: nextStudentNumber(),
      firstName: "Marcus",
      lastName: "Okafor", // differing surname (blended household)
      grade: "7",
      account: { create: { balanceCents: 900 } }, // low — shows warn pill
    },
  });
  for (const [child, bal] of [
    [demoChildA, 4450],
    [demoChildB, 900],
  ] as const) {
    const acct = await prisma.account.findUniqueOrThrow({
      where: { studentId: child.id },
    });
    await prisma.ledgerEntry.create({
      data: {
        accountId: acct.id,
        type: "DEPOSIT",
        amountCents: bal,
        description: "Opening snack money (synthetic)",
        actorType: "SYSTEM",
      },
    });
    await prisma.guardianStudent.create({
      data: {
        guardianId: demoGuardian.id,
        studentId: child.id,
        relationship: "Parent",
      },
    });
  }
  // Stage C item 10 fixture: Marcus demonstrates an active automatic top-up
  // rule in a CEP district, so the copy uses snack-money thresholds.
  await prisma.automaticTopUpRule.create({
    data: {
      guardianId: demoGuardian.id,
      studentId: demoChildB.id,
      triggerBalanceCents: 800,
      topUpAmountCents: 1000,
      monthlyCeilingCents: 3000,
    },
  });

  const posDemoGuardian = await prisma.guardian.create({
    data: {
      email: "posdemo@woodbridge.demo",
      passwordHash: guardianPasswordHash,
      firstName: "Taylor",
      lastName: "Bell",
      phone: "555-0101",
    },
  });
  const posDemoStudents = [
    { firstName: "Nora", lastName: "Bell", balanceCents: 1800, grade: "4" },
    { firstName: "Isaac", lastName: "Bell", balanceCents: 2200, grade: "5" },
    { firstName: "Maya", lastName: "Santos", balanceCents: 1500, grade: "3" },
    { firstName: "Leo", lastName: "Santos", balanceCents: 2600, grade: "4" },
    { firstName: "Amina", lastName: "Cole", balanceCents: 1400, grade: "5" },
  ];
  const posDemoStudentRows: { id: string; studentNumber: string; balanceCents: number }[] = [];
  for (const spec of posDemoStudents) {
    const student = await prisma.student.create({
      data: {
        districtId: district.id,
        schoolId: wheatley.id,
        studentNumber: nextStudentNumber(),
        firstName: spec.firstName,
        lastName: spec.lastName,
        grade: spec.grade,
        account: { create: { balanceCents: spec.balanceCents } },
      },
    });
    const acct = await prisma.account.findUniqueOrThrow({ where: { studentId: student.id } });
    await prisma.ledgerEntry.create({
      data: {
        accountId: acct.id,
        type: "DEPOSIT",
        amountCents: spec.balanceCents,
        description: "Opening snack money (synthetic)",
        actorType: "SYSTEM",
      },
    });
    await prisma.guardianStudent.create({
      data: { guardianId: posDemoGuardian.id, studentId: student.id, relationship: "Parent" },
    });
    posDemoStudentRows.push({
      id: student.id,
      studentNumber: student.studentNumber,
      balanceCents: spec.balanceCents,
    });
  }

  let studentCount = 7; // Ella, Marcus, and reserved Wheatley POS students 100003-100007
  let householdIndex = 0;
  const remainingSchoolSlots = buildRemainingSchoolSlots({
    schools: WOODBRIDGE_SEED_SCHOOLS,
    alreadyAssignedByCode: { "0779": 6, "7750": 1 },
    seed: 20260815,
  });

  console.log("Creating households and students…");
  while (studentCount < DEMO_STUDENT_COUNT) {
    householdIndex += 1;
    const householdSize = rng() < 0.55 ? 1 : rng() < 0.85 ? 2 : 3;
    const guardianLastName = pick(LAST_NAMES);
    const guardianFirstName = pick(FIRST_NAMES);

    const guardian = await prisma.guardian.create({
      data: {
        email: `guardian${householdIndex}@example.com`,
        passwordHash: guardianPasswordHash,
        firstName: guardianFirstName,
        lastName: guardianLastName,
      },
    });

    for (let c = 0; c < householdSize && studentCount < DEMO_STUDENT_COUNT; c++) {
      const schoolCode = remainingSchoolSlots.shift();
      if (!schoolCode) throw new Error("School slot allocation exhausted before student target");
      const school = schoolsByCode.get(schoolCode);
      if (!school) throw new Error(`Unknown seeded school slot: ${schoolCode}`);
      const child = await createStudentWithAccount(
        district.id,
        school,
        guardianLastName,
        pickBalanceCents(),
      );
      await prisma.guardianStudent.create({
        data: {
          guardianId: guardian.id,
          studentId: child.id,
          relationship: "Parent",
        },
      });
      studentCount += 1;
    }
  }
  if (remainingSchoolSlots.length > 0) {
    throw new Error(`School slot allocation left ${remainingSchoolSlots.length} unused slots`);
  }

  // Deterministic teacher-named rosters for the two schools that use class
  // entry. Students are ordered by number and balanced within each grade.
  for (const schoolCode of ["7760", "0779"] as const) {
    const school = schoolsByCode.get(schoolCode)!;
    const students = await prisma.student.findMany({
      where: { schoolId: school.id, enrollmentStatus: "ACTIVE" },
      select: { id: true, grade: true },
      orderBy: { studentNumber: "asc" },
    });
    const gradePositions = new Map<string, number>();
    for (const student of students) {
      const position = gradePositions.get(student.grade) ?? 0;
      const teacherName = classroomTeacherForPosition(schoolCode, student.grade, position);
      if (!teacherName) throw new Error(`No classroom seed for ${schoolCode} grade ${student.grade}`);
      const classroom = classroomsByTeacher.get(`${schoolCode}|${teacherName}`);
      if (!classroom) throw new Error(`Missing seeded classroom for ${teacherName}`);
      await prisma.student.update({
        where: { id: student.id },
        data: { classroomId: classroom.id },
      });
      gradePositions.set(student.grade, position + 1);
    }
  }

  // --- Staff users, with pre-enrolled TOTP ----------------------------------
  interface StaffSpec {
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    schoolIds: string[];
  }
  const staffSpecs: StaffSpec[] = [
    { email: "cashier@woodbridge.demo", firstName: "Casey", lastName: "Nguyen", role: "CASHIER", schoolIds: [wheatley.id] },
    { email: "staff@woodbridge.demo", firstName: "Sam", lastName: "Patel", role: "SCHOOL_STAFF", schoolIds: [wheatley.id] },
    { email: "districtadmin@woodbridge.demo", firstName: "Drew", lastName: "Garcia", role: "DISTRICT_ADMIN", schoolIds: schools.map((s) => s.id) },
    { email: "superadmin@woodbridge.demo", firstName: "Robin", lastName: "Osei", role: "SUPER_ADMIN", schoolIds: schools.map((s) => s.id) },
  ];

  const staffPasswordHash = await hash(DEMO_PASSWORD);
  const staffCreds: { email: string; label: string; totpSecret: string; totpNow: string }[] = [];
  let superAdminUserId: string | null = null;
  let legacySchoolStaffUserId: string | null = null;
  let cashierUserId: string | null = null;
  let districtAdminUserId: string | null = null;
  for (const spec of staffSpecs) {
    const totpSecret = STAFF_TOTP_ENV[spec.role] ?? authenticator.generateSecret();
    const user = await prisma.user.create({
      data: {
        email: spec.email,
        passwordHash: staffPasswordHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        role: spec.role,
        districtId: district.id,
        totpSecret,
        totpEnrolledAt: new Date(),
        schools: {
          create: spec.schoolIds.map((schoolId) => ({ schoolId })),
        },
      },
    });
    if (spec.role === "SUPER_ADMIN") superAdminUserId = user.id;
    if (spec.role === "CASHIER") cashierUserId = user.id;
    if (spec.role === "DISTRICT_ADMIN") districtAdminUserId = user.id;
    if (spec.email === "staff@woodbridge.demo") legacySchoolStaffUserId = user.id;
    const evaluatorLabel = EVALUATOR_STAFF_LABELS[spec.email];
    if (evaluatorLabel) {
      staffCreds.push({
        email: spec.email,
        label: evaluatorLabel,
        totpSecret,
        totpNow: authenticator.generate(totpSecret),
      });
    }
  }

  if (!superAdminUserId || !legacySchoolStaffUserId || !cashierUserId || !districtAdminUserId) {
    throw new Error("Seed staff users were not created as expected");
  }

  // District-wide free-meals version. The fallback prices are synthetic demo
  // values kept ready for the CEP-off demonstration; they are not claimed as
  // Woodbridge's official non-CEP prices.
  await prisma.pricingConfig.create({
    data: {
      districtId: district.id,
      schoolId: null,
      createdByUserId: superAdminUserId,
      effectiveFrom: await districtToday(district.id),
      breakfastFreeCents: 0,
      breakfastReducedCents: 30,
      breakfastPaidCents: 200,
      lunchFreeCents: 0,
      lunchReducedCents: 40,
      lunchPaidCents: 325,
      lowBalanceThresholdCents: 1000,
      lowBalanceMealsThreshold: 5,
      cepEnabled: true,
    },
  });

  await setUserDisabled(
    {
      principalType: "staff",
      userId: superAdminUserId,
      role: "SUPER_ADMIN",
      districtId: district.id,
      schoolIds: schools.map((s) => s.id),
    },
    legacySchoolStaffUserId,
    true,
  );

  const ellaAccount = await prisma.account.findUniqueOrThrow({
    where: { studentId: demoChildA.id },
  });
  const incorrectEntry = await prisma.ledgerEntry.create({
    data: {
      accountId: ellaAccount.id,
      type: "DEPOSIT",
      amountCents: 300,
      description: "Incorrect synthetic cash payment",
      actorType: "SYSTEM",
    },
  });
  const seededAdjustment = await recordAdjustment({
    originalEntryId: incorrectEntry.id,
    amountCents: -300,
    reason: "Seeded demo correction for an incorrect cash payment",
    actor: {
      kind: "staff",
      session: {
        principalType: "staff",
        userId: superAdminUserId!,
        role: "SUPER_ADMIN",
        districtId: district.id,
        schoolIds: schools.map((s) => s.id),
      },
    },
  });
  await prisma.correctionCase.create({
    data: {
      situation: "SOMETHING_ELSE",
      status: "COMPLETED",
      studentId: demoChildA.id,
      originalEntryId: incorrectEntry.id,
      reason: "Seeded demo correction for an incorrect cash payment",
      actorId: superAdminUserId!,
      adjustmentEntryId: seededAdjustment.id,
      expectedAmountCents: 0,
      completedAt: new Date(),
      completedByUserId: superAdminUserId!,
    },
  });

  const cookie = await prisma.item.findFirstOrThrow({
    where: { districtId: district.id, name: "Cookie" },
  });
  for (const suffix of ["A", "B"]) {
    const charge = await prisma.ledgerEntry.create({
      data: {
        accountId: ellaAccount.id,
        type: "ALACARTE_CHARGE",
        amountCents: -125,
        description: `Cookie return demo ${suffix}`,
        actorType: "SYSTEM",
      },
    });
    await prisma.itemSale.create({
      data: {
        itemId: cookie.id,
        studentId: demoChildA.id,
        priceCentsAtSale: 125,
        ledgerEntryId: charge.id,
      },
    });
  }

  console.log("Creating deterministic meal and snack history…");
  const deepHistory = await seedDeepHistory({
    districtId: district.id,
    schools,
    cashierUserId,
    districtAdminUserId,
    superAdminUserId,
    demoChildAId: demoChildA.id,
    demoChildBId: demoChildB.id,
    items,
  });

  // --- Default price tier for every student ---------------------------------
  // Pricing INPUT only (server/meals reads it); CEP still resolves meals to $0.
  const allStudents = await prisma.student.findMany({
    select: { id: true },
    orderBy: { studentNumber: "asc" },
  });
  await prisma.studentPricing.createMany({
    data: buildStudentPricingRows(allStudents.map((s) => s.id)),
    skipDuplicates: true,
  });

  // --- Sample notification + delivery log (phase 5 generates these for real) -
  await prisma.notification.create({
    data: {
      districtId: district.id,
      schoolId: middle.id,
      guardianId: demoGuardian.id,
      type: "LOW_BALANCE",
      title: "Low balance: Marcus Okafor",
      body: "Marcus Okafor's snack-money balance is low. Lunch is free every day — nothing needs to be paid.",
      deliveries: {
        create: {
          channel: "IN_APP",
          status: "DELIVERED",
          detail: "Shown in guardian portal inbox",
        },
      },
    },
  });

  // --- Sync cached balances to the ledger (source of truth) -----------------
  const accounts = await prisma.account.findMany({ select: { id: true } });
  for (const a of accounts) {
    const agg = await prisma.ledgerEntry.aggregate({
      where: { accountId: a.id },
      _sum: { amountCents: true },
    });
    await prisma.account.update({
      where: { id: a.id },
      data: { balanceCents: agg._sum.amountCents ?? 0 },
    });
  }

  const deepSummary = await verifyDeepSeed({
    districtId: district.id,
    schools,
    superAdminUserId,
    cashierUserId,
    fixture: deepHistory,
    demoChildAId: demoChildA.id,
    demoChildBId: demoChildB.id,
    posDemoStudentRows,
  });

  const totalStudents = await prisma.student.count();
  const totalGuardians = await prisma.guardian.count();

  console.log("\n================ SEED COMPLETE ================");
  console.log(`District: ${district.name}`);
  console.log(`Schools: ${schools.length}  Students: ${totalStudents}  Guardians: ${totalGuardians}`);
  console.log(`Classrooms: ${WOODBRIDGE_CLASSROOMS.length} across ECEC and Phillis Wheatley`);
  console.log(`Meal-history seed: ${MEAL_HISTORY_SEED}`);
  console.log(`Operating days: ${deepHistory.operatingDays.length} (${deepHistory.closureDays.length} synthetic closures)`);
  for (const row of deepSummary.schoolMealTotals) {
    console.log(`  ${row.schoolName}: ${row.breakfasts} breakfasts, ${row.lunches} lunches`);
  }
  console.log(
    `Edit-check fixture: ${dateKey(deepHistory.breachDate)} at Woodbridge Middle — ` +
    `${deepSummary.breachClaimed} lunches, ceiling ${deepSummary.breachCeiling}, ` +
    `${deepSummary.breachClaimed - deepSummary.breachCeiling} over`,
  );
  console.log(`Stopped-eating fixture: ${deepHistory.stoppedStudentIds.length} students across 3 schools`);
  console.log(
    `Graduating-student fixture: ${deepSummary.graduateCount} students hold ` +
    `$${(deepSummary.graduateTotalCents / 100).toFixed(2)}`,
  );
  console.log(
    `Claim-filter fixtures: ${deepSummary.reversedCount} reversed, ` +
    `${deepSummary.overrideCount} administrator override`,
  );
  console.log(`Snack-history fixture: ${deepHistory.snackPurchasesCreated} purchases`);
  console.log(`Roster-freshness fixture: latest student list is 9 days old`);
  console.log(`Negative-balance fixtures: ${deepSummary.negativeBalanceCount} students`);
  console.log("Automatic top-up fixture: Marcus adds $10.00 below $8.00, monthly limit $30.00");
  /*
   * Secrets are printed for LOCAL use only. In a deployed container this seed
   * runs from the entrypoint and everything it prints lands in CloudWatch Logs
   * and stays there — so the shared password, the staff TOTP secrets, and a
   * live code would sit in a durable log that anyone with read access to the
   * log group could lift, defeating the second factor entirely. The data is
   * synthetic, so this is not a breach; it would still hand a district's IT
   * reviewer a fair objection to the product's own MFA story.
   */
  const secretsArePrintable = process.env.NODE_ENV !== "production";

  if (secretsArePrintable) {
    console.log(`\nShared demo password (all accounts): ${DEMO_PASSWORD}`);
  } else {
    console.log("\nShared demo password: withheld from deployed logs — run `npm run logins` locally.");
  }
  console.log("\nEvaluator logins:");
  console.log("  Guardian — guardian@woodbridge.demo — Dana Whitfield (2 children: Ella Whitfield, Marcus Okafor)");
  console.log("  Cashier  — cashier@woodbridge.demo");
  console.log("  Staff    — districtadmin@woodbridge.demo");
  console.log("  Super admin — superadmin@woodbridge.demo");
  console.log("\nGuardian sign-in is single factor, no code needed:");
  console.log("  guardian@woodbridge.demo  — Dana Whitfield (2 children: Ella Whitfield, Marcus Okafor)");
  console.log("  POS demo: 100003/100004 record cleanly, 100001 is duplicate lunch, 100002 is wrong school");
  console.log("\nStaff sign-in (require 6-digit authenticator code):");
  for (const c of staffCreds) {
    console.log(`  ${c.label.padEnd(11)} — ${c.email}`);
    if (secretsArePrintable) {
      console.log(`      TOTP secret: ${c.totpSecret}`);
      console.log(`      code right now: ${c.totpNow}  (30s window — add the secret to an authenticator app)`);
    } else {
      console.log("      TOTP secret: withheld from deployed logs");
    }
  }
  if (!secretsArePrintable) {
    console.log(
      "\n  To enrol an authenticator for a deployed environment, read the secret\n" +
        "  directly from the database rather than from these logs.",
    );
  }
  console.log("==============================================\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
