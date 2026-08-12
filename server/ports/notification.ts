import { prisma } from "@/server/db/client";
import type { NotificationType } from "@prisma/client";

/**
 * NotificationPort — the boundary between notification generation and delivery
 * (rule 13, D-5). The pilot ships InAppNotificationPort (writes a Notification +
 * a NotificationDelivery row). Phase 8 swaps a GoHighLevelNotificationPort
 * (email/SMS) behind the SAME interface without touching domain code.
 *
 * `body` MUST NOT contain a pricing tier or eligibility category (D-1).
 */
export interface NotificationRequest {
  guardianId: string;
  districtId: string;
  schoolId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
}

export interface NotificationPort {
  notify(req: NotificationRequest): Promise<void>;
}

class InAppNotificationPort implements NotificationPort {
  async notify(req: NotificationRequest): Promise<void> {
    await prisma.notification.create({
      data: {
        guardianId: req.guardianId,
        districtId: req.districtId,
        schoolId: req.schoolId ?? null,
        type: req.type,
        title: req.title,
        body: req.body,
        deliveries: {
          create: { channel: "IN_APP", status: "DELIVERED", detail: "Delivered to guardian inbox" },
        },
      },
    });
  }
}

/** The port the app uses. Swap the class in phase 8. */
export const notificationPort: NotificationPort = new InAppNotificationPort();
