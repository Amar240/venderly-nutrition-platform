import { describe, expect, it } from "vitest";
import {
  allocatePricingTiers,
  buildStudentPricingRows,
  DEMO_STUDENT_COUNT,
  scaleEnrollmentCounts,
  totalRealEnrollment,
  WOODBRIDGE_SCHOOLS,
} from "./seed-data";

function counts<T extends string>(items: T[]): Record<T, number> {
  return items.reduce(
    (acc, item) => {
      acc[item] = (acc[item] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

describe("real Woodbridge seed data", () => {
  it("scales official school enrollment to the 200-student demo roster", () => {
    expect(totalRealEnrollment()).toBe(2720);

    const scaled = scaleEnrollmentCounts(WOODBRIDGE_SCHOOLS, DEMO_STUDENT_COUNT);

    expect(scaled.map((school) => school.seedCount)).toEqual([51, 48, 43, 53, 2, 3]);
    expect(scaled.reduce((sum, school) => sum + school.seedCount, 0)).toBe(DEMO_STUDENT_COUNT);
  });

  it("allocates the realistic three-tier mix exactly and deterministically", () => {
    const first = allocatePricingTiers(DEMO_STUDENT_COUNT);
    const second = allocatePricingTiers(DEMO_STUDENT_COUNT);

    expect(first).toEqual(second);
    expect(counts(first)).toEqual({ FREE: 130, REDUCED: 16, PAID: 54 });
  });

  it("builds exactly one district-export pricing row for every seeded student", () => {
    const studentIds = Array.from({ length: DEMO_STUDENT_COUNT }, (_, index) => `student-${index + 1}`);
    const rows = buildStudentPricingRows(studentIds);

    expect(rows).toHaveLength(DEMO_STUDENT_COUNT);
    expect(new Set(rows.map((row) => row.studentId)).size).toBe(DEMO_STUDENT_COUNT);
    expect(rows.every((row) => row.source === "DISTRICT_EXPORT")).toBe(true);
    expect(counts(rows.map((row) => row.tier))).toEqual({ FREE: 130, REDUCED: 16, PAID: 54 });
  });
});
