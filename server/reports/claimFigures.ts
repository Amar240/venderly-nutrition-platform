import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import type { MealType } from "@prisma/client";
import { districtToday } from "@/server/time/district";
import { getResolvedPricingConfig } from "@/server/pricing/config";
import { dailyMealCounts } from "./mealCounts";
import { editCheckReport, type EditCheckRow } from "./editCheck";
import { reportScope, type ReportScope } from "./scope";

const FREE_RATE_CAP_UNITS = 100_000;

export interface ClaimMonth {
  year: number;
  month: number;
  value: string;
  label: string;
  isCurrentMonth: boolean;
  from: Date;
  to: Date;
  classificationTo: Date;
}

export interface ClaimSchoolTotal {
  schoolId: string;
  schoolName: string;
  breakfastCount: number;
  lunchCount: number;
  breakfastExtraCount: number;
  lunchExtraCount: number;
  needsAttention: boolean;
}

export interface ClaimSplit {
  total: number;
  freeRate: number;
  paidRate: number;
}

export interface AvailableMonthlyClaimFigures {
  status: "available";
  districtName: string;
  month: ClaimMonth;
  identifiedStudentPercentageBps: number;
  freeRateUnits: number;
  paidRateUnits: number;
  schools: ClaimSchoolTotal[];
  totals: Omit<ClaimSchoolTotal, "schoolId" | "schoolName" | "needsAttention"> & {
    needsAttention: boolean;
  };
  breakfastSplit: ClaimSplit;
  lunchSplit: ClaimSplit;
  exceptions: EditCheckRow[];
}

export interface UnavailableMonthlyClaimFigures {
  status: "unavailable_non_cep" | "unavailable_missing_percentage";
  districtName: string;
  month: ClaimMonth;
  message: string;
}

export type MonthlyClaimFigures =
  | AvailableMonthlyClaimFigures
  | UnavailableMonthlyClaimFigures;

export function calculateCepFreeRateUnits(identifiedStudentPercentageBps: number): number {
  if (
    !Number.isInteger(identifiedStudentPercentageBps) ||
    identifiedStudentPercentageBps < 0 ||
    identifiedStudentPercentageBps > 10_000
  ) {
    throw new RangeError("District percentage must be an integer from 0 through 10000");
  }
  // CEP formula: ISP x 1.6, capped at 100%. Units preserve 87.712% exactly.
  return Math.min(FREE_RATE_CAP_UNITS, identifiedStudentPercentageBps * 16);
}

export function allocateCepClaimSplit(total: number, freeRateUnits: number): ClaimSplit {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("Meal total must be a non-negative integer");
  }
  if (!Number.isInteger(freeRateUnits) || freeRateUnits < 0 || freeRateUnits > FREE_RATE_CAP_UNITS) {
    throw new RangeError("Free-rate units must be an integer from 0 through 100000");
  }
  const freeRate = Math.floor((total * freeRateUnits) / FREE_RATE_CAP_UNITS);
  return { total, freeRate, paidRate: total - freeRate };
}

function dateOnlyUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function monthLastDay(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function monthLabel(year: number, month: number): string {
  return dateOnlyUtc(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function previousCompletedMonth(today: Date): { year: number; month: number } {
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  return currentMonth === 1
    ? { year: currentYear - 1, month: 12 }
    : { year: currentYear, month: currentMonth - 1 };
}

function parseMonthValue(value: string | undefined): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function resolveClaimMonth(
  districtId: string,
  input: { month?: string; now?: Date } = {},
): Promise<ClaimMonth> {
  const today = await districtToday(districtId, input.now);
  const current = {
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  };
  const fallback = previousCompletedMonth(today);
  const parsed = parseMonthValue(input.month);
  const selected =
    parsed && (parsed.year < current.year || (parsed.year === current.year && parsed.month <= current.month))
      ? parsed
      : fallback;
  const isCurrentMonth = selected.year === current.year && selected.month === current.month;
  const from = dateOnlyUtc(selected.year, selected.month, 1);
  const classificationTo = monthLastDay(selected.year, selected.month);
  const to = isCurrentMonth ? today : classificationTo;

  return {
    ...selected,
    value: monthValue(selected.year, selected.month),
    label: monthLabel(selected.year, selected.month),
    isCurrentMonth,
    from,
    to,
    classificationTo,
  };
}

async function monthIsFreeMealsForAll(
  districtId: string,
  scope: ReportScope,
  month: ClaimMonth,
): Promise<boolean> {
  for (const school of scope.schools) {
    for (let date = month.from; date <= month.classificationTo; date = addDays(date, 1)) {
      const config = await getResolvedPricingConfig(districtId, school.id, date);
      if (!config.cepEnabled) return false;
    }
  }
  return true;
}

function zeroSchoolRows(scope: ReportScope): ClaimSchoolTotal[] {
  return scope.schools.map((school) => ({
    schoolId: school.id,
    schoolName: school.name,
    breakfastCount: 0,
    lunchCount: 0,
    breakfastExtraCount: 0,
    lunchExtraCount: 0,
    needsAttention: false,
  }));
}

function addMealTotal(
  target: ClaimSchoolTotal,
  mealType: MealType,
  served: number,
  overrides: number,
) {
  if (mealType === "BREAKFAST") {
    target.breakfastCount += served;
    target.breakfastExtraCount += overrides;
  } else {
    target.lunchCount += served;
    target.lunchExtraCount += overrides;
  }
}

export async function monthlyClaimFigures(
  session: AppSession | null | undefined,
  input: { month?: string; now?: Date } = {},
): Promise<MonthlyClaimFigures> {
  const staff = requireRole(session, "SCHOOL_STAFF", "DISTRICT_ADMIN", "SUPER_ADMIN");
  if (staff.principalType !== "staff") throw new Error("Expected staff session");
  const scope = await reportScope(staff);
  const month = await resolveClaimMonth(scope.districtId, input);
  const district = await prisma.district.findUniqueOrThrow({
    where: { id: scope.districtId },
    select: { name: true, identifiedStudentPercentageBps: true },
  });

  if (district.identifiedStudentPercentageBps === null) {
    return {
      status: "unavailable_missing_percentage",
      districtName: district.name,
      month,
      message:
        "Claim figures are not ready because the district percentage is not set. Update Settings before preparing these figures.",
    };
  }

  const freeMealsForMonth = await monthIsFreeMealsForAll(scope.districtId, scope, month);
  if (!freeMealsForMonth) {
    return {
      status: "unavailable_non_cep",
      districtName: district.name,
      month,
      message:
        "This month is not fully free meals for all students, so this report stops here and PCS remains the place to prepare the claim.",
    };
  }

  const [mealRows, editCheck] = await Promise.all([
    dailyMealCounts(staff, { from: month.from, to: month.to }),
    editCheckReport(staff, { from: month.from, to: month.to }),
  ]);

  const schoolRows = zeroSchoolRows(scope);
  const bySchool = new Map(schoolRows.map((row) => [row.schoolId, row]));
  for (const row of mealRows) {
    const school = bySchool.get(row.schoolId);
    if (school) addMealTotal(school, row.mealType, row.served, row.overrides);
  }

  const exceptions =
    editCheck.status === "available"
      ? editCheck.rows.filter((row) => row.needsAttention)
      : [];
  const exceptionSchools = new Set(exceptions.map((row) => row.schoolId));
  for (const row of schoolRows) {
    row.needsAttention = exceptionSchools.has(row.schoolId);
  }

  const totals = schoolRows.reduce(
    (sum, row) => ({
      breakfastCount: sum.breakfastCount + row.breakfastCount,
      lunchCount: sum.lunchCount + row.lunchCount,
      breakfastExtraCount: sum.breakfastExtraCount + row.breakfastExtraCount,
      lunchExtraCount: sum.lunchExtraCount + row.lunchExtraCount,
      needsAttention: sum.needsAttention || row.needsAttention,
    }),
    {
      breakfastCount: 0,
      lunchCount: 0,
      breakfastExtraCount: 0,
      lunchExtraCount: 0,
      needsAttention: false,
    },
  );
  const freeRateUnits = calculateCepFreeRateUnits(district.identifiedStudentPercentageBps);

  return {
    status: "available",
    districtName: district.name,
    month,
    identifiedStudentPercentageBps: district.identifiedStudentPercentageBps,
    freeRateUnits,
    paidRateUnits: FREE_RATE_CAP_UNITS - freeRateUnits,
    schools: schoolRows,
    totals,
    breakfastSplit: allocateCepClaimSplit(totals.breakfastCount, freeRateUnits),
    lunchSplit: allocateCepClaimSplit(totals.lunchCount, freeRateUnits),
    exceptions,
  };
}
