"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { depositSchema, transferSchema } from "@/server/household/schemas";
import { parseDollarsToCents } from "@/lib/utils";
import { paymentPort } from "@/server/ports/payment";
import { recordTransfer, LedgerError } from "@/server/ledger/ledger";
import { requireGuardianOf } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit/log";
import { AuthError } from "@/server/auth/errors";
import { notifyTransferCompleted, notifyIfLowBalanceCrossed } from "@/server/notifications/service";
import {
  AutomaticTopUpError,
  cancelAutomaticTopUpRule,
  saveAutomaticTopUpRule,
  triggerAutomaticTopUpsForDebit,
} from "@/server/household/autoTopUp";
import { getResolvedPricingConfig } from "@/server/pricing/config";
import { lowBalanceThresholdForChild } from "@/server/household/balance";
import { prisma } from "@/server/db/client";
import { districtToday } from "@/server/time/district";

export interface DepositState {
  error: string | null;
  fieldErrors?: Record<string, string>;
}

/**
 * Validate a (possibly split) deposit and hand off to the payment provider.
 * The set of eligible children is re-derived server-side from the household —
 * the form cannot introduce a student the guardian isn't linked to. No money is
 * credited here; that happens only when the signed provider event settles.
 */
export async function startDepositAction(
  _prev: DepositState,
  formData: FormData,
): Promise<DepositState> {
  const session = await getAppSession();
  if (!session || session.principalType !== "guardian") {
    return { error: "You've been signed out. Sign in again to continue." };
  }
  const household = await getHousehold(session);

  const allocations: { studentId: string; amountCents: number }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const child of household) {
    const raw = String(formData.get(`amount_${child.studentId}`) ?? "").trim();
    if (!raw) continue;
    const cents = parseDollarsToCents(raw);
    if (cents === null || cents <= 0) {
      fieldErrors[child.studentId] = "Enter an amount greater than $0.";
      continue;
    }
    allocations.push({ studentId: child.studentId, amountCents: cents });
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "One amount does not look right. Fix the highlighted amount and try again.", fieldErrors };
  }
  const parsed = depositSchema.safeParse({ allocations });
  if (!parsed.success) {
    return { error: "No money amount was entered. Enter an amount for at least one child." };
  }

  const { redirectUrl } = await paymentPort.createCheckout({
    guardianId: session.guardianId,
    allocations,
  });
  redirect(redirectUrl); // throws NEXT_REDIRECT — must propagate
}

export interface TransferState {
  error: string | null;
}

export interface AutoTopUpState {
  error: string | null;
  saved?: boolean;
}

/**
 * Commit a sibling transfer. Both children are re-verified through
 * requireGuardianOf; the ledger enforces amount ≤ source balance and writes the
 * linked debit+credit in one transaction. Audited (rule 8).
 */
