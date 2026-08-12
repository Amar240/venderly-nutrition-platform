import { describe, it, expect } from "vitest";
import { parseDollarsToCents, formatCents } from "./utils";

describe("parseDollarsToCents", () => {
  it("parses valid dollar strings to exact integer cents (no float)", () => {
    expect(parseDollarsToCents("25")).toBe(2500);
    expect(parseDollarsToCents("25.5")).toBe(2550);
    expect(parseDollarsToCents("25.50")).toBe(2550);
    expect(parseDollarsToCents("0.99")).toBe(99);
    expect(parseDollarsToCents("$1,234.00")).toBe(123400);
    expect(parseDollarsToCents("  10  ")).toBe(1000);
  });

  it("rejects invalid, negative, or over-precise input", () => {
    for (const bad of ["", "-5", "5.999", "abc", "5.1.2", ".", "1e3", "$"]) {
      expect(parseDollarsToCents(bad)).toBeNull();
    }
  });
});

describe("formatCents", () => {
  it("round-trips with the parser", () => {
    expect(formatCents(2550)).toBe("$25.50");
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(123400)).toBe("$1,234.00");
  });
});
