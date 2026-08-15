"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/server/auth/session";
import { AuthError } from "@/server/auth/errors";
import { ChargePolicyError, updateChargePolicy } from "@/server/policy/chargePolicy";

export interface ChargePolicyState {
  ok: boolean;
  error: string | null;
}

export async function updateChargePolicyAction(
  _previous: ChargePolicyState,
  formData: FormData,
): Promise<ChargePolicyState> {
  try {
    await updateChargePolicy(await getAppSession(), String(formData.get("policyText") ?? ""));
    revalidatePath("/admin/charge-policy");
    revalidatePath("/guardian/charge-policy");
    revalidatePath("/pos/charge-policy");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ChargePolicyError) {
      if (error.code === "EMPTY") {
        return { ok: false, error: "The policy was not published because the text is empty. Add the district wording and try again." };
      }
      return { ok: false, error: "The policy was not published because the text is too long. Keep it under 10,000 characters and try again." };
    }
    if (error instanceof AuthError) {
      return { ok: false, error: "You do not have access to publish this policy. Ask a district administrator to make the change." };
    }
    throw error;
  }
}
