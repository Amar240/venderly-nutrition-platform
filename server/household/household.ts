import { prisma } from "@/server/db/client";
import { AuthError } from "@/server/auth/errors";
import { requireGuardianOf } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { getResolvedPricingConfig } from "@/server/pricing/config";
import { getLedgerHistory } from "@/server/ledger/ledger";
import { classifyBalance, lowBalanceThresholdForChild, type BalanceStatus } from "./balance";
import { computeMealPriceCents } from "@/server/meals/pricing";
import { missingLunchCountForStudent, recentCompletedOperatingDays } from "@/server/meals/operatingDays";
import { SERVED_ONLY } from "@/server/meals/mealCounts";
import { districtToday, isAfterServiceEnd } from "@/server/time/district";
import { formatCents } from "@/lib/utils";
import type { LedgerEntry, MealType, PriceTier } from "@prisma/client";

/**
 * Guardian read-models. Every student access is routed through
 * `requireGuardianOf` or a query joined on GuardianStudent — there is no open
 * student lookup for guardians (CLAUDE.md rule 7). This is the one guardian
 * reader of StudentPricing allowed by D-1: the tier is scoped through the
 * verified link, used only to resolve the child's own meal costs, and is never
 * returned or serialized.
 */

function guardianId(session: AppSession | null | undefined): string {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (session.principalType !== "guardian") throw new AuthError("FORBIDDEN_ROLE");
  return session.guardianId;
}

export interface HouseholdChild {
  linkId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  schoolName: string;
  balanceCents: number;
  status: BalanceStatus;
  lunchPriceCents: number;
  breakfastPriceCents: number;
  mealsRemaining: number | null;
  mealCoverageText: string;
  moneyText: string;
  servedMealTypes: MealType[];
  todayMeals: { mealType: MealType; state: "ate" | "not_yet" | "not_recorded"; label: string }[];
  warnings: string[];
  pattern?: { missingLunches: number; schoolDays: number; line: string; reassurance?: string };
}

type LinkedStudent = Awaited<ReturnType<typeof linkedStudentsForGuardian>>[number]["student"];

function mealEndMinutes(student: LinkedStudent, mealType: MealType): number | null {
  return mealType === "BREAKFAST"
    ? student.school.breakfastServiceEndMinutes
    : student.school.lunchServiceEndMinutes;
}

function mealLabel(mealType: MealType) {
  return mealType === "BREAKFAST" ? "breakfast" : "lunch";
}

function dailyLabel(mealType: MealType, state: "ate" | "not_yet" | "not_recorded") {
  const lower = mealLabel(mealType);
  const cap = lower[0]!.toUpperCase() + lower.slice(1);
  if (state === "ate") return `${cap} recorded today`;
  if (state === "not_yet") return `No ${lower} yet`;
  return `No ${lower} recorded`;
}

function pluralLunches(count: number) {
  return count === 1 ? "lunch" : "lunches";
}

function coverageText(balanceCents: number, lunchPriceCents: number, mealsRemaining: number | null) {
  if (lunchPriceCents === 0) return "Breakfast and lunch are free";
  if (balanceCents < 0) return "No paid lunches covered right now";
  return `About ${mealsRemaining ?? 0} more ${pluralLunches(mealsRemaining ?? 0)}`;
}

function moneyText(balanceCents: number, lunchPriceCents: number) {
  if (lunchPriceCents === 0) return `${formatCents(balanceCents)} for snacks and extras`;
  return `${formatCents(balanceCents)} · lunch costs ${formatCents(lunchPriceCents)}`;
}

