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
    return { error: "Please sign in again." };
  }
  const household = await getHousehold(session);

  const allocations: { studentId: string; amountCents: number }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const child of household) {
    const raw = String(formData.get(`amount_${child.studentId}`) ?? "").trim();
    if (!raw) continue;
    const cents = parseDollarsToCents(raw);
    if (cents === null || cents <= 0) {
      fieldErrors[child.studentId] = "Enter a valid amount";
      continue;
    }
    allocations.push({ studentId: child.studentId, amountCents: cents });
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Fix the highlighted amounts.", fieldErrors };
  }
  const parsed = depositSchema.safeParse({ allocations });
  if (!parsed.success) {
    return { error: "Enter an amount for at least one child." };
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
    return { error: "Please sign in again." };
  }
  const fromStudentId = String(formData.get("fromStudentId") ?? "");
  const toStudentId = String(formData.get("toStudentId") ?? "");
  const cents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { error: "Enter a valid dollar amount." };

  const parsed = transferSchema.safeParse({ fromStudentId, toStudentId, amountCents: cents });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the transfer details." };
  }

  try {
    await requireGuardianOf(session, fromStudentId);
    await requireGuardianOf(session, toStudentId);
    await recordTransfer({
      fromStudentId,
      toStudentId,
      amountCents: cents,
      actor: { actorType: "GUARDIAN", actorId: session.guardianId },
    });
    await writeAudit({
      actorType: "GUARDIAN",
      actorId: session.guardianId,
      action: "TRANSFER",
      subjectType: "student",
      subjectId: fromStudentId,
      after: { toStudentId, amountCents: cents },
    });
  } catch (err) {
    if (err instanceof LedgerError && err.code === "INSUFFICIENT_FUNDS") {
      return { error: "That's more than the source child's balance." };
    }
    if (err instanceof AuthError) {
      return { error: "You can only move money between your own children." };
    }
    throw err;
  }

  revalidatePath("/guardian");
  redirect(`/guardian/child/${fromStudentId}?moved=1`);
}