export async function transferAction(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const session = await getAppSession();
  if (!session || session.principalType !== "guardian") {
    return { error: "You've been signed out. Sign in again to continue." };
  }
  const household = await getHousehold(session);
  const fromStudentId = String(formData.get("fromStudentId") ?? "");
  const toStudentId = String(formData.get("toStudentId") ?? "");
  const token = String(formData.get("token") ?? "");
  const cents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { error: "That amount does not look right. Enter dollars and cents." };

  const parsed = transferSchema.safeParse({ fromStudentId, toStudentId, amountCents: cents });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the transfer details." };
  }

  try {
    await requireGuardianOf(session, fromStudentId);
    await requireGuardianOf(session, toStudentId);
    const result = await recordTransfer({
      fromStudentId,
      toStudentId,
      amountCents: cents,
      actor: { actorType: "GUARDIAN", actorId: session.guardianId },
      // Namespaced so a transfer key can never collide with a deposit key.
      // A double-submitted form (same token) is an idempotent no-op.
      idempotencyKey: token ? `xfr:${token}` : undefined,
    });
    // Only audit + notify a real money movement, not an idempotent replay.
    if (!result.replayed) {
      await writeAudit({
        actorType: "GUARDIAN",
        actorId: session.guardianId,
        action: "TRANSFER",
        subjectType: "student",
        subjectId: fromStudentId,
        after: { toStudentId, amountCents: cents },
      });
      await notifyTransferCompleted({ guardianId: session.guardianId, fromStudentId, toStudentId, amountCents: cents });
      const fromChild = household.find((child) => child.studentId === fromStudentId);
      if (fromChild) {
        const source = await prisma.student.findUnique({
          where: { id: fromStudentId },
          select: { districtId: true, schoolId: true },
        });
        if (source) {
          const config = await getResolvedPricingConfig(
            source.districtId,
            source.schoolId,
            await districtToday(source.districtId),
          );
          const threshold = lowBalanceThresholdForChild({
            balanceCents: fromChild.balanceCents,
            lunchPriceCents: fromChild.lunchPriceCents,
            lowBalanceMealsThreshold: config.lowBalanceMealsThreshold,
            lowBalanceThresholdCents: config.lowBalanceThresholdCents,
          });
          await notifyIfLowBalanceCrossed(fromStudentId, cents, threshold);
          await triggerAutomaticTopUpsForDebit({
            studentId: fromStudentId,
            debitCents: cents,
            triggeringLedgerEntryId: result.debit.id,
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof LedgerError && err.code === "INSUFFICIENT_FUNDS") {
      return { error: "That's more money than is available. Enter a smaller amount." };
    }
    if (err instanceof AuthError) {
      return { error: "You don't have access to that. Ask a district administrator if you need it." };
    }
    throw err;
  }

  revalidatePath("/guardian");
  redirect(`/guardian/child/${fromStudentId}?moved=1`);
}

export async function saveAutoTopUpAction(
  _prev: AutoTopUpState,
  formData: FormData,
): Promise<AutoTopUpState> {
  const session = await getAppSession();
  if (!session || session.principalType !== "guardian") {
    return { error: "You've been signed out. Sign in again to continue." };
  }

  const studentId = String(formData.get("studentId") ?? "");
  const triggerBalanceCents = parseDollarsToCents(String(formData.get("triggerBalance") ?? ""));
  const topUpAmountCents = parseDollarsToCents(String(formData.get("topUpAmount") ?? ""));
  const monthlyCeilingCents = parseDollarsToCents(String(formData.get("monthlyCeiling") ?? ""));

  if (triggerBalanceCents === null || topUpAmountCents === null || monthlyCeilingCents === null) {
    return { error: "One amount does not look right. Enter dollars and cents." };
  }

  try {
    await saveAutomaticTopUpRule(session, {
      studentId,
      triggerBalanceCents,
      topUpAmountCents,
      monthlyCeilingCents,
    });
  } catch (error) {
    if (error instanceof AutomaticTopUpError) {
      return { error: error.message };
    }
    if (error instanceof AuthError) {
      return { error: "You don't have access to that child. Ask the district to check your household link." };
    }
    throw error;
  }

  revalidatePath("/guardian");
  revalidatePath("/guardian/top-up");
  return { error: null, saved: true };
}

export async function cancelAutoTopUpAction(
  _prev: AutoTopUpState,
  formData: FormData,
): Promise<AutoTopUpState> {
  const session = await getAppSession();
  if (!session || session.principalType !== "guardian") {
    return { error: "You've been signed out. Sign in again to continue." };
  }
  const ruleId = String(formData.get("ruleId") ?? "");
  try {
    await cancelAutomaticTopUpRule(session, ruleId);
  } catch (error) {
    if (error instanceof AutomaticTopUpError || error instanceof AuthError) {
      return { error: "Automatic top-up could not be changed. Refresh the page and try again." };
    }
    throw error;
  }
  revalidatePath("/guardian");
  revalidatePath("/guardian/top-up");
  return { error: null, saved: true };
}
