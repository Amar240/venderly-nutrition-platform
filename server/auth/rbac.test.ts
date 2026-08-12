import { describe, it, expect } from "vitest";
import {
  requireRole,
  requireStaff,
  scopeToSchools,
  canAccessSchool,
  assertDistrict,
  requireGuardianOf,
  type GuardianLinkReader,
} from "./rbac";
import { AuthError } from "./errors";
import type { GuardianPrincipal, StaffPrincipal } from "./types";

const guardian: GuardianPrincipal = {
  principalType: "guardian",
  guardianId: "g1",
  role: "GUARDIAN",
};

const cashier: StaffPrincipal = {
  principalType: "staff",
  userId: "u-cashier",
  role: "CASHIER",
  districtId: "d1",
  schoolIds: ["s1"],
};

const districtAdmin: StaffPrincipal = {
  principalType: "staff",
  userId: "u-admin",
  role: "DISTRICT_ADMIN",
  districtId: "d1",
  schoolIds: ["s1", "s2"],
};

const superAdmin: StaffPrincipal = {
  principalType: "staff",
  userId: "u-super",
  role: "SUPER_ADMIN",
  districtId: "d1",
  schoolIds: [],
};

describe("requireRole", () => {
  it("allows a permitted role", () => {
    expect(() => requireRole(districtAdmin, "DISTRICT_ADMIN", "SUPER_ADMIN")).not.toThrow();
  });

  it("denies a role not in the allow-list (cashier cannot reach admin)", () => {
    expect(() => requireRole(cashier, "DISTRICT_ADMIN", "SUPER_ADMIN")).toThrowError(
      AuthError,
    );
    try {
      requireRole(cashier, "DISTRICT_ADMIN");
    } catch (e) {
      expect((e as AuthError).code).toBe("FORBIDDEN_ROLE");
    }
  });

  it("denies a guardian on a staff-only route", () => {
    expect(() => requireRole(guardian, "CASHIER")).toThrowError(AuthError);
  });

  it("throws UNAUTHENTICATED with no session", () => {
    try {
      requireRole(null, "CASHIER");
    } catch (e) {
      expect((e as AuthError).code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("requireStaff", () => {
  it("accepts staff, rejects guardian", () => {
    expect(requireStaff(cashier)).toBe(cashier);
    expect(() => requireStaff(guardian)).toThrowError(AuthError);
  });
});

describe("scopeToSchools", () => {
  it("restricts non-super staff to assigned schools", () => {
    expect(scopeToSchools(cashier)).toEqual({
      districtId: "d1",
      schoolId: { in: ["s1"] },
    });
    expect(scopeToSchools(districtAdmin)).toEqual({
      districtId: "d1",
      schoolId: { in: ["s1", "s2"] },
    });
  });

  it("gives a super admin the whole district (no school restriction)", () => {
    expect(scopeToSchools(superAdmin)).toEqual({ districtId: "d1" });
  });

  it("throws for a guardian (guardians never use school scope)", () => {
    expect(() => scopeToSchools(guardian)).toThrowError(AuthError);
  });
});

describe("canAccessSchool / assertDistrict", () => {
  it("cashier can access only assigned schools", () => {
    expect(canAccessSchool(cashier, "s1")).toBe(true);
    expect(canAccessSchool(cashier, "s2")).toBe(false);
  });

  it("super admin can access any school", () => {
    expect(canAccessSchool(superAdmin, "s9")).toBe(true);
  });

  it("assertDistrict denies a cross-district action", () => {
    expect(() => assertDistrict(cashier, "d1")).not.toThrow();
    try {
      assertDistrict(cashier, "d2");
    } catch (e) {
      expect((e as AuthError).code).toBe("FORBIDDEN_SCOPE");
    }
  });
});

describe("requireGuardianOf", () => {
  const db: GuardianLinkReader = {
    guardianStudent: {
      async findUnique({ where }) {
        const { guardianId, studentId } = where.guardianId_studentId;
        // g1 is linked to child-linked only.
        return guardianId === "g1" && studentId === "child-linked"
          ? { id: "link-1" }
          : null;
      },
    },
  };

  it("allows a guardian to reach a linked student", async () => {
    await expect(requireGuardianOf(guardian, "child-linked", db)).resolves.toBeUndefined();
  });

  it("denies a guardian reaching another household's student", async () => {
    await expect(
      requireGuardianOf(guardian, "child-other", db),
    ).rejects.toMatchObject({ code: "NOT_GUARDIAN_OF" });
  });

  it("denies a staff session on the guardian path", async () => {
    await expect(requireGuardianOf(cashier, "child-linked", db)).rejects.toMatchObject({
      code: "FORBIDDEN_ROLE",
    });
  });
});
