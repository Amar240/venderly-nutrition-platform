import { prisma } from "@/server/db/client";

/**
 * Pricing CONFIG resolution — the config values and low-balance threshold.
 * This module carries NO student tier data; tier resolution lives in
 * server/meals and is never imported here. Safe for guardian/admin surfaces.
 *
 * Precedence: a school-specific PricingConfig overrides the district default.
 */
export interface ResolvedPricingConfig {
  cepEnabled: boolean;
  breakfastFreeCents: number;
  breakfastReducedCents: number;
  breakfastPaidCents: number;
  lunchFreeCents: number;
  lunchReducedCents: number;
  lunchPaidCents: number;
  lowBalanceThresholdCents: number;
  lowBalanceMealsThreshold: number;
}

export const DEFAULT_PRICING_CONFIG: ResolvedPricingConfig = {
  cepEnabled: true,
  breakfastFreeCents: 0,
  breakfastReducedCents: 0,
  breakfastPaidCents: 0,
  lunchFreeCents: 0,
  lunchReducedCents: 0,
  lunchPaidCents: 0,
  lowBalanceThresholdCents: 1000,
  lowBalanceMealsThreshold: 5,
};

export async function getResolvedPricingConfig(
  districtId: string,
  schoolId?: string | null,
): Promise<ResolvedPricingConfig> {
  const configs = await prisma.pricingConfig.findMany({
    where: {
      districtId,
      OR: [{ schoolId: schoolId ?? undefined }, { schoolId: null }],
    },
  });
  // Prefer the school-specific row when present.
  const chosen =
    (schoolId ? configs.find((c) => c.schoolId === schoolId) : undefined) ??
    configs.find((c) => c.schoolId === null);
  if (!chosen) return DEFAULT_PRICING_CONFIG;
  return {
    cepEnabled: chosen.cepEnabled,
    breakfastFreeCents: chosen.breakfastFreeCents,
    breakfastReducedCents: chosen.breakfastReducedCents,
    breakfastPaidCents: chosen.breakfastPaidCents,
    lunchFreeCents: chosen.lunchFreeCents,
    lunchReducedCents: chosen.lunchReducedCents,
    lunchPaidCents: chosen.lunchPaidCents,
    lowBalanceThresholdCents: chosen.lowBalanceThresholdCents,
    lowBalanceMealsThreshold: chosen.lowBalanceMealsThreshold,
  };
}

export async function resolveLowBalanceThresholdCents(
  districtId: string,
  schoolId?: string | null,
): Promise<number> {
  const config = await getResolvedPricingConfig(districtId, schoolId);
  return config.lowBalanceThresholdCents;
}
