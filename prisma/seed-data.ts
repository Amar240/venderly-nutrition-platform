import type { PriceTier, PricingSource } from "@prisma/client";

export const DEMO_STUDENT_COUNT = 200;
export const WOODBRIDGE_IDENTIFIED_STUDENT_PERCENTAGE_BPS = 5482;
// FNS federal default under 7 CFR 210.8. This is not a Delaware-specific value.
export const WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS = 9380;
export const MEAL_HISTORY_SEED = 20260816;
export const MEAL_HISTORY_LOOKBACK_DAYS = 45;
// One-indexed weekday positions within the rolling window. These are deliberate
// synthetic closures so operating-day queries cannot accidentally assume that
// every weekday was a school day.
export const MEAL_HISTORY_CLOSURE_ORDINALS = [7, 17, 27] as const;

export interface WoodbridgeSchoolSpec {
  name: string;
  code: string;
  grades: string[];
  realEnrollment: number;
}

export interface SeedSchoolSpec extends WoodbridgeSchoolSpec {
  seedCount: number;
}

/*
 * Two interchangeable school sets.
 *
 * The DEMO set is the default: invented names for showing the product to any
 * district. Real school names belonging to one district must never appear in a
 * demo given to another — a prospect has no way to know the roster is
 * synthetic, and "here are another client's schools, balances, and arrears" is
 * the wrong first impression.
 *
 * The WOODBRIDGE set is kept for that specific pitch.
 *
 * The two sets are positionally identical: index 0 is always the early-years
 * school that runs roster mode, index 2 always carries the edit-check breach,
 * index 3 always holds the graduating balances, and 4 and 5 are always the tiny
 * alternative programs that exercise small-cell handling. Every seeded fixture
 * is pinned to a school's ROLE, not its name, so swapping sets changes only the
 * words on screen.
 */

export const DEMO_SCHOOLS: WoodbridgeSchoolSpec[] = [
  {
    name: "Demo Early Learning Center",
    code: "7760",
    grades: ["PK", "K", "1", "2"],
    realEnrollment: 700,
  },
  {
    name: "Demo Elementary School",
    code: "0779",
    grades: ["3", "4", "5"],
    realEnrollment: 648,
  },
  {
    name: "Demo Middle School",
    code: "7750",
    grades: ["6", "7", "8"],
    realEnrollment: 591,
  },
  {
    name: "Demo High School",
    code: "0780",
    grades: ["9", "10", "11", "12"],
    realEnrollment: 716,
  },
  {
    name: "Demo Learning Center North",
    code: "0781",
    grades: ["UG"],
    realEnrollment: 31,
  },
  {
    name: "Demo Learning Center South",
    code: "0782",
    grades: ["UG"],
    realEnrollment: 34,
  },
];

export const WOODBRIDGE_SCHOOLS: WoodbridgeSchoolSpec[] = [
  {
    name: "Woodbridge Early Childhood Education Center",
    code: "7760",
    grades: ["PK", "K", "1", "2"],
    realEnrollment: 700,
  },
  {
    name: "Phillis Wheatley Elementary",
    code: "0779",
    grades: ["3", "4", "5"],
    realEnrollment: 648,
  },
  {
    name: "Woodbridge Middle",
    code: "7750",
    grades: ["6", "7", "8"],
    realEnrollment: 591,
  },
  {
    name: "Woodbridge High",
    code: "0780",
    grades: ["9", "10", "11", "12"],
    realEnrollment: 716,
  },
  {
    name: "S.C.O.P.E. North",
    code: "0781",
    grades: ["UG"],
    realEnrollment: 31,
  },
  {
    name: "S.C.O.P.E. South",
    code: "0782",
    grades: ["UG"],
    realEnrollment: 34,
  },
];

/** Districts the seed can build. `SEED_DISTRICT=woodbridge` selects the other. */
export const DEMO_DISTRICT_NAME = "Demo School District";
export const WOODBRIDGE_DISTRICT_NAME = "Woodbridge School District";

export function activeDistrictName(): string {
  return process.env.SEED_DISTRICT === "woodbridge"
    ? WOODBRIDGE_DISTRICT_NAME
    : DEMO_DISTRICT_NAME;
}

export function activeSchools(): WoodbridgeSchoolSpec[] {
  return process.env.SEED_DISTRICT === "woodbridge" ? WOODBRIDGE_SCHOOLS : DEMO_SCHOOLS;
}

export function totalRealEnrollment(schools = WOODBRIDGE_SCHOOLS): number {
  return schools.reduce((sum, school) => sum + school.realEnrollment, 0);
}

export function scaleEnrollmentCounts(
  schools: WoodbridgeSchoolSpec[],
  targetCount: number,
): SeedSchoolSpec[] {
  const total = totalRealEnrollment(schools);
  const scaled = schools.map((school, index) => {
    const exact = (school.realEnrollment / total) * targetCount;
    return {
      school,
      index,
      floor: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  const allocated = scaled.reduce((sum, item) => sum + item.floor, 0);
  const extras = targetCount - allocated;
  const extraIndexes = new Set(
    [...scaled]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, extras)
      .map((item) => item.index),
  );

  return scaled.map(({ school, floor, index }) => ({
    ...school,
    seedCount: floor + (extraIndexes.has(index) ? 1 : 0),
  }));
}

/** The set the seed will actually build, scaled to DEMO_STUDENT_COUNT. */
export const SEED_SCHOOLS = scaleEnrollmentCounts(
  activeSchools(),
  DEMO_STUDENT_COUNT,
);

export const WOODBRIDGE_MEAL_PARTICIPATION: Record<
  string,
  { breakfastPercent: number; lunchPercent: number }
> = {
  "7760": { breakfastPercent: 55, lunchPercent: 85 },
  "0779": { breakfastPercent: 50, lunchPercent: 82 },
  "7750": { breakfastPercent: 35, lunchPercent: 70 },
  "0780": { breakfastPercent: 25, lunchPercent: 55 },
  "0781": { breakfastPercent: 50, lunchPercent: 80 },
  "0782": { breakfastPercent: 50, lunchPercent: 80 },
};

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
  ));
}

