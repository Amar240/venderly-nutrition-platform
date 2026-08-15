import type { PriceTier, PricingSource } from "@prisma/client";

export const DEMO_STUDENT_COUNT = 200;
export const WOODBRIDGE_IDENTIFIED_STUDENT_PERCENTAGE_BPS = 5482;
// FNS federal default under 7 CFR 210.8. This is not a Delaware-specific value.
export const WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS = 9380;

export interface WoodbridgeSchoolSpec {
  name: string;
  code: string;
  grades: string[];
  realEnrollment: number;
}

export interface SeedSchoolSpec extends WoodbridgeSchoolSpec {
  seedCount: number;
}

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

export const WOODBRIDGE_SEED_SCHOOLS = scaleEnrollmentCounts(
  WOODBRIDGE_SCHOOLS,
  DEMO_STUDENT_COUNT,
);

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
