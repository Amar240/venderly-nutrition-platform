import { prisma } from "@/server/db/client";
import { formatCents } from "@/lib/utils";
import { notificationPort } from "@/server/ports/notification";
import { getBalanceCents } from "@/server/ledger/ledger";

/**
 * Notification generation. Bodies carry money amounts and student NAMES only —
 * never a pricing tier or eligibility category (D-1). Everything is delivered
 * through the NotificationPort.
 */

/** Deposit completed — notify the depositing guardian. */
export async function notifyDepositCompleted(input: {
  guardianId: string;
  allocations: { studentId: string; amountCents: number }[];
}): Promise<void> {
  if (input.allocations.length === 0) return;
  const first = await prisma.student.findUnique({
    where: { id: input.allocations[0]!.studentId },
    select: { districtId: true, schoolId: true },
  });
  if (!first) return;
  const total = input.allocations.reduce((n, a) => n + a.amountCents, 0);
  await notificationPort.notify({
    guardianId: input.guardianId,
    districtId: first.districtId,
    schoolId: first.schoolId,
    type: "DEPOSIT_COMPLETED",
    title: "Money added",
    body: `${formatCents(total)} has been added to snack money.`,
  });
}

/** Sibling transfer completed — notify the guardian who moved the money. */
export async function notifyTransferCompleted(input: {
  guardianId: string;
  fromStudentId: string;
  toStudentId: string;
  amountCents: number;
}): Promise<void> {
  const [from, to] = await Promise.all([
    prisma.student.findUnique({ where: { id: input.fromStudentId }, select: { firstName: true, lastName: true, districtId: true, schoolId: true } }),
    prisma.student.findUnique({ where: { id: input.toStudentId }, select: { firstName: true, lastName: true } }),
  ]);
  if (!from || !to) return;
  await notificationPort.notify({
    guardianId: input.guardianId,
    districtId: from.districtId,
    schoolId: from.schoolId,
    type: "TRANSFER_COMPLETED",
    title: "Money moved",
    body: `You moved ${formatCents(input.amountCents)} from ${from.firstName} ${from.lastName} to ${to.firstName} ${to.lastName}.`,
  });
}

/**
 * Notify the student's guardian(s) ONLY when a debit just CROSSED the low-balance
 * threshold (before ≥ threshold && after < threshold). `after` is derived from
 * the ledger; `before` is `after + debitCents`. No-op if not a crossing.
 */
export async function notifyIfLowBalanceCrossed(
  studentId: string,
  debitCents: number,
  thresholdCents: number,
): Promise<void> {
  if (debitCents <= 0) return;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { account: true, guardianLinks: { select: { guardianId: true } } },
  });
  if (!student || !student.account) return;

  const after = await getBalanceCents(student.account.id);
  const before = after + debitCents;
  if (!(before >= thresholdCents && after < thresholdCents)) return; // only on the crossing

  for (const link of student.guardianLinks) {
    await notificationPort.notify({
      guardianId: link.guardianId,
      districtId: student.districtId,
      schoolId: student.schoolId,
      type: "LOW_BALANCE",
      title: "Snack money is low",
      body: `${student.firstName} ${student.lastName}'s snack money is low (${formatCents(after)}).`,
    });
  }
}
