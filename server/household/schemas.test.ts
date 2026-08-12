import { describe, it, expect } from "vitest";
import { depositSchema, transferSchema } from "./schemas";

describe("depositSchema", () => {
  it("accepts one or more positive integer-cent allocations", () => {
    expect(
      depositSchema.safeParse({
        allocations: [
          { studentId: "a", amountCents: 100 },
          { studentId: "b", amountCents: 2500 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects empty, zero, negative, or non-integer amounts", () => {
    expect(depositSchema.safeParse({ allocations: [] }).success).toBe(false);
    expect(
      depositSchema.safeParse({ allocations: [{ studentId: "a", amountCents: 0 }] }).success,
    ).toBe(false);
    expect(
      depositSchema.safeParse({ allocations: [{ studentId: "a", amountCents: -5 }] }).success,
    ).toBe(false);
    expect(
      depositSchema.safeParse({ allocations: [{ studentId: "a", amountCents: 1.5 }] }).success,
    ).toBe(false);
  });
});

describe("transferSchema", () => {
  it("accepts a valid transfer between two different children", () => {
    expect(
      transferSchema.safeParse({ fromStudentId: "a", toStudentId: "b", amountCents: 500 }).success,
    ).toBe(true);
  });

  it("rejects same-child transfers and non-positive amounts", () => {
    expect(
      transferSchema.safeParse({ fromStudentId: "a", toStudentId: "a", amountCents: 500 }).success,
    ).toBe(false);
    expect(
      transferSchema.safeParse({ fromStudentId: "a", toStudentId: "b", amountCents: 0 }).success,
    ).toBe(false);
  });
});
