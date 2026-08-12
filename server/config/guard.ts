import { requireRole } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession, StaffPrincipal } from "@/server/auth/types";

/**
 * Configuration is SUPER ADMIN only. Every config function self-guards through
 * this and takes districtId from the session — never from a form.
 */
export function assertSuperAdmin(session: AppSession | null | undefined): StaffPrincipal {
  requireRole(session, "SUPER_ADMIN"); // throws AuthError otherwise
  if (!session || session.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  return session;
}
