/**
 * Synthetic seed — idempotent (full reset + reload). Produces:
 *  - 1 district, 6 real Woodbridge schools with proportional synthetic enrollment
 *  - 200 students in multi-child households with differing surnames
 *  - guardians linked via GuardianStudent, accounts with varied balances
 *    (balances derive from opening ledger entries; cached balanceCents matches)
 *  - one sign-in per role; staff pre-enrolled with a TOTP secret
 *  - CEP pricing default ($0 breakfast/lunch)
 *
 * All data is synthetic. No real student information (CLAUDE.md).
 * Imports concrete packages (not "@/" aliases) so it runs under tsx directly.
 */
import {
  PrismaClient,
  type ActorType,
  type LedgerEntryType,
  type Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { withLedgerAdmin } from "../server/ledger/admin";
import { recordAdjustment } from "../server/ledger/ledger";
import {
  buildRemainingSchoolSlots,
  buildStudentPricingRows,
  DEMO_STUDENT_COUNT,
  mulberry32,
  WOODBRIDGE_IDENTIFIED_STUDENT_PERCENTAGE_BPS,
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

function districtDateOnly(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WOODBRIDGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
  ));
}

async function reset() {
  // Delete in FK-safe order.
  await prisma.itemSale.deleteMany();
  await prisma.mealEvent.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.paymentIntent.deleteMany();
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

  const student = await prisma.student.create({
    data: {
      districtId,
      schoolId: school.id,
      studentNumber: nextStudentNumber(),
      firstName,
      lastName,
      grade,
      enrollmentStatus: "ACTIVE",
      account: { create: { balanceCents } },
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
  if (balanceCents >= 0) {
    entries.push({
      type: "DEPOSIT",
      amountCents: balanceCents,
      description: "Opening balance (synthetic)",
      actorType: "SYSTEM",
    });
  } else {
    // Model a negative balance as a deposit followed by an a-la-carte debit.
    entries.push({
      type: "DEPOSIT",
      amountCents: 500,
      description: "Opening balance (synthetic)",
      actorType: "SYSTEM",
    });
    entries.push({
      type: "ALACARTE_CHARGE",
      amountCents: balanceCents - 500,
      description: "A-la-carte purchases (synthetic)",
      actorType: "SYSTEM",
    });
  }
  for (const e of entries) {
    await prisma.ledgerEntry.create({ data: { accountId: account.id, ...e } });
  }

  return { id: student.id, firstName, lastName };
}

function pickBalanceCents(): number {
  const r = rng();
  if (r < 0.05) return -randint(150, 800); // negative — danger pill
  if (r < 0.2) return randint(0, 900); // low — warn pill
  return randint(1200, 8000); // healthy
}

async function main() {
  console.log("Resetting database…");
  await reset();

  const district = await prisma.district.create({
    data: {
      name: "Woodbridge School District",
      identifiedStudentPercentageBps: WOODBRIDGE_IDENTIFIED_STUDENT_PERCENTAGE_BPS,
      timeZone: WOODBRIDGE_TIME_ZONE,
    },
  });

  // District-wide CEP pricing default: $0 breakfast/lunch for all tiers.
  await prisma.pricingConfig.create({
    data: {
      districtId: district.id,
      schoolId: null,
      breakfastFreeCents: 0,
      breakfastReducedCents: 0,
      breakfastPaidCents: 0,
      lunchFreeCents: 0,
      lunchReducedCents: 0,
      lunchPaidCents: 0,
      lowBalanceThresholdCents: 1000,
      lowBalanceMealsThreshold: 5,
      cepEnabled: true,
    },
  });

  // A-la-carte items (used by later phases; priced now).
  const items = [
    { name: "Milk", priceCents: 50 },
    { name: "Bottled Water", priceCents: 100 },
    { name: "Cookie", priceCents: 125 },
    { name: "Chips", priceCents: 150 },
  ];
  for (const it of items) {
    await prisma.item.create({
      data: { districtId: district.id, name: it.name, priceCents: it.priceCents },
    });
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
      account: { create: { balanceCents: 4200 } },
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
    [demoChildA, 4200],
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
        description: "Opening balance (synthetic)",
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
        description: "Opening balance (synthetic)",
        actorType: "SYSTEM",
      },
    });
    await prisma.guardianStudent.create({
      data: { guardianId: posDemoGuardian.id, studentId: student.id, relationship: "Parent" },
    });
  }

  const today = districtDateOnly();
  await prisma.mealEvent.createMany({
    data: [
      { studentId: demoChildA.id, serviceDate: today, mealType: "BREAKFAST", priceCents: 0 },
      { studentId: demoChildA.id, serviceDate: today, mealType: "LUNCH", priceCents: 0 },
      { studentId: demoChildB.id, serviceDate: today, mealType: "BREAKFAST", priceCents: 0 },
    ],
  });
  const priorOperatingDays = Array.from({ length: 5 }, (_, index) => addDays(today, -(index + 1)));
  await prisma.mealEvent.createMany({
    data: priorOperatingDays.flatMap((serviceDate, index) => [
      { studentId: demoChildB.id, serviceDate, mealType: "BREAKFAST" as const, priceCents: 0 },
      ...(index < 2 ? [{ studentId: demoChildB.id, serviceDate, mealType: "LUNCH" as const, priceCents: 0 }] : []),
    ]),
  });

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

  // --- Staff users, one per role, with pre-enrolled TOTP --------------------
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
  const staffCreds: { email: string; role: Role; totpSecret: string; totpNow: string }[] = [];
  let superAdminUserId: string | null = null;
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
    staffCreds.push({
      email: spec.email,
      role: spec.role,
      totpSecret,
      totpNow: authenticator.generate(totpSecret),
    });
  }

  const ellaAccount = await prisma.account.findUniqueOrThrow({
    where: { studentId: demoChildA.id },
  });
  const incorrectEntry = await prisma.ledgerEntry.create({
    data: {
      accountId: ellaAccount.id,
      type: "DEPOSIT",
      amountCents: 300,
      description: "Incorrect synthetic cash deposit",
      actorType: "SYSTEM",
    },
  });
  await recordAdjustment({
    originalEntryId: incorrectEntry.id,
    amountCents: -300,
    reason: "Seeded demo correction for an incorrect cash deposit",
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

  const totalStudents = await prisma.student.count();
  const totalGuardians = await prisma.guardian.count();

  console.log("\n================ SEED COMPLETE ================");
  console.log(`District: ${district.name}`);
  console.log(`Schools: ${schools.length}  Students: ${totalStudents}  Guardians: ${totalGuardians}`);
  console.log(`\nShared demo password (all accounts): ${DEMO_PASSWORD}`);
  console.log("\nGuardian sign-in (single factor, no code needed):");
  console.log("  guardian@woodbridge.demo  — Dana Whitfield (2 children: Ella Whitfield, Marcus Okafor)");
  console.log("  posdemo@woodbridge.demo    — Reserved POS students 100003–100007 at Phillis Wheatley");
  console.log("  POS demo: 100003/100004 record cleanly, 100001 is duplicate lunch, 100002 is wrong school");
  console.log("  guardian1@example.com … guardianN@example.com");
  console.log("\nStaff sign-in (require 6-digit authenticator code):");
  for (const c of staffCreds) {
    console.log(`  ${c.email.padEnd(30)} role=${c.role}`);
    console.log(`      TOTP secret: ${c.totpSecret}`);
    console.log(`      code right now: ${c.totpNow}  (30s window — add the secret to an authenticator app)`);
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
