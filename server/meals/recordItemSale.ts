import { prisma } from "@/server/db/client";
import { requireStaff, canAccessSchool } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { deriveBalanceCents, LedgerError } from "@/server/ledger/ledger";
import { lockAccountsForUpdate, assertCanDebit } from "@/server/ledger/balanceGuard";
import { notifyIfLowBalanceCrossed } from "@/server/notifications/service";
import { resolveLowBalanceThresholdCents } from "@/server/pricing/config";

/**
 * A-la-carte sale. Unlike a meal, this CAN be denied when the balance is short.
 * The insufficient-balance check reuses the shared D-7 guard
 * (lockAccountsForUpdate + assertCanDebit) — it does not reimplement it. The
 * result carries no price/tier/eligibility, only an operational status.
 */
export type ItemResult =
  | { status: "recorded"; studentName: string }
  | { status: "insufficient_balance" }
  | { status: "not_active_at_school" };

export class ItemSaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemSaleError";
  }
}

export async function recordItemSale(input: {
  studentNumber: string;
  itemId: string;
  session: AppSession | null | undefined;
}): Promise<ItemResult> {
  const staff = requireStaff(input.session);

  const student = await prisma.student.findUnique({
    where: {
      districtId_studentNumber: {
        districtId: staff.districtId,
        studentNumber: input.studentNumber.trim(),
      },
    },
    include: { account: true },
  });
  if (
    !student ||
    student.enrollmentStatus !== "ACTIVE" ||
    !canAccessSchool(input.session, student.schoolId) ||
    !student.account
  ) {
    return { status: "not_active_at_school" };
  }

  // Item must be active and in the cashier's district + school scope. An invalid
  // item id is a tampering attempt (the UI only shows valid tiles), not a normal
  // operational path — reject hard.
  const item = await prisma.item.findFirst({
    where: {
      id: input.itemId,
      active: true,
      districtId: staff.districtId,
      OR: [{ schoolId: null }, { schoolId: student.schoolId }],
    },
  });
  if (!item) throw new ItemSaleError("Unknown or unavailable item");

  const price = item.priceCents;
  const accountId = student.account.id;

  try {
    await prisma.$transaction(async (tx) => {
      // Shared D-7 guard: lock the row, then assert funds before writing.
      await lockAccountsForUpdate(tx, [accountId]);
      await assertCanDebit(tx, accountId, price); // throws INSUFFICIENT_FUNDS

      const debit = await tx.ledgerEntry.create({
        data: {
          accountId,
          type: "ALACARTE_CHARGE",
          amountCents: -price,
          description: item.name,
          actorType: "USER",
          actorId: staff.userId,
        },
      });
      await tx.itemSale.create({
        data: {
          itemId: item.id,
          studentId: student.id,
          priceCentsAtSale: price, // price captured at time of purchase
          ledgerEntryId: debit.id,
        },
      });
      const balance = await deriveBalanceCents(accountId, tx);
      await tx.account.update({ where: { id: accountId }, data: { balanceCents: balance } });
    });
  } catch (err) {
    if (err instanceof LedgerError && err.code === "INSUFFICIENT_FUNDS") {
      return { status: "insufficient_balance" };
    }
    throw err;
  }

  // Notify the guardian(s) if this charge just crossed the low-balance line.
  const threshold = await resolveLowBalanceThresholdCents(student.districtId, student.schoolId);
  await notifyIfLowBalanceCrossed(student.id, price, threshold);

  return { status: "recorded", studentName: `${student.firstName} ${student.lastName}` };
}
