import { prisma } from "@/server/db/client";
import { AuthError } from "./errors";
import {
  type AppSession,
  type StaffPrincipal,
  type StaffRole,
  isStaff,
} from "./types";
import type { Role } from "@prisma/client";

/**
 * RBAC guards — the ONLY place role and scope are enforced (CLAUDE.md rule 7).
 * Every server module calls these; the UI is never the protection.
 * Pure and synchronous except requireGuardianOf, which verifies a DB link.
 */

/** Assert the session's role is one of the allowed roles. */
export function requireRole<R extends Role>(
  session: AppSession | null | undefined,
  ...roles: R[]
): AppSession {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (!roles.includes(session.role as R)) {
    throw new AuthError("FORBIDDEN_ROLE");
  }
  return session;
}

/** Assert the session is any staff role (not a guardian). */
export function requireStaff(
  session: AppSession | null | undefined,
): StaffPrincipal {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (!isStaff(session)) throw new AuthError("FORBIDDEN_ROLE");
  return session;
}

/**
 * A Prisma `where` fragment that constrains a query to the schools/district
 * the staff session may see. SUPER_ADMIN sees the whole district; every other
 * staff role is restricted to assigned schools. Guardians never use this —
 * they reach students only through requireGuardianOf.
 */
export interface SchoolScopeFilter {
  districtId: string;
  schoolId?: { in: string[] };
}

export function scopeToSchools(
  session: AppSession | null | undefined,
): SchoolScopeFilter {
  const staff = requireStaff(session);
  if (staff.role === "SUPER_ADMIN") {
    return { districtId: staff.districtId };
  }
  return {
    districtId: staff.districtId,
    schoolId: { in: staff.schoolIds },
  };
}

/** True if a staff session may act within the given school. */
export function canAccessSchool(
  session: AppSession | null | undefined,
  schoolId: string,
): boolean {
  const staff = requireStaff(session);
  if (staff.role === "SUPER_ADMIN") return true;
  return staff.schoolIds.includes(schoolId);
}

/** Assert a staff session may act within the given district. */
export function assertDistrict(
  session: AppSession | null | undefined,
  districtId: string,
): StaffPrincipal {
  const staff = requireStaff(session);
  if (staff.districtId !== districtId) throw new AuthError("FORBIDDEN_SCOPE");
  return staff;
}

/** Minimal DB surface so this guard is unit-testable with a stub. */
export interface GuardianLinkReader {
  guardianStudent: {
    findUnique: (args: {
      where: { guardianId_studentId: { guardianId: string; studentId: string } };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
}

/**
 * Assert the guardian session is linked to the student via a verified
 * GuardianStudent row. There is no open student lookup for guardians —
 * access exists ONLY through this relationship (CLAUDE.md rule 7).
 */
export async function requireGuardianOf(
  session: AppSession | null | undefined,
  studentId: string,
  db: GuardianLinkReader = prisma,
): Promise<void> {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (session.principalType !== "guardian") {
    throw new AuthError("FORBIDDEN_ROLE");
  }
  const link = await db.guardianStudent.findUnique({
    where: {
      guardianId_studentId: {
        guardianId: session.guardianId,
        studentId,
      },
    },
    select: { id: true },
  });
  if (!link) throw new AuthError("NOT_GUARDIAN_OF");
}

export type { StaffRole };
