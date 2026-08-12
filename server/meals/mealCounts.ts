import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";

/**
 * Meal counting. The headline "meals served" figure is overrideSeq = 0 ONLY —
 * duplicate-meal overrides (seq > 0) are a SEPARATE line and must never be
 * summed into the headline (phase-5b reports build on these). This is the single
 * source of that rule so no report can get it wrong.
 */

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
