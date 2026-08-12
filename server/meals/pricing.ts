import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import type { ResolvedPricingConfig } from "@/server/pricing/config";
import {
  type MealType,
  type PriceTier,
  type PricingSource,
  type ActorType,
} from "@prisma/client";

/**
 * Meal pricing — the ONLY place a student's price tier is read or written
 * (rule 5 confidentiality; per the StudentPricing decision). The POS receives a
 * resolved price and an operational result, never a tier. Nothing here may be
 * imported by guardian or POS query/response code, and the tier is never logged.
 */

/**
 * Pure price computation. CEP short-circuits every meal to $0 for all students
 * (CLAUDE.md rule 11). Otherwise the price is the tier's configured amount.
 */
export function computeMealPriceCents(
  mealType: MealType,
  tier: PriceTier,
  config: ResolvedPricingConfig,
): number {
  if (config.cepEnabled) return 0;
  if (mealType === "BREAKFAST") {
    switch (tier) {
      case "FREE":
        return config.breakfastFreeCents;
      case "REDUCED":
        return config.breakfastReducedCents;
      case "PAID":
        return config.breakfastPaidCents;
    }
  }
  switch (tier) {
    case "FREE":
      return config.lunchFreeCents;
    case "REDUCED":
      return config.lunchReducedCents;
    case "PAID":
      return config.lunchPaidCents;
  }
}

/**
 * Resolve a student's price tier. Defaults to FREE when no StudentPricing row
 * exists. Do not call this from guardian/POS-facing code — pricing logic only.
 */
export async function getStudentTier(studentId: string): Promise<PriceTier> {
  const pricing = await prisma.studentPricing.findUnique({
    where: { studentId },
    select: { tier: true },
  });
  return pricing?.tier ?? "FREE";
}

/**
 * Set (or change) a student's price tier. Auditable — production may derive
 * tiers from FRAM, so every change leaves a trail. The audit record stores the
 * before/after tier but this stays server-side pricing data, never surfaced to
 * POS or guardians.
 */
export async function setStudentTier(params: {
  studentId: string;
  tier: PriceTier;
  source: PricingSource;
  actorType: ActorType;
  actorId?: string | null;
  districtId?: string | null;
}): Promise<void> {
  const previous = await prisma.studentPricing.findUnique({
    where: { studentId: params.studentId },
    select: { tier: true, source: true },
  });

  await prisma.studentPricing.upsert({
    where: { studentId: params.studentId },
    create: {
      studentId: params.studentId,
      tier: params.tier,
      source: params.source,
      effectiveFrom: new Date(),
    },
    update: {
      tier: params.tier,
      source: params.source,
      effectiveFrom: new Date(),
    },
  });

  await writeAudit({
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    action: "STUDENT_PRICE_TIER_CHANGED",
    subjectType: "student",
    subjectId: params.studentId,
    districtId: params.districtId ?? null,
    before: previous ? { tier: previous.tier, source: previous.source } : null,
    after: { tier: params.tier, source: params.source },
  });
}
