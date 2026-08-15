import { prisma } from "@/server/db/client";
import type { AppSession } from "./types";
import type { Role } from "@prisma/client";
import { staffRoleLabel } from "@/lib/presentation-labels";

const ROLE_LABELS: Record<Role, string> = {
  GUARDIAN: "Guardian",
  CASHIER: staffRoleLabel("CASHIER"),
  SCHOOL_STAFF: staffRoleLabel("SCHOOL_STAFF"),
  DISTRICT_ADMIN: staffRoleLabel("DISTRICT_ADMIN"),
  SUPER_ADMIN: staffRoleLabel("SUPER_ADMIN"),
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export interface SessionIdentity {
  name: string;
  roleLabel: string;
}

/** Display name + role for the shell header. Never exposes sensitive data. */
export async function getSessionIdentity(
  session: AppSession,
): Promise<SessionIdentity> {
  if (session.principalType === "guardian") {
    const g = await prisma.guardian.findUnique({
      where: { id: session.guardianId },
      select: { firstName: true, lastName: true },
    });
    return {
      name: g ? `${g.firstName} ${g.lastName}` : "Guardian",
      roleLabel: ROLE_LABELS.GUARDIAN,
    };
  }
  const u = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, lastName: true },
  });
  return {
    name: u ? `${u.firstName} ${u.lastName}` : "Staff",
    roleLabel: ROLE_LABELS[session.role],
  };
}
