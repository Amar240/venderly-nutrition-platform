import { prisma } from "@/server/db/client";
import type { MealType } from "@prisma/client";
import { SERVED_ONLY, OVERRIDES_ONLY } from "@/server/meals/mealCounts";
import { reportScope } from "./scope";
import type { AppSession } from "@/server/auth/types";

/**
 * Daily meal counts per school × service date × meal type. D-10: the SERVED
 * count (overrideSeq 0) is the headline; overrides (seq > 0) are a SEPARATE
 * column and are NEVER summed into it. Scoped to the session's schools.
 */
export interface DailyMealCountRow {
  schoolId: string;
  schoolName: string;
  serviceDate: Date;
  mealType: MealType;
  served: number;
  overrides: number;
}

export async function dailyMealCounts(
  session: AppSession | null | undefined,
  range: { from: Date; to: Date },
): Promise<DailyMealCountRow[]> {
  const scope = await reportScope(session);
  const rows: DailyMealCountRow[] = [];

  for (const school of scope.schools) {
    const base = {
      student: { schoolId: school.id },
      serviceDate: { gte: range.from, lte: range.to },
    };
    const [served, overrides] = await Promise.all([
      prisma.mealEvent.groupBy({
        by: ["serviceDate", "mealType"],
        where: { ...base, ...SERVED_ONLY },
        _count: { _all: true },
      }),
      prisma.mealEvent.groupBy({
        by: ["serviceDate", "mealType"],
        where: { ...base, ...OVERRIDES_ONLY },
        _count: { _all: true },
      }),
    ]);

    const key = (d: Date, m: MealType) => `${d.toISOString().slice(0, 10)}|${m}`;
    const merged = new Map<string, DailyMealCountRow>();
    for (const g of served) {
      merged.set(key(g.serviceDate, g.mealType), {
        schoolId: school.id,
        schoolName: school.name,
        serviceDate: g.serviceDate,
        mealType: g.mealType,
        served: g._count._all,
        overrides: 0,
      });
    }
    for (const g of overrides) {
      const k = key(g.serviceDate, g.mealType);
      const existing = merged.get(k);
      if (existing) existing.overrides = g._count._all;
      else
        merged.set(k, {
          schoolId: school.id,
          schoolName: school.name,
          serviceDate: g.serviceDate,
          mealType: g.mealType,
          served: 0,
          overrides: g._count._all,
        });
    }
    rows.push(...merged.values());
  }

  rows.sort(
    (a, b) =>
      b.serviceDate.getTime() - a.serviceDate.getTime() ||
      a.schoolName.localeCompare(b.schoolName) ||
      a.mealType.localeCompare(b.mealType),
  );
  return rows;
}
