"use server";

import { revalidatePath } from "next/cache";
import type { MealType } from "@prisma/client";
import { getAppSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { assertStudentInScope } from "@/server/directory/adminStudents";
import { recordAdjustment, recordRefund, recordReallocation, LedgerError } from "@/server/ledger/ledger";
import { recordMealOverride, MealOverrideError } from "@/server/meals/recordMealOverride";
import { parseDollarsToCents } from "@/lib/utils";
import { AuthError } from "@/server/auth/errors";

/**
 * Admin correction actions. Each resolves the staff session server-side,
 * asserts the target student is in the session's school scope, then delegates to
 * a SELF-GUARDING ledger/meals function (role enforced there too). Every path
 * carries a mandatory reason and is audited by the domain function.
 */
export interface CorrectionState {
  error: string | null;
  ok: boolean;
}

const OK: CorrectionState = { error: null, ok: true };
function fail(error: string): CorrectionState {
  return { error, ok: false };
}

async function scopedStudent(studentId: string) {
  const session = await getAppSession();
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { account: true },
  });
  if (!student) throw new AuthError("FORBIDDEN_SCOPE");
  assertStudentInScope(session, student); // throws if out of scope / not staff
  return { session: session!, student };
}

function mapError(err: unknown): CorrectionState {
  if (err instanceof AuthError) return fail("You don't have access to that. Ask a district administrator if you need it.");
  if (err instanceof LedgerError) {
    if (err.code === "INSUFFICIENT_FUNDS") return fail("That's more money than is available. Enter a smaller amount.");
    if (err.code === "REASON_REQUIRED") return fail("A reason is required.");
    return fail("That correction could not be recorded. Check the details and try again.");
  }
  if (err instanceof MealOverrideError) {
    return fail(err.code === "NO_ORIGINAL" ? "No meal was found for that date. Choose a different date or meal." : "A reason is required.");
  }
  throw err;
}

export async function adjustAction(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const studentId = String(formData.get("studentId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const magnitude = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const direction = String(formData.get("direction") ?? "add");
  if (magnitude === null || magnitude === 0) return fail("Enter a valid dollar amount.");
  const amountCents = direction === "remove" ? -magnitude : magnitude;
  try {
    const { session, student } = await scopedStudent(studentId);
    if (!student.account) return fail("This student does not have snack money set up. Ask a district administrator to check the student record.");
    await recordAdjustment({ accountId: student.account.id, amountCents, reason, actor: { kind: "staff", session } });
  } catch (err) {
    return mapError(err);
  }
  revalidatePath(`/admin/students/${studentId}`);
  return OK;
}

export async function refundAction(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const studentId = String(formData.get("studentId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!entryId) return fail("Choose a payment or charge to give back.");
  try {
    const { session } = await scopedStudent(studentId);
    await recordRefund({ originalEntryId: entryId, reason, actor: { kind: "staff", session } });
  } catch (err) {
    return mapError(err);
  }
  revalidatePath(`/admin/students/${studentId}`);
  return OK;
}

export async function reallocateAction(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const studentId = String(formData.get("studentId") ?? "");
  const toNumber = String(formData.get("toStudentNumber") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents === 0) return fail("Enter a valid dollar amount.");
  try {
    const { session, student } = await scopedStudent(studentId);
    const dest = await prisma.student.findUnique({
      where: { districtId_studentNumber: { districtId: student.districtId, studentNumber: toNumber } },
    });
    if (!dest) return fail("No students match that number. Check the number, or search by name.");
    assertStudentInScope(session, dest); // destination must be in scope too
    await recordReallocation({ fromStudentId: studentId, toStudentId: dest.id, amountCents, reason, actor: { kind: "staff", session } });
  } catch (err) {
    return mapError(err);
  }
  revalidatePath(`/admin/students/${studentId}`);
  return OK;
}

export async function overrideAction(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const studentId = String(formData.get("studentId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const mealType = String(formData.get("mealType") ?? "") as MealType;
  const dateStr = String(formData.get("serviceDate") ?? "").trim();
  if (mealType !== "BREAKFAST" && mealType !== "LUNCH") return fail("Choose a meal type.");
  const serviceDate = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : undefined;
  if (dateStr && Number.isNaN(serviceDate!.getTime())) return fail("Enter a valid date.");
  try {
    const { session } = await scopedStudent(studentId);
    await recordMealOverride({ studentId, mealType, serviceDate, reason, session });
  } catch (err) {
    return mapError(err);
  }
  revalidatePath(`/admin/students/${studentId}`);
  return OK;
}
