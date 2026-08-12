/**
 * Synthetic seed — idempotent (full reset + reload). Produces:
 *  - 1 district, 4 schools
 *  - ~200 students in multi-child households with differing surnames
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

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1";

// --- deterministic RNG so reloads reproduce the same dataset ---------------
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260812);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
const randint = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

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

interface SchoolSpec {
  name: string;
  code: string;
  grades: string[];
}
const SCHOOL_SPECS: SchoolSpec[] = [
  { name: "Woodbridge Elementary", code: "WES", grades: ["K", "1", "2", "3", "4", "5"] },
  { name: "Maple Grove Elementary", code: "MGE", grades: ["K", "1", "2", "3", "4", "5"] },
  { name: "Riverside Middle", code: "RMS", grades: ["6", "7", "8"] },
  { name: "Woodbridge High", code: "WHS", grades: ["9", "10", "11", "12"] },
];

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function reset() {
  // Delete in FK-safe order.
  await prisma.itemSale.deleteMany();
  await prisma.mealEvent.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.ledgerEntry.deleteMany();
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
    data: { name: "Woodbridge School District" },
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
  for (const spec of SCHOOL_SPECS) {
    const school = await prisma.school.create({
      data: { districtId: district.id, name: spec.name, code: spec.code },
    });
    schools.push({ ...school, grades: spec.grades });
  }
  const [wes, mge, rms, whs] = schools;

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
      schoolId: wes!.id,
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
      schoolId: rms!.id,
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

  let studentCount = 2; // the two demo children
  let householdIndex = 0;

  console.log("Creating households and students…");
  while (studentCount < 200) {
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

    for (let c = 0; c < householdSize && studentCount < 200; c++) {
      const school = pick(schools);
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

  // --- Staff users, one per role, with pre-enrolled TOTP --------------------
  interface StaffSpec {
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    schoolIds: string[];
  }
  const staffSpecs: StaffSpec[] = [
    { email: "cashier@woodbridge.demo", firstName: "Casey", lastName: "Nguyen", role: "CASHIER", schoolIds: [wes!.id] },
    { email: "staff@woodbridge.demo", firstName: "Sam", lastName: "Patel", role: "SCHOOL_STAFF", schoolIds: [wes!.id] },
    { email: "districtadmin@woodbridge.demo", firstName: "Drew", lastName: "Garcia", role: "DISTRICT_ADMIN", schoolIds: schools.map((s) => s.id) },
    { email: "superadmin@woodbridge.demo", firstName: "Robin", lastName: "Osei", role: "SUPER_ADMIN", schoolIds: schools.map((s) => s.id) },
  ];

  const staffPasswordHash = await hash(DEMO_PASSWORD);
  const staffCreds: { email: string; role: Role; totpSecret: string; totpNow: string }[] = [];
  for (const spec of staffSpecs) {
    const totpSecret = authenticator.generateSecret();
    await prisma.user.create({
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
    staffCreds.push({
      email: spec.email,
      role: spec.role,
      totpSecret,
      totpNow: authenticator.generate(totpSecret),
    });
  }

  // --- Default price tier for every student ---------------------------------
  // Pricing INPUT only (server/meals reads it); default FREE under CEP.
  const allStudents = await prisma.student.findMany({ select: { id: true } });
  await prisma.studentPricing.createMany({
    data: allStudents.map((s) => ({
      studentId: s.id,
      tier: "FREE" as const,
      source: "DEFAULT" as const,
    })),
    skipDuplicates: true,
  });

  // --- Sample notification + delivery log (phase 5 generates these for real) -
  await prisma.notification.create({
    data: {
      districtId: district.id,
      schoolId: rms!.id,
      guardianId: demoGuardian.id,
      type: "LOW_BALANCE",
      title: "Low balance: Marcus Okafor",
      body: "Marcus Okafor's balance is below the $10.00 low-balance threshold.",
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
