import { Prisma, type MealType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireRole, canAccessSchool } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { deriveBalanceCents } from "@/server/ledger/ledger";
import { lockAccountsForUpdate } from "@/server/ledger/balanceGuard";

export const MEAL_UNDO_WINDOW_MS = 90_000;

export type UndoMealResult =
  | { status: "undone"; mealType: MealType; studentNames: string[] }
  | { status: "unavailable" };

class UndoUnavailableError extends Error {}

/**
 * Reverse the cashier's latest live meal-entry batch. The original MealEvent
 * and any original charge remain; reversal evidence and offsetting ledger rows
 * are written atomically. No price or pricing tier leaves this module.
 */
export async function undoLastMealEntry(input: {
  batchId: string;
  session: AppSession | null | undefined;
  now?: Date;
}): Promise<UndoMealResult> {
  const staff = requireRole(input.session, "CASHIER");
  if (staff.principalType !== "staff") return { status: "unavailable" };
  const reversedAt = input.now ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      // recordMeal takes the same lock, so a new success cannot race the
      // definition of "last" while an undo is being validated.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${staff.userId} FOR UPDATE`;

      const events = await tx.mealEvent.findMany({
        where: {
          recordingBatchId: input.batchId,
          recordedByUserId: staff.userId,
          reversedAt: null,
          overrideSeq: 0,
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          ledgerEntry: { select: { id: true, accountId: true, amountCents: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      if (events.length === 0) throw new UndoUnavailableError();

      const schoolId = events[0]!.schoolId;
      if (
        events.some((event) => event.schoolId !== schoolId) ||
        events.some((event) => event.mealType !== events[0]!.mealType) ||
        !canAccessSchool(staff, schoolId)
      ) {
        throw new UndoUnavailableError();
      }

      const latest = await tx.mealEvent.findFirst({
        where: {
          recordedByUserId: staff.userId,
          schoolId,
          reversedAt: null,
          overrideSeq: 0,
          recordingBatchId: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { recordingBatchId: true },
      });
      if (latest?.recordingBatchId !== input.batchId) throw new UndoUnavailableError();

      const recordedAt = events.reduce(
        (latestTime, event) => event.createdAt > latestTime ? event.createdAt : latestTime,
        events[0]!.createdAt,
      );
      const elapsed = reversedAt.getTime() - recordedAt.getTime();
      if (elapsed < 0 || elapsed >= MEAL_UNDO_WINDOW_MS) throw new UndoUnavailableError();

      const accountIds = events
        .map((event) => event.ledgerEntry?.accountId)
        .filter((id): id is string => Boolean(id));
      await lockAccountsForUpdate(tx, accountIds);

      for (const event of events) {
        const originalCharge = event.ledgerEntry;
        if (originalCharge && originalCharge.amountCents < 0) {
          await tx.ledgerEntry.create({
            data: {
              accountId: originalCharge.accountId,
              type: "CORRECTION",
              amountCents: -originalCharge.amountCents,
              description: `${event.mealType} entry undone`,
              idempotencyKey: `meal-undo:${event.id}`,
              correctsEntryId: originalCharge.id,
              actorType: "USER",
              actorId: staff.userId,
              createdAt: reversedAt,
            },
          });
        }
      }

      for (const accountId of new Set(accountIds)) {
        const balanceCents = await deriveBalanceCents(accountId, tx);
        await tx.account.update({ where: { id: accountId }, data: { balanceCents } });
      }

      const updated = await tx.mealEvent.updateMany({
        where: {
          id: { in: events.map((event) => event.id) },
          reversedAt: null,
        },
        data: { reversedAt, reversedByUserId: staff.userId },
      });
      if (updated.count !== events.length) throw new UndoUnavailableError();

      for (const event of events) {
        await tx.auditLog.create({
          data: {
            actorType: "USER",
            actorId: staff.userId,
            action: "MEAL_ENTRY_UNDONE",
            subjectType: "student",
            subjectId: event.studentId,
            districtId: staff.districtId,
            schoolId,
            reason: "Cashier undid the last meal entry",
            beforeJson: {
              mealEventId: event.id,
              serviceDate: event.serviceDate.toISOString().slice(0, 10),
              mealType: event.mealType,
              recordedAt: event.createdAt.toISOString(),
            },
            afterJson: {
              mealEventId: event.id,
              reversedAt: reversedAt.toISOString(),
            },
            createdAt: reversedAt,
          },
        });
      }

      return {
        status: "undone" as const,
        mealType: events[0]!.mealType,
        studentNames: events.map((event) => `${event.student.firstName} ${event.student.lastName}`),
      };
    });
  } catch (error) {
    if (error instanceof UndoUnavailableError) return { status: "unavailable" };
    // A raced retry can encounter the correction idempotency constraint. It is
    // operationally the same unavailable result and must never duplicate money.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "unavailable" };
    }
    throw error;
  }
}
