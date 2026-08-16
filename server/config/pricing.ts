import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import { districtToday } from "@/server/time/district";
import { DEFAULT_PRICING_CONFIG, type ResolvedPricingConfig } from "@/server/pricing/config";
import { ConfigError } from "./items";
import type { AppSession } from "@/server/auth/types";
import type { AttendanceFactorProvenance, PriceTier, PricingConfig, Prisma } from "@prisma/client";

/**
 * District meal-price configuration. D-22 makes this effective-dated and
 * immutable: new settings create a version, while only unused future versions
 * may be cancelled. This screen is also D-1's third pricing-category reader,
 * but only as district-wide aggregate counts.
 */

export interface PricingConfigInput {
  schoolId?: string | null;
  cepEnabled: boolean;
  breakfastFreeCents: number;
  breakfastReducedCents: number;
  breakfastPaidCents: number;
  lunchFreeCents: number;
  lunchReducedCents: number;
  lunchPaidCents: number;
  lowBalanceThresholdCents: number;
  lowBalanceMealsThreshold: number;
  effectiveFrom: Date;
  reason: string;
}

export interface ComplianceSettingsInput {
  identifiedStudentPercentageBps: number;
  stateAttendanceFactorBps: number;
  stateAttendanceFactorProvenance: AttendanceFactorProvenance;
  reason: string;
}

export interface PricingCategoryCounts {
  noCostStudentCount: number;
  lowerPriceStudentCount: number;
  fullPriceStudentCount: number;
  activeStudentCount: number;
}

export interface PricingVersionView extends ResolvedPricingConfig {
  id: string | null;
  effectiveFrom: Date | null;
  createdAt: Date | null;
  createdByName: string | null;
}

export interface PricingConfigurationView {
  districtName: string;
  current: PricingVersionView;
  scheduled: PricingVersionView | null;
  counts: PricingCategoryCounts;
  compliance: {
    identifiedStudentPercentageBps: number | null;
    stateAttendanceFactorBps: number | null;
    stateAttendanceFactorProvenance: AttendanceFactorProvenance;
  };
}

function staffForPricing(session: AppSession | null | undefined) {
  const staff = requireRole(session, "DISTRICT_ADMIN", "SUPER_ADMIN");
  if (staff.principalType !== "staff") throw new ConfigError("INVALID");
  return staff;
}

function validateReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new ConfigError("INVALID");
  return trimmed;
}

function validatePriceFields(input: Omit<PricingConfigInput, "schoolId" | "effectiveFrom" | "reason">) {
  const cents = [
    input.breakfastFreeCents,
    input.breakfastReducedCents,
    input.breakfastPaidCents,
    input.lunchFreeCents,
    input.lunchReducedCents,
    input.lunchPaidCents,
    input.lowBalanceThresholdCents,
  ];
  if (cents.some((n) => !Number.isInteger(n) || n < 0)) throw new ConfigError("INVALID");
  if (!Number.isInteger(input.lowBalanceMealsThreshold) || input.lowBalanceMealsThreshold < 0) {
    throw new ConfigError("INVALID");
  }
}

function validateBps(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new ConfigError("INVALID");
}

function priceFields(c: PricingConfigInput | PricingConfig | ResolvedPricingConfig) {
  return {
    cepEnabled: c.cepEnabled,
    breakfastFreeCents: c.breakfastFreeCents,
    breakfastReducedCents: c.breakfastReducedCents,
    breakfastPaidCents: c.breakfastPaidCents,
    lunchFreeCents: c.lunchFreeCents,
    lunchReducedCents: c.lunchReducedCents,
    lunchPaidCents: c.lunchPaidCents,
    lowBalanceThresholdCents: c.lowBalanceThresholdCents,
    lowBalanceMealsThreshold: c.lowBalanceMealsThreshold,
  };
}

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function versionView(
  config: (PricingConfig & { createdBy?: { firstName: string; lastName: string } | null }) | null,
): PricingVersionView {
  if (!config) {
    return {
      id: null,
      effectiveFrom: null,
      createdAt: null,
      createdByName: null,
      ...DEFAULT_PRICING_CONFIG,
    };
  }
  return {
    id: config.id,
    effectiveFrom: config.effectiveFrom,
    createdAt: config.createdAt,
    createdByName: config.createdBy ? `${config.createdBy.firstName} ${config.createdBy.lastName}` : null,
    ...priceFields(config),
  };
}

