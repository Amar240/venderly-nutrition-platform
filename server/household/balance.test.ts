import { describe, it, expect } from "vitest";
import { classifyBalance, lowBalanceThresholdForChild } from "./balance";

describe("classifyBalance", () => {
  const threshold = 1000; // $10.00

  it("flags a negative balance", () => {
    expect(classifyBalance(-1, threshold)).toBe("negative");
    expect(classifyBalance(-500, threshold)).toBe("negative");
  });

  it("flags a low balance below the threshold", () => {
    expect(classifyBalance(0, threshold)).toBe("low");
    expect(classifyBalance(999, threshold)).toBe("low");
  });

  it("treats at-or-above threshold as healthy", () => {
    expect(classifyBalance(1000, threshold)).toBe("healthy");
    expect(classifyBalance(5000, threshold)).toBe("healthy");
  });
});

describe("lowBalanceThresholdForChild", () => {
  it("uses meals remaining when lunch has a price", () => {
    const threshold = lowBalanceThresholdForChild({
      balanceCents: 160,
      lunchPriceCents: 40,
      lowBalanceMealsThreshold: 5,
      lowBalanceThresholdCents: 1000,
    });
    expect(threshold).toBe(200);
    expect(classifyBalance(160, threshold)).toBe("low"); // four lunches
    expect(classifyBalance(200, threshold)).toBe("healthy"); // five lunches
  });

  it("uses the cents fallback when lunch costs nothing", () => {
    const threshold = lowBalanceThresholdForChild({
      balanceCents: 900,
      lunchPriceCents: 0,
      lowBalanceMealsThreshold: 5,
      lowBalanceThresholdCents: 1000,
    });
    expect(threshold).toBe(1000);
    expect(classifyBalance(900, threshold)).toBe("low");
  });
});
