"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/server/auth/session";
import { parseDollarsToCents } from "@/lib/utils";
import { createItem, updateItem, setItemActive, ConfigError } from "@/server/config/items";
import { updatePricingConfig } from "@/server/config/pricing";
import { createSchool, updateSchool } from "@/server/config/schools";
import { createStaffUser, updateStaffUser, setUserDisabled } from "@/server/config/users";
import { AuthError } from "@/server/auth/errors";
import type { StaffRole } from "@/server/auth/types";

export interface ConfigState {
  error: string | null;
  ok: boolean;
  /** Set once, immediately after creating a staff user — shown a single time. */
  totpSecret?: string;
}
const OK: ConfigState = { error: null, ok: true };
const fail = (error: string): ConfigState => ({ error, ok: false });

function mapError(err: unknown): ConfigState {
  if (err instanceof AuthError) return fail("You’re not allowed to do that.");
  if (err instanceof ConfigError) return fail(err.code === "NOT_FOUND" ? "Not found." : "Check the values (name, code, and amounts).");
  throw err;
}
function bust() {
  revalidatePath("/admin/config", "layout");
}

function parseMinutes(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

// --- Items ---------------------------------------------------------------
export async function createItemAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const priceCents = parseDollarsToCents(String(fd.get("price") ?? ""));
  if (priceCents === null) return fail("Enter a valid price.");
  try {
    await createItem(await getAppSession(), { name: String(fd.get("name") ?? ""), priceCents });
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}
export async function updateItemAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const priceCents = parseDollarsToCents(String(fd.get("price") ?? ""));
  if (priceCents === null) return fail("Enter a valid price.");
  try {
    await updateItem(await getAppSession(), String(fd.get("itemId") ?? ""), { name: String(fd.get("name") ?? ""), priceCents });
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}
export async function toggleItemActiveAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  try {
    await setItemActive(await getAppSession(), String(fd.get("itemId") ?? ""), fd.get("active") === "true");
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}

// --- Pricing config ------------------------------------------------------
export async function updatePricingAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const c = (k: string) => parseDollarsToCents(String(fd.get(k) ?? ""));
  const fields = {
    breakfastFreeCents: c("bFree"), breakfastReducedCents: c("bReduced"), breakfastPaidCents: c("bPaid"),
    lunchFreeCents: c("lFree"), lunchReducedCents: c("lReduced"), lunchPaidCents: c("lPaid"),
    lowBalanceThresholdCents: c("threshold"),
  };
  if (Object.values(fields).some((v) => v === null)) return fail("All amounts must be valid dollars.");
  const lowBalanceMealsThreshold = Number(String(fd.get("mealsThreshold") ?? ""));
  if (!Number.isInteger(lowBalanceMealsThreshold) || lowBalanceMealsThreshold < 0) {
    return fail("Enter a whole number of meals.");
  }
  try {
    await updatePricingConfig(await getAppSession(), {
      schoolId: null,
      cepEnabled: fd.get("cepEnabled") === "on",
      ...(fields as Record<string, number>),
      lowBalanceMealsThreshold,
    } as never);
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}

// --- Schools -------------------------------------------------------------
export async function createSchoolAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const breakfastServiceEndMinutes = parseMinutes(fd.get("breakfastServiceEnd"));
  const lunchServiceEndMinutes = parseMinutes(fd.get("lunchServiceEnd"));
  if (Number.isNaN(breakfastServiceEndMinutes) || Number.isNaN(lunchServiceEndMinutes)) return fail("Enter service times as HH:MM.");
  try {
    await createSchool(await getAppSession(), {
      name: String(fd.get("name") ?? ""),
      code: String(fd.get("code") ?? ""),
      breakfastServiceEndMinutes,
      lunchServiceEndMinutes,
    });
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}
export async function updateSchoolAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const breakfastServiceEndMinutes = parseMinutes(fd.get("breakfastServiceEnd"));
  const lunchServiceEndMinutes = parseMinutes(fd.get("lunchServiceEnd"));
  if (Number.isNaN(breakfastServiceEndMinutes) || Number.isNaN(lunchServiceEndMinutes)) return fail("Enter service times as HH:MM.");
  try {
    await updateSchool(await getAppSession(), String(fd.get("schoolId") ?? ""), {
      name: String(fd.get("name") ?? ""),
      code: String(fd.get("code") ?? ""),
      breakfastServiceEndMinutes,
      lunchServiceEndMinutes,
    });
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}

// --- Staff users ---------------------------------------------------------
export async function createUserAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  try {
    const { totpSecret } = await createStaffUser(await getAppSession(), {
      email: String(fd.get("email") ?? ""),
      firstName: String(fd.get("firstName") ?? ""),
      lastName: String(fd.get("lastName") ?? ""),
      role: String(fd.get("role") ?? "") as StaffRole,
      schoolIds: fd.getAll("schoolIds").map(String),
    });
    bust();
    return { ...OK, totpSecret };
  } catch (e) { return mapError(e); }
}
export async function updateUserAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  try {
    await updateStaffUser(await getAppSession(), String(fd.get("userId") ?? ""), {
      role: String(fd.get("role") ?? "") as StaffRole,
      schoolIds: fd.getAll("schoolIds").map(String),
    });
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}
export async function toggleUserDisabledAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  try {
    await setUserDisabled(await getAppSession(), String(fd.get("userId") ?? ""), fd.get("disabled") === "true");
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}
