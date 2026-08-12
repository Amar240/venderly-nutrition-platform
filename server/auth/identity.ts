import { prisma } from "@/server/db/client";
import type { AppSession } from "./types";
import type { Role } from "@prisma/client";

const ROLE_LABELS: Record<Role, string> = {
  GUARDIAN: "Guardian",
  CASHIER: "Cashier",
  SCHOOL_STAFF: "School staff",
  DISTRICT_ADMIN: "District admin",
  SUPER_ADMIN: "Super admin",
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
