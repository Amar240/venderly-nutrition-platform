import { Prisma, type MealType } from "@prisma/client";
import { deriveBalanceCents } from "@/server/ledger/ledger";
import { lockAccountsForUpdate } from "@/server/ledger/balanceGuard";
import { lowBalanceThresholdForChild } from "@/server/household/balance";
import { getResolvedPricingConfig } from "@/server/pricing/config";
import { computeMealPriceCents, getStudentTier } from "./pricing";

export interface RecordableMealStudent {
  id: string;
  districtId: string;
  schoolId: string;
  account: { id: string; balanceCents: number } | null;
}

export interface LowMoneyNotificationCandidate {
  studentId: string;
  debitCents: number;
  thresholdCents: number;
}

export class MealStudentWriteError extends Error {
  constructor(
    public readonly studentId: string,
    public readonly code: "DUPLICATE" | "WRITE_FAILED",
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

/** Serialize a cashier's successes so “latest batch” and its undo receipt agree. */
export async function lockCashierAndChooseRecordedAt(
  tx: Prisma.TransactionClient,
  cashierId: string,
  now = new Date(),
): Promise<Date> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${cashierId} FOR UPDATE`;
  const previous = await tx.mealEvent.findFirst({
    where: { recordedByUserId: cashierId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  return previous && now.getTime() <= previous.createdAt.getTime()
    ? new Date(previous.createdAt.getTime() + 1)
    : now;
}

/**
 * Write one or many already-authorized live meals inside the caller's
 * transaction. Pricing remains entirely inside server/meals and only the
 * notification thresholds leave this helper.
 */
export async function writeMealsAtomic(
  tx: Prisma.TransactionClient,
  input: {
    students: RecordableMealStudent[];
    mealType: MealType;
    serviceDate: Date;
    cashierId: string;
    batchId: string;
    recordedAt: Date;
  },
): Promise<LowMoneyNotificationCandidate[]> {
  const configs = new Map<string, Awaited<ReturnType<typeof getResolvedPricingConfig>>>();
  const prepared: Array<{
    student: RecordableMealStudent;
    priceCents: number;
    thresholdCents: number;
  }> = [];

  for (const student of input.students) {
    try {
      let config = configs.get(student.schoolId);
      if (!config) {
        config = await getResolvedPricingConfig(student.districtId, student.schoolId, tx);
        configs.set(student.schoolId, config);
      }
      const tier = await getStudentTier(student.id, tx);
      const priceCents = computeMealPriceCents(input.mealType, tier, config);
      const lunchPriceCents = computeMealPriceCents("LUNCH", tier, config);
      prepared.push({
        student,
        priceCents,
        thresholdCents: lowBalanceThresholdForChild({
          balanceCents: student.account?.balanceCents ?? 0,
          lunchPriceCents,
          lowBalanceMealsThreshold: config.lowBalanceMealsThreshold,
          lowBalanceThresholdCents: config.lowBalanceThresholdCents,
        }),
      });
    } catch (error) {
      throw new MealStudentWriteError(student.id, "WRITE_FAILED", { cause: error });
    }
  }

  await lockAccountsForUpdate(
    tx,
    prepared
      .filter((entry) => entry.priceCents > 0 && entry.student.account)
      .map((entry) => entry.student.account!.id),
  );

  const notifications: LowMoneyNotificationCandidate[] = [];
  for (const entry of prepared) {
    try {
      const mealEvent = await tx.mealEvent.create({
        data: {
          studentId: entry.student.id,
          schoolId: entry.student.schoolId,
          serviceDate: input.serviceDate,
          mealType: input.mealType,
          priceCents: entry.priceCents,
          recordedByUserId: input.cashierId,
          recordingBatchId: input.batchId,
          ledgerEntryId: null,
          createdAt: input.recordedAt,
        },
      });

      if (entry.priceCents > 0 && entry.student.account) {
        const debit = await tx.ledgerEntry.create({
          data: {
            accountId: entry.student.account.id,
            type: "MEAL_CHARGE",
            amountCents: -entry.priceCents,
            description: input.mealType === "BREAKFAST" ? "Breakfast meal" : "Lunch meal",
            actorType: "USER",
            actorId: input.cashierId,
          },
        });
        const balanceCents = await deriveBalanceCents(entry.student.account.id, tx);
        await tx.account.update({
          where: { id: entry.student.account.id },
          data: { balanceCents },
        });
        await tx.mealEvent.update({
          where: { id: mealEvent.id },
          data: { ledgerEntryId: debit.id },
        });
        notifications.push({
          studentId: entry.student.id,
          debitCents: entry.priceCents,
          thresholdCents: entry.thresholdCents,
        });
      }
    } catch (error) {
      const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      throw new MealStudentWriteError(entry.student.id, duplicate ? "DUPLICATE" : "WRITE_FAILED", { cause: error });
    }
  }
  return notifications;
}