async function districtWideCounts(districtId: string): Promise<PricingCategoryCounts> {
  const [activeStudentCount, grouped] = await Promise.all([
    prisma.student.count({
      where: { districtId, enrollmentStatus: "ACTIVE" },
    }),
    prisma.studentPricing.groupBy({
      by: ["tier"],
      where: {
        student: { districtId, enrollmentStatus: "ACTIVE" },
      },
      _count: { _all: true },
    }),
  ]);
  const byTier = new Map<PriceTier, number>(grouped.map((row) => [row.tier, row._count._all]));
  const assigned = [...byTier.values()].reduce((sum, count) => sum + count, 0);
  return {
    activeStudentCount,
    noCostStudentCount: (byTier.get("FREE") ?? 0) + Math.max(0, activeStudentCount - assigned),
    lowerPriceStudentCount: byTier.get("REDUCED") ?? 0,
    fullPriceStudentCount: byTier.get("PAID") ?? 0,
  };
}

export async function getPricingConfigurationView(
  session: AppSession | null | undefined,
): Promise<PricingConfigurationView> {
  const staff = staffForPricing(session);
  const today = await districtToday(staff.districtId);
  const [district, current, scheduled, counts] = await Promise.all([
    prisma.district.findUniqueOrThrow({
      where: { id: staff.districtId },
      select: {
        name: true,
        identifiedStudentPercentageBps: true,
        stateAttendanceFactorBps: true,
        stateAttendanceFactorProvenance: true,
      },
    }),
    prisma.pricingConfig.findFirst({
      where: {
        districtId: staff.districtId,
        schoolId: null,
        cancelledAt: null,
        effectiveFrom: { lte: today },
      },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.pricingConfig.findFirst({
      where: {
        districtId: staff.districtId,
        schoolId: null,
        cancelledAt: null,
        effectiveFrom: { gt: today },
      },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: [{ effectiveFrom: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    districtWideCounts(staff.districtId),
  ]);

  return {
    districtName: district.name,
    current: versionView(current),
    scheduled: scheduled ? versionView(scheduled) : null,
    counts,
    compliance: {
      identifiedStudentPercentageBps: district.identifiedStudentPercentageBps,
      stateAttendanceFactorBps: district.stateAttendanceFactorBps,
      stateAttendanceFactorProvenance: district.stateAttendanceFactorProvenance,
    },
  };
}

export function listPricingConfigs(session: AppSession | null | undefined): Promise<PricingConfig[]> {
  const staff = staffForPricing(session);
  return prisma.pricingConfig.findMany({
    where: { districtId: staff.districtId },
    orderBy: [{ schoolId: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
}

export async function createPricingConfigVersion(
  session: AppSession | null | undefined,
  input: PricingConfigInput,
): Promise<PricingConfig> {
  const staff = staffForPricing(session);
  const reason = validateReason(input.reason);
  validatePriceFields(input);
  const schoolId = input.schoolId ?? null;
  const effectiveFrom = toDateOnly(input.effectiveFrom);
  const today = await districtToday(staff.districtId);
  if (effectiveFrom < today) throw new ConfigError("INVALID");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "District" WHERE id = ${staff.districtId} FOR UPDATE`;
    const before = await tx.pricingConfig.findFirst({
      where: {
        districtId: staff.districtId,
        schoolId,
        cancelledAt: null,
        effectiveFrom: { lte: effectiveFrom },
      },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    if (effectiveFrom > today) {
      const existingFuture = await tx.pricingConfig.findFirst({
        where: {
          districtId: staff.districtId,
          schoolId,
          cancelledAt: null,
          effectiveFrom: { gt: today },
        },
        select: { id: true },
      });
      if (existingFuture) throw new ConfigError("INVALID");
    }
    const data = priceFields(input);
    const after = await tx.pricingConfig.create({
      data: {
        districtId: staff.districtId,
        schoolId,
        createdByUserId: staff.userId,
        effectiveFrom,
        ...data,
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: staff.userId,
        action: "CONFIG_PRICING_VERSION_CREATE",
        subjectType: "pricingConfig",
        subjectId: after.id,
        districtId: staff.districtId,
        schoolId,
        reason,
        beforeJson: before ? { effectiveFrom: before.effectiveFrom, ...priceFields(before) } : undefined,
        afterJson: { effectiveFrom: after.effectiveFrom, ...priceFields(after) },
      },
    });
    return after;
  });
}

export async function cancelPricingConfigVersion(
  session: AppSession | null | undefined,
  pricingConfigId: string,
  reasonText: string,
): Promise<void> {
  const staff = staffForPricing(session);
  const reason = validateReason(reasonText);
  const today = await districtToday(staff.districtId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "District" WHERE id = ${staff.districtId} FOR UPDATE`;
    const before = await tx.pricingConfig.findFirst({
      where: {
        id: pricingConfigId,
        districtId: staff.districtId,
        schoolId: null,
        cancelledAt: null,
      },
    });
    if (!before || before.effectiveFrom <= today) throw new ConfigError("INVALID");
    const after = await tx.pricingConfig.update({
      where: { id: before.id },
      data: { cancelledAt: new Date(), cancelledByUserId: staff.userId },
    });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: staff.userId,
        action: "CONFIG_PRICING_VERSION_CANCEL",
        subjectType: "pricingConfig",
        subjectId: after.id,
        districtId: staff.districtId,
        reason,
        beforeJson: { effectiveFrom: before.effectiveFrom, cancelledAt: before.cancelledAt },
        afterJson: { effectiveFrom: after.effectiveFrom, cancelledAt: after.cancelledAt },
      },
    });
  });
}

export async function updateComplianceSettings(
  session: AppSession | null | undefined,
  input: ComplianceSettingsInput,
): Promise<void> {
  const staff = staffForPricing(session);
  const reason = validateReason(input.reason);
  validateBps(input.identifiedStudentPercentageBps);
  validateBps(input.stateAttendanceFactorBps);
  if (!["FNS_FEDERAL_DEFAULT", "APPROVED_LOCAL"].includes(input.stateAttendanceFactorProvenance)) {
    throw new ConfigError("INVALID");
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.district.findUniqueOrThrow({
      where: { id: staff.districtId },
      select: {
        identifiedStudentPercentageBps: true,
        stateAttendanceFactorBps: true,
        stateAttendanceFactorProvenance: true,
      },
    });
    const after = await tx.district.update({
      where: { id: staff.districtId },
      data: {
        identifiedStudentPercentageBps: input.identifiedStudentPercentageBps,
        stateAttendanceFactorBps: input.stateAttendanceFactorBps,
        stateAttendanceFactorProvenance: input.stateAttendanceFactorProvenance,
      },
      select: {
        identifiedStudentPercentageBps: true,
        stateAttendanceFactorBps: true,
        stateAttendanceFactorProvenance: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: staff.userId,
        action: "CONFIG_COMPLIANCE_SETTINGS_UPDATE",
        subjectType: "district",
        subjectId: staff.districtId,
        districtId: staff.districtId,
        reason,
        beforeJson: before as Prisma.InputJsonValue,
        afterJson: after as Prisma.InputJsonValue,
      },
    });
  });
}

export async function updatePricingConfig(
  session: AppSession | null | undefined,
  input: Omit<PricingConfigInput, "effectiveFrom" | "reason">,
): Promise<PricingConfig> {
  const staff = staffForPricing(session);
  return createPricingConfigVersion(staff, {
    ...input,
    effectiveFrom: await districtToday(staff.districtId),
    reason: "Meal prices changed.",
  });
}
