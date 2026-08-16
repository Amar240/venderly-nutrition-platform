"use server";

import { revalidatePath } from "next/cache";
import type { MealType } from "@prisma/client";
import { getAppSession } from "@/server/auth/session";
import { markExceptionReviewed } from "@/server/reports/editCheckReview";

export async function markExceptionReviewedAction(formData: FormData): Promise<void> {
  const session = await getAppSession();
  const schoolId = String(formData.get("schoolId") ?? "");
  const serviceDate = String(formData.get("serviceDate") ?? "");
  const mealType = String(formData.get("mealType") ?? "") as MealType;
  const note = String(formData.get("note") ?? "").trim();

  await markExceptionReviewed(session, {
    schoolId,
    serviceDate: new Date(`${serviceDate}T00:00:00.000Z`),
    mealType,
    note: note || undefined,
  });

  revalidatePath("/admin/reports/edit-check");
  revalidatePath("/admin/reports/claim-figures");
  revalidatePath("/admin/reports/claim-pack");
}
