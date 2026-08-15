import { describe, expect, it } from "vitest";
import { DEFAULT_DISTRICT_TIME_ZONE, districtDateOnly } from "../server/time/district";
import {
  addUtcDays,
  allocatePricingTiers,
  buildMealHistoryCalendar,
  buildStudentPricingRows,
  classroomTeacherForPosition,
  dailyParticipationPercent,
  dateKey,
  DEMO_STUDENT_COUNT,
  MEAL_HISTORY_CLOSURE_ORDINALS,
  MEAL_HISTORY_LOOKBACK_DAYS,
  orderStudentsForMeal,
  participationTarget,
  scaleEnrollmentCounts,
  totalRealEnrollment,
  WOODBRIDGE_SCHOOLS,
  WOODBRIDGE_CLASSROOMS,
  WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS,
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
  it("uses the 93.8% FNS federal default for edit-check ceilings", () => {
    expect(WOODBRIDGE_FNS_FEDERAL_DEFAULT_ATTENDANCE_FACTOR_BPS).toBe(9380);
  });

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

  it("defines deterministic teacher-named classrooms only for the two roster schools", () => {
    expect(WOODBRIDGE_CLASSROOMS).toHaveLength(10);
    expect(new Set(WOODBRIDGE_CLASSROOMS.map((room) => room.schoolCode))).toEqual(new Set(["7760", "0779"]));
    expect(classroomTeacherForPosition("0779", "3", 0)).toBe("Priya Shah");
    expect(classroomTeacherForPosition("0779", "3", 1)).toBe("Daniel Carter");
    expect(classroomTeacherForPosition("0779", "3", 2)).toBe("Priya Shah");
    expect(classroomTeacherForPosition("7760", "PK", 99)).toBe("Cameron Ellis");
    expect(classroomTeacherForPosition("7750", "7", 0)).toBeNull();
  });

  it("builds a rolling weekday-only history with three deterministic closures", () => {
    const today = districtDateOnly(DEFAULT_DISTRICT_TIME_ZONE);
    const first = buildMealHistoryCalendar(today);
    const second = buildMealHistoryCalendar(today);

    expect(first.operatingDays.map(dateKey)).toEqual(second.operatingDays.map(dateKey));
    expect(first.closureDays.map(dateKey)).toEqual(second.closureDays.map(dateKey));
    expect(first.closureDays).toHaveLength(MEAL_HISTORY_CLOSURE_ORDINALS.length);
    expect(first.operatingDays.every((date) => ![0, 6].includes(date.getUTCDay()))).toBe(true);
    expect(first.closureDays.every((date) => ![0, 6].includes(date.getUTCDay()))).toBe(true);
    expect(first.operatingDays.every((date) => !first.closureDays.some((closure) => dateKey(closure) === dateKey(date)))).toBe(true);
    expect(first.operatingDays[0]!.getTime()).toBeGreaterThanOrEqual(
      addUtcDays(today, -(MEAL_HISTORY_LOOKBACK_DAYS - 1)).getTime(),
    );
    expect(first.operatingDays.at(-1)!.getTime()).toBeLessThanOrEqual(today.getTime());
  });

  it("varies participation deterministically within three percentage points", () => {
    const today = districtDateOnly(DEFAULT_DISTRICT_TIME_ZONE);
    const days = buildMealHistoryCalendar(today).operatingDays;
    const values = days.map((serviceDate) => dailyParticipationPercent({
      basePercent: 55,
      schoolCode: "7760",
      serviceDate,
      mealType: "BREAKFAST",
    }));

    expect(values.every((value) => value >= 52 && value <= 58)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(1);
    expect(values).toEqual(days.map((serviceDate) => dailyParticipationPercent({
      basePercent: 55,
      schoolCode: "7760",
      serviceDate,
      mealType: "BREAKFAST",
    })));
  });

  it("selects students repeatably and caps ordinary participation at the ceiling", () => {
    const students = Array.from({ length: 12 }, (_, index) => ({
      studentNumber: String(100001 + index),
    }));
    const serviceDate = districtDateOnly(DEFAULT_DISTRICT_TIME_ZONE);
    const input = { schoolCode: "0779", serviceDate, mealType: "LUNCH" as const };

    expect(orderStudentsForMeal(students, input)).toEqual(orderStudentsForMeal(students, input));
    expect(orderStudentsForMeal(students, input).map((row) => row.studentNumber).sort()).toEqual(
      students.map((row) => row.studentNumber).sort(),
    );
    expect(participationTarget(53, 97, 49)).toBe(49);
    expect(participationTarget(53, 55, 49)).toBe(29);
  });
});
