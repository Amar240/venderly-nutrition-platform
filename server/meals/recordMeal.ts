import { Prisma, type MealType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireRole, canAccessSchool } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { notifyIfLowBalanceCrossed } from "@/server/notifications/service";
import { triggerAutomaticTopUpsForDebit } from "@/server/household/autoTopUp";
import { districtToday } from "@/server/time/district";
import { findLiveServedStudentIds } from "./mealCounts";
import { lockCashierAndChooseRecordedAt, MealStudentWriteError, writeMealsAtomic } from "./recordMealsAtomic";

/**
 * Meal recording — the POS entry point for breakfast/lunch.
 *
 * CONFIDENTIALITY (rule 5 / D-1): the price tier is read ONLY to compute the
 * charge and is NEVER returned, logged, or placed in the result. The result is
 * a pure operational status plus display name/grade/school — no price, no tier,
 * no eligibility category. `not_active_at_school` deliberately covers unknown
 * number / inactive / wrong-school alike so nothing about a student leaks.
 */
export type MealResult =
  | {
      status: "recorded";
      studentName: string;
      grade: string;
      schoolName: string;
      undo: { batchId: string; expiresAt: string };
    }
  | { status: "duplicate" }
  | { status: "not_active_at_school" };

export async function recordMeal(input: {
  studentNumber: string;
  mealType: MealType;
  session: AppSession | null | undefined;
}): Promise<MealResult> {
  const staff = requireRole(input.session, "CASHIER");
  if (staff.principalType !== "staff") return { status: "not_active_at_school" };

  const student = await prisma.student.findUnique({
    where: {
      districtId_studentNumber: {
        districtId: staff.districtId,
        studentNumber: input.studentNumber.trim(),
      },
    },
    include: { school: true, account: true },
  });
  if (
    !student ||
    student.enrollmentStatus !== "ACTIVE" ||
    !canAccessSchool(input.session, student.schoolId)
  ) {
    return { status: "not_active_at_school" };
  }

  const serviceDate = await districtToday(student.districtId);
  const alreadyRecorded = await findLiveServedStudentIds({
    studentIds: [student.id],
    schoolId: student.schoolId,
    serviceDate,
    mealType: input.mealType,
  });
  if (alreadyRecorded.has(student.id)) return { status: "duplicate" };

  const recordingBatchId = crypto.randomUUID();
  let recordedAt: Date;
  let notifications: Awaited<ReturnType<typeof writeMealsAtomic>> = [];

  try {
    const committed = await prisma.$transaction(async (tx) => {
      const at = await lockCashierAndChooseRecordedAt(tx, staff.userId);
      const notifications = await writeMealsAtomic(tx, {
        students: [student],
        mealType: input.mealType,
        serviceDate,
        cashierId: staff.userId,
        batchId: recordingBatchId,
        recordedAt: at,
      });
      return { recordedAt: at, notifications };
    });
    recordedAt = committed.recordedAt;
    notifications = committed.notifications;
  } catch (err) {
    if (err instanceof MealStudentWriteError && err.code === "DUPLICATE") {
      return { status: "duplicate" };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "duplicate" }; // same student + date + meal type
    }
    throw err;
  }

  for (const notification of notifications) {
    try {
      await notifyIfLowBalanceCrossed(
        notification.studentId,
        notification.debitCents,
        notification.thresholdCents,
      );
      await triggerAutomaticTopUpsForDebit({
        studentId: notification.studentId,
        debitCents: notification.debitCents,
        triggeringLedgerEntryId: notification.ledgerEntryId,
      });
    } catch (error) {
      // The meal is already committed; notification delivery must not make the
      // cashier believe it failed and record the child a second time.
      console.error("[meal] low-money notification failed after recording", error);
    }
  }

  return {
    status: "recorded",
    studentName: `${student.firstName} ${student.lastName}`,
    grade: student.grade,
    schoolName: student.school.name,
    undo: {
      batchId: recordingBatchId,
      expiresAt: new Date(recordedAt.getTime() + 90_000).toISOString(),
    },
  };
}
