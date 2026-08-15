import type { MealType } from "@prisma/client";
import { prisma } from "@/server/db/client";

export const DEFAULT_DISTRICT_TIME_ZONE = "America/New_York";

function datePartsInZone(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) => {
    const part = parts.find((p) => p.type === type)?.value;
    if (!part) throw new Error(`Missing ${type} part for ${timeZone}`);
    return Number(part);
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
  };
}

export function dateOnlyUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Resolve a date-only value in a named district time zone, never host-local time. */
export function districtDateOnly(
  timeZone: string,
  now: Date = new Date(),
): Date {
  const parts = datePartsInZone(timeZone, now);
  return dateOnlyUtc(parts.year, parts.month, parts.day);
}

export function minutesAfterMidnightInZone(timeZone: string, now: Date): number {
  const parts = datePartsInZone(timeZone, now);
  return parts.hour * 60 + parts.minute;
}

export async function districtToday(
  districtId: string,
  now: Date = new Date(),
): Promise<Date> {
  const district = await prisma.district.findUnique({
    where: { id: districtId },
    select: { timeZone: true },
  });
  const zone = district?.timeZone ?? DEFAULT_DISTRICT_TIME_ZONE;
  return districtDateOnly(zone, now);
}

export async function isAfterServiceEnd(
  districtId: string,
  schoolId: string,
  mealType: MealType,
  now: Date = new Date(),
): Promise<boolean | null> {
  const [district, school] = await Promise.all([
    prisma.district.findUnique({ where: { id: districtId }, select: { timeZone: true } }),
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { breakfastServiceEndMinutes: true, lunchServiceEndMinutes: true },
    }),
  ]);
  if (!school) return null;
  const end =
    mealType === "BREAKFAST"
      ? school.breakfastServiceEndMinutes
      : school.lunchServiceEndMinutes;
  if (end === null || end === undefined) return null;
  const zone = district?.timeZone ?? DEFAULT_DISTRICT_TIME_ZONE;
  return minutesAfterMidnightInZone(zone, now) >= end;
}
