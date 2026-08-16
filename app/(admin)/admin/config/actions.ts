"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/server/auth/session";
import { parseDollarsToCents } from "@/lib/utils";
import { createItem, updateItem, setItemActive, ConfigError } from "@/server/config/items";
import {
  cancelPricingConfigVersion,
  createPricingConfigVersion,
  updateComplianceSettings,
} from "@/server/config/pricing";
import { createSchool, updateSchool } from "@/server/config/schools";
import { createStaffUser, updateStaffUser, setUserDisabled } from "@/server/config/users";
import { AuthError } from "@/server/auth/errors";
import type { AttendanceFactorProvenance } from "@prisma/client";
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
  if (err instanceof AuthError) return fail("You don't have access to that. Ask a district administrator if you need it.");
  if (err instanceof ConfigError) return fail(err.code === "NOT_FOUND" ? "That item was not found. Refresh the page and try again." : "One of the values does not look right. Check names, codes, and amounts.");
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

function parseDateOnly(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return null;
  return date;
}

function parseBasisPoints(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = Number(match[1]);
  const decimals = (match[2] ?? "").padEnd(2, "0");
  const bps = whole * 100 + Number(decimals);
  if (bps < 0 || bps > 10_000) return null;
  return bps;
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
  if (Object.values(fields).some((v) => v === null)) return fail("One amount does not look right. Enter dollars and cents.");
  const lowBalanceMealsThreshold = Number(String(fd.get("mealsThreshold") ?? ""));
  if (!Number.isInteger(lowBalanceMealsThreshold) || lowBalanceMealsThreshold < 0) {
    return fail("Enter a whole number of meals.");
  }
  const effectiveFrom = parseDateOnly(fd.get("effectiveFrom"));
  if (!effectiveFrom) return fail("Choose the date these prices start.");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return fail("Enter why these prices are changing.");
  try {
    await createPricingConfigVersion(await getAppSession(), {
      schoolId: null,
      cepEnabled: fd.get("cepEnabled") === "on",
      ...(fields as Record<string, number>),
      lowBalanceMealsThreshold,
      effectiveFrom,
      reason,
    } as never);
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}

export async function cancelPricingAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return fail("Enter why this scheduled change is being cancelled.");
  try {
    await cancelPricingConfigVersion(await getAppSession(), String(fd.get("pricingConfigId") ?? ""), reason);
  } catch (e) { return mapError(e); }
  bust();
  return OK;
}

export async function updateComplianceAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const identifiedStudentPercentageBps = parseBasisPoints(fd.get("identifiedStudentPercentage"));
  const stateAttendanceFactorBps = parseBasisPoints(fd.get("stateAttendanceFactor"));
  if (identifiedStudentPercentageBps === null || stateAttendanceFactorBps === null) {
    return fail("Enter percentages from 0.00 to 100.00.");
  }
  const provenance = String(fd.get("stateAttendanceFactorProvenance") ?? "");
  if (provenance !== "FNS_FEDERAL_DEFAULT" && provenance !== "APPROVED_LOCAL") {
    return fail("Choose where the maximum-meal percentage came from.");
  }
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return fail("Enter why these district settings are changing.");
  try {
    await updateComplianceSettings(await getAppSession(), {
      identifiedStudentPercentageBps,
      stateAttendanceFactorBps,
      stateAttendanceFactorProvenance: provenance as AttendanceFactorProvenance,
      reason,
    });
  } catch (e) { return mapError(e); }
  bust();
  revalidatePath("/admin/reports/edit-check");
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
