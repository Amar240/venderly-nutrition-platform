import { Prisma, type MealType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireStaff, canAccessSchool } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { deriveBalanceCents } from "@/server/ledger/ledger";
import { lockAccountsForUpdate } from "@/server/ledger/balanceGuard";
import { getStudentTier } from "./pricing";
import { computeMealPriceCents } from "./pricing";
import { getResolvedPricingConfig } from "@/server/pricing/config";

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
  | { status: "recorded"; studentName: string; grade: string; schoolName: string }
  | { status: "duplicate" }
  | { status: "not_active_at_school" };

/** Today's service date as a date-only value (UTC midnight). */
export function serviceDateToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function recordMeal(input: {
  studentNumber: string;
  mealType: MealType;
  session: AppSession | null | undefined;
}): Promise<MealResult> {
  const staff = requireStaff(input.session);

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
  const serviceDate = serviceDateToday();

  try {
    await prisma.$transaction(async (tx) => {
      // The @@unique(studentId, serviceDate, mealType) is the duplicate guard.
      const mealEvent = await tx.mealEvent.create({
        data: {
          studentId: student.id,
          serviceDate,
          mealType: input.mealType,
          priceCents,
          ledgerEntryId: null,
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
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "duplicate" }; // same student + date + meal type
    }
    throw err;
  }

  return {
    status: "recorded",
    studentName: `${student.firstName} ${student.lastName}`,
    grade: student.grade,
    schoolName: student.school.name,
  };
}
