import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";

/**
 * Meal counting. The headline "meals served" figure is overrideSeq = 0 ONLY —
 * duplicate-meal overrides (seq > 0) are a SEPARATE line and must never be
 * summed into the headline (D-10). This module is the SINGLE source of that
 * rule; every report filters through these constants so none can get it wrong.
 */

/** Headline servings only (the reimbursable count). */
export const SERVED_ONLY = { overrideSeq: 0 } satisfies Prisma.MealEventWhereInput;

/** Documented duplicate-meal overrides only. */
export const OVERRIDES_ONLY = { overrideSeq: { gt: 0 } } satisfies Prisma.MealEventWhereInput;

/** Count normal servings (excludes overrides). */
export function countServedMeals(
  where: Prisma.MealEventWhereInput = {},
  db: typeof prisma = prisma,
): Promise<number> {
  return db.mealEvent.count({ where: { ...where, overrideSeq: 0 } });
}

/** Count documented duplicate-meal overrides only. */
export function countMealOverrides(
  where: Prisma.MealEventWhereInput = {},
  db: typeof prisma = prisma,
): Promise<number> {
  return db.mealEvent.count({ where: { ...where, overrideSeq: { gt: 0 } } });
}
