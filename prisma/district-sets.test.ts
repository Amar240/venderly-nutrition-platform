import { afterEach, describe, expect, it } from "vitest";
import {
  activeDistrictName,
  activeSchools,
  DEMO_DISTRICT_NAME,
  DEMO_SCHOOLS,
  WOODBRIDGE_DISTRICT_NAME,
  WOODBRIDGE_SCHOOLS,
  WOODBRIDGE_CLASSROOMS,
  WOODBRIDGE_MEAL_PARTICIPATION,
} from "./seed-data";

/**
 * The seed can build either of two districts, and every planted demo fixture
 * is pinned to a school's POSITION and CODE rather than its name: index 2 is
 * where the edit-check breach lands, index 3 holds the graduating balances,
 * roster mode belongs to indexes 0 and 1, and participation rates and
 * classrooms are looked up by code.
 *
 * That assumption is invisible in the code. Reorder one array, change one
 * code, and the seed still runs, the app still boots, and the fixtures quietly
 * land in the wrong schools — a demo that has stopped demonstrating what it
 * claims, discovered in front of a customer. These tests make that failure
 * loud at build time instead.
 */

describe("the two district sets stay interchangeable", () => {
  it("has the same number of schools in both sets", () => {
    expect(DEMO_SCHOOLS).toHaveLength(WOODBRIDGE_SCHOOLS.length);
  });

  it("keeps school codes identical and in the same order", () => {
    expect(DEMO_SCHOOLS.map((s) => s.code)).toEqual(
      WOODBRIDGE_SCHOOLS.map((s) => s.code),
    );
  });

  it("keeps grades and enrollment identical position by position", () => {
    DEMO_SCHOOLS.forEach((demo, index) => {
      const woodbridge = WOODBRIDGE_SCHOOLS[index]!;
      expect(demo.grades).toEqual(woodbridge.grades);
      expect(demo.realEnrollment).toBe(woodbridge.realEnrollment);
    });
  });

  it("covers every school code in the participation table", () => {
    for (const school of DEMO_SCHOOLS) {
      expect(WOODBRIDGE_MEAL_PARTICIPATION[school.code]).toBeDefined();
    }
  });

  it("points every classroom at a code that exists in both sets", () => {
    const demoCodes = new Set(DEMO_SCHOOLS.map((s) => s.code));
    const woodbridgeCodes = new Set(WOODBRIDGE_SCHOOLS.map((s) => s.code));
    for (const classroom of WOODBRIDGE_CLASSROOMS) {
      expect(demoCodes.has(classroom.schoolCode)).toBe(true);
      expect(woodbridgeCodes.has(classroom.schoolCode)).toBe(true);
    }
  });
});

describe("the default district names nothing real", () => {
  /*
   * The point of the demo set is that it can be shown to any district. A real
   * school name belonging to one client, appearing in a demo given to another,
   * reads as leaked customer data — the prospect has no way to know the roster
   * is synthetic.
   */
  const REAL_WOODBRIDGE_WORDS = ["woodbridge", "wheatley", "s.c.o.p.e", "scope"];

  it("keeps real district vocabulary out of the demo school names", () => {
    for (const school of DEMO_SCHOOLS) {
      const name = school.name.toLowerCase();
      for (const word of REAL_WOODBRIDGE_WORDS) {
        expect(name).not.toContain(word);
      }
    }
  });

  it("keeps real district vocabulary out of the demo district name", () => {
    const name = DEMO_DISTRICT_NAME.toLowerCase();
    for (const word of REAL_WOODBRIDGE_WORDS) {
      expect(name).not.toContain(word);
    }
  });

  it("still names Woodbridge in the set reserved for that pitch", () => {
    expect(WOODBRIDGE_DISTRICT_NAME).toContain("Woodbridge");
    expect(WOODBRIDGE_SCHOOLS.some((s) => s.name.includes("Woodbridge"))).toBe(true);
  });
});

describe("SEED_DISTRICT selects which district the seed builds", () => {
  const original = process.env.SEED_DISTRICT;

  afterEach(() => {
    if (original === undefined) delete process.env.SEED_DISTRICT;
    else process.env.SEED_DISTRICT = original;
  });

  it("defaults to the generic demo district", () => {
    delete process.env.SEED_DISTRICT;
    expect(activeDistrictName()).toBe(DEMO_DISTRICT_NAME);
    expect(activeSchools()).toBe(DEMO_SCHOOLS);
  });

  it("builds Woodbridge only on an exact match", () => {
    process.env.SEED_DISTRICT = "woodbridge";
    expect(activeDistrictName()).toBe(WOODBRIDGE_DISTRICT_NAME);
    expect(activeSchools()).toBe(WOODBRIDGE_SCHOOLS);
  });

  it.each(["Woodbridge", "WOODBRIDGE", "wood bridge", "true", ""])(
    "falls back to the demo district for the near-miss value %j",
    (value) => {
      // Failing safe matters in the direction that protects a real client's
      // names: an unrecognised value must never accidentally select Woodbridge.
      process.env.SEED_DISTRICT = value;
      expect(activeDistrictName()).toBe(DEMO_DISTRICT_NAME);
      expect(activeSchools()).toBe(DEMO_SCHOOLS);
    },
  );
});
