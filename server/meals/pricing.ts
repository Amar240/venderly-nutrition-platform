import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import type { ResolvedPricingConfig } from "@/server/pricing/config";
import {
  Prisma,
  type MealType,
  type PriceTier,
  type PricingSource,
  type ActorType,
} from "@prisma/client";

/**
 * Meal pricing. StudentPricing has exactly two authorised readers: this meal
 * pricing logic and the guardian household read model scoped through a verified
 * relationship. The POS receives a resolved price and an operational result,
 * never a tier. The tier is never logged.
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
export async function getStudentTier(
  studentId: string,
  db: Pick<Prisma.TransactionClient, "studentPricing"> = prisma,
): Promise<PriceTier> {
  const pricing = await db.studentPricing.findUnique({
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

  // D-1: the tier VALUE must never appear in an audit payload. Record that a
  // change happened and its provenance (source), never the tier itself.
  await writeAudit({
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    action: "STUDENT_PRICE_TIER_CHANGED",
    subjectType: "student",
    subjectId: params.studentId,
    districtId: params.districtId ?? null,
    before: previous ? { source: previous.source } : null,
    after: { source: params.source },
  });
}
