import { prisma } from "@/server/db/client";
import { AuthError } from "@/server/auth/errors";
import { requireRole, requireStaff } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";

export const CHARGE_POLICY_MAX_LENGTH = 10_000;

export interface ChargePolicyView {
  districtId: string;
  districtName: string;
  policyText: string | null;
  canEdit: boolean;
}

export class ChargePolicyError extends Error {
  constructor(public readonly code: "EMPTY" | "TOO_LONG" | "NO_LINKED_CHILD") {
    super(code);
    this.name = "ChargePolicyError";
  }
}

function normalizePolicyText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

async function guardianPolicy(session: AppSession): Promise<ChargePolicyView> {
  if (session.principalType !== "guardian") throw new AuthError("FORBIDDEN_ROLE");
  const link = await prisma.guardianStudent.findFirst({
    where: { guardianId: session.guardianId },
    select: {
      student: {
        select: {
          district: {
            select: {
              id: true,
              name: true,
              unpaidMealChargePolicyText: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!link) throw new ChargePolicyError("NO_LINKED_CHILD");
  return {
    districtId: link.student.district.id,
    districtName: link.student.district.name,
    policyText: link.student.district.unpaidMealChargePolicyText,
    canEdit: false,
  };
}

export async function getChargePolicy(
  session: AppSession | null | undefined,
): Promise<ChargePolicyView> {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (session.principalType === "guardian") return guardianPolicy(session);
  const staff = requireStaff(session);
  const district = await prisma.district.findUniqueOrThrow({
    where: { id: staff.districtId },
    select: { id: true, name: true, unpaidMealChargePolicyText: true },
  });
  return {
    districtId: district.id,
    districtName: district.name,
    policyText: district.unpaidMealChargePolicyText,
    canEdit: staff.role === "DISTRICT_ADMIN" || staff.role === "SUPER_ADMIN",
  };
}

export async function updateChargePolicy(
  session: AppSession | null | undefined,
  text: string,
): Promise<ChargePolicyView> {
  const staff = requireRole(session, "DISTRICT_ADMIN", "SUPER_ADMIN");
  if (staff.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  const normalized = normalizePolicyText(text);
  if (!normalized) throw new ChargePolicyError("EMPTY");
  if (normalized.length > CHARGE_POLICY_MAX_LENGTH) throw new ChargePolicyError("TOO_LONG");

  await prisma.$transaction(async (tx) => {
    const before = await tx.district.findUniqueOrThrow({
      where: { id: staff.districtId },
      select: { unpaidMealChargePolicyText: true },
    });
    const after = await tx.district.update({
      where: { id: staff.districtId },
      data: { unpaidMealChargePolicyText: normalized },
      select: { unpaidMealChargePolicyText: true },
    });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: staff.userId,
        action: "CONFIG_CHARGE_POLICY_UPDATE",
        subjectType: "district",
        subjectId: staff.districtId,
        districtId: staff.districtId,
        reason: "District meal charge policy updated.",
        beforeJson: { unpaidMealChargePolicyText: before.unpaidMealChargePolicyText },
        afterJson: { unpaidMealChargePolicyText: after.unpaidMealChargePolicyText },
      },
    });
  });

  return getChargePolicy(session);
}
