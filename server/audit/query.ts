import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import type { AuditLog } from "@prisma/client";

/**
 * Audit log viewer — SUPER ADMIN ONLY (requireRole enforces it). Scoped to the
 * super admin's district (plus null-district system events). Returns the full
 * record: actor, action, subject, time, source (ip), reason, before/after.
 */
export interface AuditFilters {
  action?: string;
  from?: Date;
  to?: Date;
}

export async function searchAuditLog(
  session: AppSession | null | undefined,
  filters: AuditFilters = {},
): Promise<AuditLog[]> {
  const staff = requireRole(session, "SUPER_ADMIN");
  const districtId = staff.principalType === "staff" ? staff.districtId : undefined;

  return prisma.auditLog.findMany({
    where: {
      OR: [{ districtId }, { districtId: null }],
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
