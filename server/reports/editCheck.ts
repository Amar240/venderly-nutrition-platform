import { prisma } from "@/server/db/client";
import type { AppSession } from "@/server/auth/types";
import type { MealType } from "@prisma/client";
import { dailyMealCounts } from "./mealCounts";
import { reportScope } from "./scope";

/**
 * The attendance percentage is district-owned external compliance input (D-14).
 * Woodbridge's seed stores the 93.8% FNS federal default; this service never
 * substitutes a default when district configuration is missing.
 */

export interface EditCheckRow {
  schoolId: string;
  schoolName: string;
  serviceDate: Date;
  mealType: MealType;
  activeEnrollment: number;
  claimedCount: number;
  ceiling: number;
  needsAttention: boolean;
}

export interface AvailableEditCheckReport {
  status: "available";
  districtName: string;
  factorBps: number;
  rows: EditCheckRow[];
}

export interface UnavailableEditCheckReport {
  status: "unavailable";
  message: string;
}

export type EditCheckReport =
  | AvailableEditCheckReport
  | UnavailableEditCheckReport;

export function editCheckCeiling(
  activeEnrollment: number,
  factorBps: number,
): number {
  if (!Number.isInteger(activeEnrollment) || activeEnrollment < 0) {
    throw new RangeError("Active enrollment must be a non-negative integer");
  }
  if (!Number.isInteger(factorBps) || factorBps < 0 || factorBps > 10_000) {
    throw new RangeError("District percentage must be an integer from 0 through 10000");
  }
  // D-14: this is a maximum for flagging over-claims, so fractions round down.
  return Math.floor((activeEnrollment * factorBps) / 10_000);
}

export async function editCheckReport(
  session: AppSession | null | undefined,
  range: { from: Date; to: Date },
): Promise<EditCheckReport> {
  const scope = await reportScope(session);
  const [district, mealRows, enrollmentGroups] = await Promise.all([
    prisma.district.findUnique({
      where: { id: scope.districtId },
      select: { name: true, stateAttendanceFactorBps: true },
    }),
    // Reuse the claim-facing daily count service and its shared D-10 filter.
    dailyMealCounts(session, range),
    prisma.student.groupBy({
      by: ["schoolId"],
      where: {
        districtId: scope.districtId,
        schoolId: { in: scope.schools.map((school) => school.id) },
        enrollmentStatus: "ACTIVE",
      },
      _count: { _all: true },
    }),
  ]);

  if (!district || district.stateAttendanceFactorBps === null) {
    return {
      status: "unavailable",
      message:
        "Meal-count ceilings are not available because the district percentage is not set. Ask a system administrator to update the district record.",
    };
  }

  const factorBps = district.stateAttendanceFactorBps;

  const enrollmentBySchool = new Map(
    enrollmentGroups.map((group) => [group.schoolId, group._count._all]),
  );

  const rows = mealRows.map((row) => {
    const activeEnrollment = enrollmentBySchool.get(row.schoolId) ?? 0;
    const ceiling = editCheckCeiling(
      activeEnrollment,
      factorBps,
    );
    return {
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      serviceDate: row.serviceDate,
      mealType: row.mealType,
      activeEnrollment,
      claimedCount: row.served,
      ceiling,
      needsAttention: row.served > ceiling,
    };
  });

  return {
    status: "available",
    districtName: district.name,
    factorBps,
    rows,
  };
}
