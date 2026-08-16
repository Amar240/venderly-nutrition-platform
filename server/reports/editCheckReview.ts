import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { canAccessSchool, requireRole } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import type { MealType } from "@prisma/client";
import { AuthError } from "@/server/auth/errors";

export interface MarkExceptionReviewedInput {
  schoolId: string;
  serviceDate: Date;
  mealType: MealType;
  note?: string;
}

/**
 * Minimal review-tracking for an edit-check exception (Stage D item 5, the
 * claim pack). Not ledger money — re-marking upserts who/when/note rather
 * than appending a new row.
 */
export async function markExceptionReviewed(
  session: AppSession | null | undefined,
  input: MarkExceptionReviewedInput,
): Promise<void> {
  const staff = requireRole(session, "SCHOOL_STAFF", "DISTRICT_ADMIN", "SUPER_ADMIN");
  if (staff.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  if (!canAccessSchool(session, input.schoolId)) throw new AuthError("FORBIDDEN_SCOPE");

  const note = input.note?.trim() || null;

  await prisma.editCheckReview.upsert({
    where: {
      schoolId_serviceDate_mealType: {
        schoolId: input.schoolId,
        serviceDate: input.serviceDate,
        mealType: input.mealType,
      },
    },
    create: {
      schoolId: input.schoolId,
      serviceDate: input.serviceDate,
      mealType: input.mealType,
      reviewedByUserId: staff.userId,
      note,
    },
    update: {
      reviewedByUserId: staff.userId,
      reviewedAt: new Date(),
      note,
    },
  });

  await writeAudit({
    actorType: "USER",
    actorId: staff.userId,
    action: "EDIT_CHECK_EXCEPTION_REVIEWED",
    subjectType: "meal-count-exception",
    subjectId: `${input.schoolId}:${input.serviceDate.toISOString().slice(0, 10)}:${input.mealType}`,
    districtId: staff.districtId,
    schoolId: input.schoolId,
    reason: note,
    after: {
      schoolId: input.schoolId,
      serviceDate: input.serviceDate.toISOString().slice(0, 10),
      mealType: input.mealType,
    },
  });
}
