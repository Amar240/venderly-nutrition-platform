"use server";

import type { MealType } from "@prisma/client";
import { getAppSession } from "@/server/auth/session";
import { recordMeal, type MealResult } from "@/server/meals/recordMeal";
import { recordItemSale, type ItemResult, ItemSaleError } from "@/server/meals/recordItemSale";
import { posRateLimited } from "@/server/pos/rateLimit";
import { AuthError } from "@/server/auth/errors";
import { undoLastMealEntry, type UndoMealResult } from "@/server/meals/undoMealEntry";
import { recordRosterBatch, type RosterBatchResult } from "@/server/meals/roster";

/**
 * POS server actions. They resolve the cashier session server-side (never trust
 * the client), rate-limit student-number attempts per cashier, and return ONLY
 * an operational result — no price, tier, or eligibility ever crosses back.
 */
export type MealActionResult = MealResult | { status: "rate_limited" } | { status: "error" };
export type ItemActionResult = ItemResult | { status: "rate_limited" } | { status: "error" };
export type UndoMealActionResult = UndoMealResult | { status: "error" };
export type RosterBatchActionResult = RosterBatchResult | { status: "error"; message: string };
export type UndoRosterActionResult =
  | { status: "undone"; mealType: MealType; recordedCount: number }
  | { status: "unavailable" }
  | { status: "error" };

export async function recordMealAction(
  mealType: MealType,
  studentNumber: string,
): Promise<MealActionResult> {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return { status: "error" };
  if (posRateLimited(session.userId)) return { status: "rate_limited" };
  try {
    return await recordMeal({ studentNumber, mealType, session });
  } catch (err) {
    if (err instanceof AuthError) return { status: "error" };
    throw err;
  }
}

export async function undoMealAction(batchId: string): Promise<UndoMealActionResult> {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return { status: "unavailable" };
  try {
    return await undoLastMealEntry({ batchId, session });
  } catch (err) {
    if (err instanceof AuthError) return { status: "unavailable" };
    return { status: "error" };
  }
}

export async function recordRosterBatchAction(
  mealType: MealType,
  groupKey: string,
  studentIds: string[],
): Promise<RosterBatchActionResult> {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") {
    return { status: "error", message: "This class could not be opened, so sign in and try again." };
  }
  try {
    return await recordRosterBatch({ mealType, groupKey, studentIds, session });
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: "error", message: "This class could not be opened, so return to the serving line." };
    }
    return { status: "error", message: "The class could not be recorded, so nothing changed and you can try again." };
  }
}

export async function undoRosterBatchAction(batchId: string): Promise<UndoRosterActionResult> {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return { status: "unavailable" };
  try {
    const result = await undoLastMealEntry({ batchId, session });
    if (result.status === "unavailable") return result;
    return {
      status: "undone",
      mealType: result.mealType,
      recordedCount: result.studentNames.length,
    };
  } catch (error) {
    if (error instanceof AuthError) return { status: "unavailable" };
    return { status: "error" };
  }
}

export async function recordItemAction(
  itemId: string,
  studentNumber: string,
): Promise<ItemActionResult> {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return { status: "error" };
  if (posRateLimited(session.userId)) return { status: "rate_limited" };
  try {
    return await recordItemSale({ studentNumber, itemId, session });
  } catch (err) {
    if (err instanceof AuthError || err instanceof ItemSaleError) return { status: "error" };
    throw err;
  }
}
