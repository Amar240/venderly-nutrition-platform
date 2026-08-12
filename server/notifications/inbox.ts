import { prisma } from "@/server/db/client";
import { AuthError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import type { Notification } from "@prisma/client";

/** Guardian inbox — a guardian sees only their own notifications. */
function guardianId(session: AppSession | null | undefined): string {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (session.principalType !== "guardian") throw new AuthError("FORBIDDEN_ROLE");
  return session.guardianId;
}

export function getInbox(session: AppSession | null | undefined): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { guardianId: guardianId(session) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function getUnreadCount(session: AppSession | null | undefined): Promise<number> {
  return prisma.notification.count({ where: { guardianId: guardianId(session), readAt: null } });
}

export async function markInboxRead(session: AppSession | null | undefined): Promise<void> {
  await prisma.notification.updateMany({
    where: { guardianId: guardianId(session), readAt: null },
    data: { readAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Admin delivery log — the "did the parent get told?" trail.
// ---------------------------------------------------------------------------

export interface DeliveryLogRow {
  id: string;
  createdAt: Date;
  type: string;
  title: string;
  guardianName: string;
  deliveryStatus: string;
  readByGuardian: boolean;
}

export async function getDeliveryLog(
  session: AppSession | null | undefined,
): Promise<DeliveryLogRow[]> {
  const staff = requireRole(session, "DISTRICT_ADMIN", "SUPER_ADMIN");
  if (staff.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  const isSuper = staff.role === "SUPER_ADMIN";

  const notifications = await prisma.notification.findMany({
    where: {
      districtId: staff.districtId,
      ...(isSuper ? {} : { OR: [{ schoolId: { in: staff.schoolIds } }, { schoolId: null }] }),
    },
    include: {
      guardian: { select: { firstName: true, lastName: true } },
      deliveries: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return notifications.map((n) => ({
    id: n.id,
    createdAt: n.createdAt,
    type: n.type,
    title: n.title,
    guardianName: `${n.guardian.firstName} ${n.guardian.lastName}`,
    deliveryStatus: n.deliveries[0]?.status ?? "PENDING",
    readByGuardian: n.readAt !== null,
  }));
}
