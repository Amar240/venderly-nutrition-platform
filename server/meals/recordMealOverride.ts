import type { MealType, MealEvent } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { canAccessSchool, requireRole } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";
import { writeAudit } from "@/server/audit/log";
import { districtToday } from "@/server/time/district";

/**
 * Admin duplicate-meal override (rule 6). The POS never creates an override —
 * a cashier who hits a duplicate is told "duplicate", full stop. Only a district
 * admin+ may authorize recording an ADDITIONAL served meal for a slot that
 * already has one, and only WITH a reason. It becomes a distinct MealEvent with
 * overrideSeq > 0 and an AuditLog entry. Overrides are documentation, not a
 * charge (no ledger entry; priceCents 0 in the pilot).
 */
export class MealOverrideError extends Error {
  constructor(public code: "REASON_REQUIRED" | "NO_ORIGINAL") {
    super(code);
    this.name = "MealOverrideError";
  }
}

export async function recordMealOverride(input: {
  studentId: string;
  mealType: MealType;
  serviceDate?: Date;
  reason: string;
  session: AppSession | null | undefined;
}): Promise<MealEvent> {
  requireRole(input.session, "DISTRICT_ADMIN", "SUPER_ADMIN"); // throws AuthError otherwise
  const staff = input.session;
  if (!staff || staff.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  if (!input.reason?.trim()) throw new MealOverrideError("REASON_REQUIRED");

  const serviceDate = input.serviceDate ?? await districtToday(staff.districtId);

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { districtId: true, schoolId: true },
  });
  if (
    !student ||
    student.districtId !== staff.districtId ||
    !canAccessSchool(staff, student.schoolId)
  ) {
    throw new AuthError("FORBIDDEN_SCOPE");
  }

  // There must already be a serving to override; the next seq is max + 1 (≥ 1).
  const agg = await prisma.mealEvent.aggregate({
    where: {
      studentId: input.studentId,
      serviceDate,
      mealType: input.mealType,
      reversedAt: null,
    },
    _max: { overrideSeq: true },
  });
  if (agg._max.overrideSeq === null) {
    throw new MealOverrideError("NO_ORIGINAL");
  }
  const overrideSeq = agg._max.overrideSeq + 1;

  const event = await prisma.mealEvent.create({
    data: {
      studentId: input.studentId,
      schoolId: student.schoolId,
      serviceDate,
      mealType: input.mealType,
      priceCents: 0,
      overrideSeq,
      overrideReason: input.reason,
    },
  });

  await writeAudit({
    actorType: "USER",
    actorId: staff.userId,
    action: "DUPLICATE_MEAL_OVERRIDE",
    subjectType: "student",
    subjectId: input.studentId,
    districtId: staff.districtId,
    reason: input.reason,
    after: { serviceDate: serviceDate.toISOString().slice(0, 10), mealType: input.mealType, overrideSeq },
  });

  return event;
}