export interface MealHistoryCalendar {
  operatingDays: Date[];
  closureDays: Date[];
}

/** Build the rolling synthetic school calendar from a district-safe date-only value. */
export function buildMealHistoryCalendar(today: Date): MealHistoryCalendar {
  const start = addUtcDays(today, -(MEAL_HISTORY_LOOKBACK_DAYS - 1));
  const weekdays: Date[] = [];
  for (let offset = 0; offset < MEAL_HISTORY_LOOKBACK_DAYS; offset += 1) {
    const date = addUtcDays(start, offset);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) weekdays.push(date);
  }

  const closureIndexes = new Set(
    MEAL_HISTORY_CLOSURE_ORDINALS.map((ordinal) => ordinal - 1),
  );
  return {
    operatingDays: weekdays.filter((_, index) => !closureIndexes.has(index)),
    closureDays: weekdays.filter((_, index) => closureIndexes.has(index)),
  };
}

function hashSeedPart(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scenarioSeed(...parts: string[]): number {
  return (MEAL_HISTORY_SEED ^ hashSeedPart(parts.join("|"))) >>> 0;
}

/** Daily participation varies by a deterministic three percentage points. */
export function dailyParticipationPercent(input: {
  basePercent: number;
  schoolCode: string;
  serviceDate: Date;
  mealType: "BREAKFAST" | "LUNCH";
}): number {
  const rng = mulberry32(scenarioSeed(
    input.schoolCode,
    dateKey(input.serviceDate),
    input.mealType,
  ));
  const jitter = Math.floor(rng() * 7) - 3;
  return Math.max(0, Math.min(100, input.basePercent + jitter));
}

/** Round a participation target normally, then cap ordinary days at the ceiling. */
export function participationTarget(
  activeEnrollment: number,
  percent: number,
  ceiling: number,
): number {
  return Math.min(ceiling, Math.round((activeEnrollment * percent) / 100));
}

/** Stable per-day student shuffle, independent of the student-generation RNG. */
export function orderStudentsForMeal<T extends { studentNumber: string }>(
  students: T[],
  input: { schoolCode: string; serviceDate: Date; mealType: "BREAKFAST" | "LUNCH"; purpose?: string },
): T[] {
  return shuffled(
    students,
    scenarioSeed(
      input.schoolCode,
      dateKey(input.serviceDate),
      input.mealType,
      input.purpose ?? "ordinary",
    ),
  );
}

export interface ClassroomSeedSpec {
  schoolCode: "7760" | "0779";
  teacherName: string;
  grade: string;
}

export const WOODBRIDGE_CLASSROOMS: ClassroomSeedSpec[] = [
  { schoolCode: "7760", teacherName: "Cameron Ellis", grade: "PK" },
  { schoolCode: "7760", teacherName: "Jordan Reyes", grade: "K" },
  { schoolCode: "7760", teacherName: "Morgan Brooks", grade: "1" },
  { schoolCode: "7760", teacherName: "Taylor Bennett", grade: "2" },
  { schoolCode: "0779", teacherName: "Priya Shah", grade: "3" },
  { schoolCode: "0779", teacherName: "Daniel Carter", grade: "3" },
  { schoolCode: "0779", teacherName: "Lena Morales", grade: "4" },
  { schoolCode: "0779", teacherName: "Marcus Reed", grade: "4" },
  { schoolCode: "0779", teacherName: "Aisha Turner", grade: "5" },
  { schoolCode: "0779", teacherName: "Henry Kim", grade: "5" },
];

export function classroomTeacherForPosition(
  schoolCode: string,
  grade: string,
  gradePosition: number,
): string | null {
  const choices = WOODBRIDGE_CLASSROOMS.filter(
    (classroom) => classroom.schoolCode === schoolCode && classroom.grade === grade,
  );
  if (choices.length === 0) return null;
  return choices[gradePosition % choices.length]!.teacherName;
}

export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildRemainingSchoolSlots(params: {
  schools: SeedSchoolSpec[];
  alreadyAssignedByCode: Record<string, number>;
  seed: number;
}): string[] {
  const slots: string[] = [];
  for (const school of params.schools) {
    const remaining = school.seedCount - (params.alreadyAssignedByCode[school.code] ?? 0);
    if (remaining < 0) {
      throw new Error(`Too many featured students assigned to ${school.code}`);
    }
    for (let i = 0; i < remaining; i += 1) slots.push(school.code);
  }
  return shuffled(slots, params.seed);
}

export function allocatePricingTiers(
  studentCount: number,
  seed = 20260815,
): PriceTier[] {
  const freeCount = Math.round(studentCount * 0.65);
  const reducedCount = Math.round(studentCount * 0.08);
  const paidCount = studentCount - freeCount - reducedCount;
  return shuffled(
    [
      ...Array.from({ length: freeCount }, () => "FREE" as const),
      ...Array.from({ length: reducedCount }, () => "REDUCED" as const),
      ...Array.from({ length: paidCount }, () => "PAID" as const),
    ],
    seed,
  );
}

export function buildStudentPricingRows(
  studentIds: string[],
): { studentId: string; tier: PriceTier; source: PricingSource }[] {
  const tiers = allocatePricingTiers(studentIds.length);
  return studentIds.map((studentId, index) => ({
    studentId,
    tier: tiers[index]!,
    source: "DISTRICT_EXPORT",
  }));
}
