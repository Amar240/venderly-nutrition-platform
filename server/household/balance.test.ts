import { describe, it, expect } from "vitest";
import { classifyBalance } from "./balance";

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
