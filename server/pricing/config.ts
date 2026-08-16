import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import { districtToday } from "@/server/time/district";

/**
 * Pricing CONFIG resolution — the config values and low-balance threshold.
 * This module carries NO student tier data; tier resolution lives in
 * server/meals and is never imported here. Safe for guardian/admin surfaces.
 *
 * Precedence: a school-specific PricingConfig version overrides the district
 * default. D-22 requires pricing by meal service date, not "whatever is
 * current when the cashier records it."
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
  serviceDate?: Date | null,
  db: Pick<Prisma.TransactionClient, "pricingConfig"> = prisma,
): Promise<ResolvedPricingConfig> {
  const date = serviceDate ?? await districtToday(districtId);
  const schoolConfig = schoolId
    ? await db.pricingConfig.findFirst({
        where: {
          districtId,
          schoolId,
          cancelledAt: null,
          effectiveFrom: { lte: date },
        },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      })
    : null;
  const districtConfig = await db.pricingConfig.findFirst({
    where: {
      districtId,
      schoolId: null,
      cancelledAt: null,
      effectiveFrom: { lte: date },
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const chosen = schoolConfig ?? districtConfig;
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
  const config = await getResolvedPricingConfig(districtId, schoolId, await districtToday(districtId));
  return config.lowBalanceThresholdCents;
}
