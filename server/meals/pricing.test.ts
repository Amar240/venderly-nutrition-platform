import { describe, it, expect } from "vitest";
import { computeMealPriceCents } from "./pricing";
import type { ResolvedPricingConfig } from "@/server/pricing/config";

const cepOn: ResolvedPricingConfig = {
  cepEnabled: true,
  breakfastFreeCents: 0,
  breakfastReducedCents: 30,
  breakfastPaidCents: 200,
  lunchFreeCents: 0,
  lunchReducedCents: 40,
  lunchPaidCents: 325,
  lowBalanceThresholdCents: 1000,
  lowBalanceMealsThreshold: 5,
};

const cepOff: ResolvedPricingConfig = { ...cepOn, cepEnabled: false };

describe("computeMealPriceCents", () => {
  it("charges $0 for every tier and meal when CEP is enabled", () => {
    for (const tier of ["FREE", "REDUCED", "PAID"] as const) {
      expect(computeMealPriceCents("BREAKFAST", tier, cepOn)).toBe(0);
      expect(computeMealPriceCents("LUNCH", tier, cepOn)).toBe(0);
    }
  });

  it("applies the configured tier price when CEP is off", () => {
    expect(computeMealPriceCents("BREAKFAST", "FREE", cepOff)).toBe(0);
    expect(computeMealPriceCents("BREAKFAST", "REDUCED", cepOff)).toBe(30);
    expect(computeMealPriceCents("BREAKFAST", "PAID", cepOff)).toBe(200);
    expect(computeMealPriceCents("LUNCH", "FREE", cepOff)).toBe(0);
    expect(computeMealPriceCents("LUNCH", "REDUCED", cepOff)).toBe(40);
    expect(computeMealPriceCents("LUNCH", "PAID", cepOff)).toBe(325);
  });
});