async function linkedStudentsForGuardian(gid: string) {
  return prisma.guardianStudent.findMany({
    where: { guardianId: gid },
    include: {
      student: {
        include: {
          account: true,
          school: true,
          pricing: { select: { tier: true } },
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });
}

async function buildHouseholdChild(input: {
  linkId: string;
  student: LinkedStudent;
  now?: Date;
}): Promise<HouseholdChild> {
  const { student } = input;
  const balanceCents = student.account?.balanceCents ?? 0;
  const tier: PriceTier = student.pricing?.tier ?? "FREE";
  const config = await getResolvedPricingConfig(student.districtId, student.schoolId);
  const breakfastPriceCents = computeMealPriceCents("BREAKFAST", tier, config);
  const lunchPriceCents = computeMealPriceCents("LUNCH", tier, config);
  const lowThreshold = lowBalanceThresholdForChild({
    balanceCents,
    lunchPriceCents,
    lowBalanceMealsThreshold: config.lowBalanceMealsThreshold,
    lowBalanceThresholdCents: config.lowBalanceThresholdCents,
  });
  const status = classifyBalance(balanceCents, lowThreshold);
  const mealsRemaining = lunchPriceCents > 0 && balanceCents >= 0
    ? Math.floor(balanceCents / lunchPriceCents)
    : null;
  const today = await districtToday(student.districtId, input.now);
  const servedMealTypes = (["BREAKFAST", "LUNCH"] as const).filter(
    (mealType) => mealEndMinutes(student, mealType) !== null,
  );
  const todaysMeals = await prisma.mealEvent.findMany({
    where: {
      studentId: student.id,
      serviceDate: today,
      mealType: { in: servedMealTypes },
      ...SERVED_ONLY,
    },
    select: { mealType: true },
  });
  const eaten = new Set(todaysMeals.map((meal) => meal.mealType));
  const todayMeals = await Promise.all(
    servedMealTypes.map(async (mealType) => {
      const state: "ate" | "not_yet" | "not_recorded" = eaten.has(mealType)
        ? "ate"
        : (await isAfterServiceEnd(student.districtId, student.schoolId, mealType, input.now)) === true
          ? "not_recorded"
          : "not_yet";
      return { mealType, state, label: dailyLabel(mealType, state) };
    }),
  );

  const warnings: string[] = [];
  const reassurance = `${student.firstName} will still be served if it runs out.`;
  if (status === "negative") warnings.push(`${student.firstName}'s balance is below zero.`);
  if (status === "low") warnings.push(`${student.firstName}'s balance is low.`);
  if (status === "negative" || status === "low") {
    warnings.push(reassurance);
  }

  let pattern: HouseholdChild["pattern"];
  const operatingDays = await recentCompletedOperatingDays({
    schoolId: student.schoolId,
    beforeDate: today,
    take: 5,
  });
  if (operatingDays.length === 5) {
    const missingLunches = await missingLunchCountForStudent({
      studentId: student.id,
      schoolId: student.schoolId,
      dates: operatingDays,
    });
    if (missingLunches >= 3) {
      const patternReassurance = lunchPriceCents === 0
        ? "Lunch is free every day — nothing needs to be paid."
        : status === "low" || status === "negative"
          ? reassurance
          : undefined;
      pattern = {
        missingLunches,
        schoolDays: 5,
        line: `No lunch recorded for ${student.firstName} on ${missingLunches} of the last 5 school days.`,
        reassurance: patternReassurance,
      };
      if (patternReassurance && !warnings.includes(patternReassurance)) warnings.push(patternReassurance);
    }
  }

  return {
    linkId: input.linkId,
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    grade: student.grade,
    schoolName: student.school.name,
    balanceCents,
    status,
    breakfastPriceCents,
    lunchPriceCents,
    mealsRemaining,
    mealCoverageText: coverageText(balanceCents, lunchPriceCents, mealsRemaining),
    moneyText: moneyText(balanceCents, lunchPriceCents),
    servedMealTypes,
    todayMeals,
    warnings,
    pattern,
  };
}

/** The guardian's linked children with balances + server-computed status. */
export async function getHousehold(
  session: AppSession | null | undefined,
  now?: Date,
): Promise<HouseholdChild[]> {
  const gid = guardianId(session);
  const links = await linkedStudentsForGuardian(gid);
  return Promise.all(links.map(({ id, student }) => buildHouseholdChild({ linkId: id, student, now })));
}

export interface ChildDetail {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  schoolName: string;
  accountId: string;
  balanceCents: number;
  status: BalanceStatus;
  history: LedgerEntry[];
}

/** One child's detail + full ledger history, guarded by the household link. */
export async function getChildDetail(
  session: AppSession | null | undefined,
  studentId: string,
): Promise<ChildDetail | null> {
  await requireGuardianOf(session, studentId); // throws if not linked
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { account: true, school: true, pricing: { select: { tier: true } } },
  });
  if (!student || !student.account) return null;

  const config = await getResolvedPricingConfig(student.districtId, student.schoolId);
  const tier: PriceTier = student.pricing?.tier ?? "FREE";
  const lunchPriceCents = computeMealPriceCents("LUNCH", tier, config);
  const threshold = lowBalanceThresholdForChild({
    balanceCents: student.account.balanceCents,
    lunchPriceCents,
    lowBalanceMealsThreshold: config.lowBalanceMealsThreshold,
    lowBalanceThresholdCents: config.lowBalanceThresholdCents,
  });
  const history = await getLedgerHistory(student.account.id);
  return {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    grade: student.grade,
    schoolName: student.school.name,
    accountId: student.account.id,
    balanceCents: student.account.balanceCents,
    status: classifyBalance(student.account.balanceCents, threshold),
    history,
  };
}

export interface ReceiptView {
  intentId: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  totalCents: number;
  lines: { studentName: string; amountCents: number }[];
}

/**
 * The intent behind a return/receipt page, scoped to the viewing guardian.
 * Reads status only — it NEVER credits anything. Returns null if the intent
 * isn't the guardian's (the page renders notFound).
 */
export async function getReceiptForGuardian(
  session: AppSession | null | undefined,
  intentId: string,
): Promise<ReceiptView | null> {
  const gid = guardianId(session);
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: intentId },
    include: { allocations: { include: { student: true } } },
  });
  if (!intent || intent.guardianId !== gid) return null;
  return {
    intentId: intent.id,
    status: intent.status,
    totalCents: intent.totalCents,
    lines: intent.allocations.map((a) => ({
      studentName: `${a.student.firstName} ${a.student.lastName}`,
      amountCents: a.amountCents,
    })),
  };
}
