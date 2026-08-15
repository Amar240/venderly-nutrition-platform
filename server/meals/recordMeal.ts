import { Prisma, type MealType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireRole, canAccessSchool } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { deriveBalanceCents } from "@/server/ledger/ledger";
import { lockAccountsForUpdate } from "@/server/ledger/balanceGuard";
import { getStudentTier } from "./pricing";
import { computeMealPriceCents } from "./pricing";
import { getResolvedPricingConfig } from "@/server/pricing/config";
import { notifyIfLowBalanceCrossed } from "@/server/notifications/service";
import { districtToday } from "@/server/time/district";
import { lowBalanceThresholdForChild } from "@/server/household/balance";

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

  // Price is computed here and used ONLY to size the debit. It never leaves.
  const tier = await getStudentTier(student.id);
  const config = await getResolvedPricingConfig(student.districtId, student.schoolId);
  const priceCents = computeMealPriceCents(input.mealType, tier, config);
  const lunchPriceCents = computeMealPriceCents("LUNCH", tier, config);
  const lowBalanceThresholdCents = lowBalanceThresholdForChild({
    balanceCents: student.account?.balanceCents ?? 0,
    lunchPriceCents,
    lowBalanceMealsThreshold: config.lowBalanceMealsThreshold,
    lowBalanceThresholdCents: config.lowBalanceThresholdCents,
  });
  const serviceDate = await districtToday(student.districtId);
  const recordingBatchId = crypto.randomUUID();
  let recordedAt: Date;

  try {
    recordedAt = await prisma.$transaction(async (tx) => {
      // Serialize successful entries and undo validation for this cashier.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${staff.userId} FOR UPDATE`;
      const previous = await tx.mealEvent.findFirst({
        where: { recordedByUserId: staff.userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      });
      const wallClock = new Date();
      const recordedAt = previous && wallClock.getTime() <= previous.createdAt.getTime()
        ? new Date(previous.createdAt.getTime() + 1)
        : wallClock;
      // The partial live-event unique index is the duplicate guard. A retained
      // reversed row does not block a later ordinary recording.
      const mealEvent = await tx.mealEvent.create({
        data: {
          studentId: student.id,
          schoolId: student.schoolId,
          serviceDate,
          mealType: input.mealType,
          priceCents,
          recordedByUserId: staff.userId,
          recordingBatchId,
          ledgerEntryId: null,
          createdAt: recordedAt,
        },
      });
      // Meals are recorded, never denied (only a-la-carte is). Charge only when
      // priced (under CEP the price is $0 and no ledger entry is written).
      if (priceCents > 0 && student.account) {
        await lockAccountsForUpdate(tx, [student.account.id]);
        const debit = await tx.ledgerEntry.create({
          data: {
            accountId: student.account.id,
            type: "MEAL_CHARGE",
            amountCents: -priceCents,
            description: `${input.mealType} meal`,
            actorType: "USER",
            actorId: staff.userId,
          },
        });
        const balance = await deriveBalanceCents(student.account.id, tx);
        await tx.account.update({ where: { id: student.account.id }, data: { balanceCents: balance } });
        await tx.mealEvent.update({ where: { id: mealEvent.id }, data: { ledgerEntryId: debit.id } });
      }
      return recordedAt;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "duplicate" }; // same student + date + meal type
    }
    throw err;
  }

  // A priced meal (non-CEP) can cross the low-balance line; $0 CEP meals can't.
  if (priceCents > 0) {
    await notifyIfLowBalanceCrossed(student.id, priceCents, lowBalanceThresholdCents);
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
