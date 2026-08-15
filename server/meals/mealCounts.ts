import { prisma } from "@/server/db/client";
import type { MealType, Prisma } from "@prisma/client";

/**
 * Meal counting. Reversed events never count. Among live events, overrideSeq 0
 * is the reimbursable headline and seq > 0 is a separate administrator-override
 * line (D-10). Claim work must consume these shared filters.
 */

/** Headline servings only (the reimbursable count). */
export const SERVED_ONLY = {
  overrideSeq: 0,
  reversedAt: null,
} satisfies Prisma.MealEventWhereInput;

/** Documented duplicate-meal overrides only. */
export const OVERRIDES_ONLY = {
  overrideSeq: { gt: 0 },
  reversedAt: null,
} satisfies Prisma.MealEventWhereInput;

/** Count normal servings (excludes overrides). */
export function countServedMeals(
  where: Prisma.MealEventWhereInput = {},
  db: typeof prisma = prisma,
): Promise<number> {
  return db.mealEvent.count({ where: { ...where, ...SERVED_ONLY } });
}

/** Count documented duplicate-meal overrides only. */
export function countMealOverrides(
  where: Prisma.MealEventWhereInput = {},
  db: typeof prisma = prisma,
): Promise<number> {
  return db.mealEvent.count({ where: { ...where, ...OVERRIDES_ONLY } });
}

/**
 * Resolve the students who already have a live normal meal for one service.
 * Roster reads, keypad preflight, and batch commit all share this definition;
 * the database partial unique index remains the final concurrency guard.
 */
export async function findLiveServedStudentIds(
  input: {
    studentIds: string[];
    serviceDate: Date;
    mealType: MealType;
    schoolId?: string;
  },
  db: Pick<Prisma.TransactionClient, "mealEvent"> = prisma,
): Promise<Set<string>> {
  if (input.studentIds.length === 0) return new Set();
  const rows = await db.mealEvent.findMany({
    where: {
      studentId: { in: input.studentIds },
      serviceDate: input.serviceDate,
      mealType: input.mealType,
      ...(input.schoolId ? { schoolId: input.schoolId } : {}),
      ...SERVED_ONLY,
    },
    select: { studentId: true },
  });
  return new Set(rows.map((row) => row.studentId));
}
