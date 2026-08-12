import type { Role } from "@prisma/client";

/**
 * The authenticated principal, derived from the session token. This is the
 * single source RBAC reads — never trust role/scope from the UI (CLAUDE.md
 * rule 7). Two principal kinds: staff (User) and guardian (Guardian).
 */
export type StaffRole = Exclude<Role, "GUARDIAN">;

export interface StaffPrincipal {
  principalType: "staff";
  userId: string;
  role: StaffRole;
  districtId: string;
  schoolIds: string[];
}

export interface GuardianPrincipal {
  principalType: "guardian";
  guardianId: string;
  role: "GUARDIAN";
}

export type AppSession = StaffPrincipal | GuardianPrincipal;

export const STAFF_ROLES: StaffRole[] = [
  "CASHIER",
  "SCHOOL_STAFF",
  "DISTRICT_ADMIN",
  "SUPER_ADMIN",
];

export function isStaff(session: AppSession): session is StaffPrincipal {
  return session.principalType === "staff";
}

export function isGuardian(session: AppSession): session is GuardianPrincipal {
  return session.principalType === "guardian";
}
