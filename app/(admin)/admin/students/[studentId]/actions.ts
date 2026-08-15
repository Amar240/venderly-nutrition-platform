"use server";

import { revalidatePath } from "next/cache";
import type { MealType } from "@prisma/client";
import { getAppSession } from "@/server/auth/session";
import {
  commitSituationCorrection,
  completeWrongStudentFollowUp,
  reviewSituationCorrection,
  type CorrectionReview,
  type SituationChoice,
} from "@/server/corrections/situationCorrections";
import { recordMealOverride, MealOverrideError } from "@/server/meals/recordMealOverride";
import { AuthError } from "@/server/auth/errors";

export interface CorrectionState {
  error: string | null;
  ok: boolean;
  message?: string | null;
  review?: CorrectionReview | null;
}

const OK: CorrectionState = { error: null, ok: true };

function fail(error: string): CorrectionState {
  return { error, ok: false, review: null };
}

function formInput(formData: FormData) {
  return {
    studentId: String(formData.get("studentId") ?? ""),
    situation: String(formData.get("situation") ?? "") as SituationChoice,
    originalEntryId: String(formData.get("originalEntryId") ?? "") || undefined,
    targetStudentNumber: String(formData.get("targetStudentNumber") ?? "") || undefined,
    expectedAmount: String(formData.get("expectedAmount") ?? "") || undefined,
    amount: String(formData.get("amount") ?? "") || undefined,
    direction: String(formData.get("direction") ?? "") || undefined,
    reason: String(formData.get("reason") ?? "") || undefined,
  };
}

export async function reviewCorrectionAction(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const session = await getAppSession();
  const review = await reviewSituationCorrection(session, formInput(formData));
  if (!review.ok) return fail(review.error);
  return { ok: false, error: null, review };
}

export async function commitCorrectionAction(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const input = formInput(formData);
  const session = await getAppSession();
  const result = await commitSituationCorrection(session, input);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/students/${input.studentId}`);
  return { ...OK, message: result.message };
}

export async function completeFollowUpAction(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const studentId = String(formData.get("studentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  const session = await getAppSession();
  const result = await completeWrongStudentFollowUp(session, caseId);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/students/${studentId}`);
  return { ...OK, message: result.message };
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
    const session = await getAppSession();
    await recordMealOverride({ studentId, mealType, serviceDate, reason, session });
  } catch (err) {
    if (err instanceof AuthError) return fail("You don't have access to that. Ask a district administrator if you need it.");
    if (err instanceof MealOverrideError) {
      return fail(err.code === "NO_ORIGINAL" ? "No meal was found for that date. Choose a different date or meal." : "Add the reason this is being fixed, then try again.");
    }
    throw err;
  }
  revalidatePath(`/admin/students/${studentId}`);
  return { ...OK, message: "Another meal was recorded and kept with your name and the reason." };
}
