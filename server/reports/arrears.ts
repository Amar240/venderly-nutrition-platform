import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";
import { reportScope } from "./scope";

export interface ArrearsRow {
  studentId: string;
  studentNumber: string;
  studentName: string;
  schoolId: string;
  schoolName: string;
  amountOwedCents: number;
  streakStartedAt: Date;
  streakStartDate: Date;
  daysOwed: number;
  durationLabel: string;
  enrollmentStatus: "ACTIVE" | "INACTIVE";
}

function datePartsInZone(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

function dateOnlyInZone(timeZone: string, date: Date): Date {
  const parts = datePartsInZone(timeZone, date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function dayDifference(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay));
}

export function arrearsDurationLabel(daysOwed: number): string {
  if (daysOwed === 0) return "Today";
  if (daysOwed === 1) return "1 day";
  return `${daysOwed} days`;
}

export function currentNegativeStreak(
  entries: { amountCents: number; createdAt: Date }[],
): { balanceCents: number; streakStartedAt: Date | null } {
  let balanceCents = 0;
  let streakStartedAt: Date | null = null;
  for (const entry of entries) {
    const next = balanceCents + entry.amountCents;
    if (balanceCents >= 0 && next < 0) {
      streakStartedAt = entry.createdAt;
    }
    if (next >= 0) {
      streakStartedAt = null;
    }
    balanceCents = next;
  }
  return {
    balanceCents,
    streakStartedAt: balanceCents < 0 ? streakStartedAt : null,
  };
}

export async function arrearsReport(
  session: AppSession | null | undefined,
  input: { schoolId?: string; now?: Date } = {},
): Promise<{ districtName: string; rows: ArrearsRow[]; schools: { id: string; name: string }[] }> {
  requireRole(session, "SCHOOL_STAFF", "DISTRICT_ADMIN", "SUPER_ADMIN");
  const scope = await reportScope(session);
  const selectedSchools = input.schoolId
    ? scope.schools.filter((school) => school.id === input.schoolId)
    : scope.schools;
  if (input.schoolId && selectedSchools.length === 0) {
    throw new AuthError("FORBIDDEN_SCOPE");
  }
  const schoolIds = selectedSchools.map((school) => school.id);
  const schoolNameById = new Map(scope.schools.map((school) => [school.id, school.name]));

  const district = await prisma.district.findUniqueOrThrow({
    where: { id: scope.districtId },
    select: { name: true, timeZone: true },
  });
  const nowDate = input.now ?? new Date();
  const today = dateOnlyInZone(district.timeZone, nowDate);

  const accounts = await prisma.account.findMany({
    where: {
      student: {
        districtId: scope.districtId,
        schoolId: { in: schoolIds },
      },
    },
    select: {
      id: true,
      student: {
        select: {
          id: true,
          studentNumber: true,
          firstName: true,
          lastName: true,
          schoolId: true,
          enrollmentStatus: true,
        },
      },
      ledgerEntries: {
        select: { amountCents: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  const rows: ArrearsRow[] = [];
  for (const account of accounts) {
    const streak = currentNegativeStreak(account.ledgerEntries);
    if (!streak.streakStartedAt || streak.balanceCents >= 0) continue;
    const startDate = dateOnlyInZone(district.timeZone, streak.streakStartedAt);
    const daysOwed = dayDifference(startDate, today);
    rows.push({
      studentId: account.student.id,
      studentNumber: account.student.studentNumber,
      studentName: `${account.student.firstName} ${account.student.lastName}`,
      schoolId: account.student.schoolId,
      schoolName: schoolNameById.get(account.student.schoolId) ?? "School",
      amountOwedCents: Math.abs(streak.balanceCents),
      streakStartedAt: streak.streakStartedAt,
      streakStartDate: startDate,
      daysOwed,
      durationLabel: arrearsDurationLabel(daysOwed),
      enrollmentStatus: account.student.enrollmentStatus,
    });
  }

  rows.sort((a, b) =>
    b.daysOwed - a.daysOwed
    || b.amountOwedCents - a.amountOwedCents
    || a.studentName.localeCompare(b.studentName),
  );

  return { districtName: district.name, schools: scope.schools, rows };
}
