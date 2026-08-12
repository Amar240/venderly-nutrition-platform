import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { assertSuperAdmin } from "./guard";
import { ConfigError } from "./items";
import type { AppSession } from "@/server/auth/types";
import type { PricingConfig } from "@prisma/client";

/**
 * Pricing CONFIG (super admin): CEP toggle, the six tier PRICES, and the
 * low-balance threshold, per district or school. These are configuration prices,
 * NOT a per-student tier — StudentPricing never appears here (D-1). Audited.
 */
export interface PricingConfigInput {
  schoolId?: string | null;
  cepEnabled: boolean;
  breakfastFreeCents: number;
  breakfastReducedCents: number;
  breakfastPaidCents: number;
  lunchFreeCents: number;
  lunchReducedCents: number;
  lunchPaidCents: number;
  lowBalanceThresholdCents: number;
}

export function listPricingConfigs(session: AppSession | null | undefined): Promise<PricingConfig[]> {
  const staff = assertSuperAdmin(session);
  return prisma.pricingConfig.findMany({ where: { districtId: staff.districtId }, orderBy: { schoolId: "asc" } });
}

function priceFields(c: PricingConfigInput | PricingConfig) {
  return {
    cepEnabled: c.cepEnabled,
    breakfastFreeCents: c.breakfastFreeCents,
    breakfastReducedCents: c.breakfastReducedCents,
    breakfastPaidCents: c.breakfastPaidCents,
    lunchFreeCents: c.lunchFreeCents,
    lunchReducedCents: c.lunchReducedCents,
    lunchPaidCents: c.lunchPaidCents,
    lowBalanceThresholdCents: c.lowBalanceThresholdCents,
  };
}

export async function updatePricingConfig(
  session: AppSession | null | undefined,
  input: PricingConfigInput,
): Promise<PricingConfig> {
  const staff = assertSuperAdmin(session);
  const cents = [
    input.breakfastFreeCents, input.breakfastReducedCents, input.breakfastPaidCents,
    input.lunchFreeCents, input.lunchReducedCents, input.lunchPaidCents, input.lowBalanceThresholdCents,
  ];
  if (cents.some((n) => !Number.isInteger(n) || n < 0)) throw new ConfigError("INVALID");

  const schoolId = input.schoolId ?? null;
  const before = await prisma.pricingConfig.findFirst({ where: { districtId: staff.districtId, schoolId } });
  const data = priceFields(input);
  const after = before
    ? await prisma.pricingConfig.update({ where: { id: before.id }, data })
    : await prisma.pricingConfig.create({ data: { districtId: staff.districtId, schoolId, ...data } });

  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_PRICING_UPDATE",
    subjectType: "pricingConfig", subjectId: after.id, districtId: staff.districtId, schoolId,
    before: before ? priceFields(before) : null,
    after: priceFields(after),
  });
  return after;
}
