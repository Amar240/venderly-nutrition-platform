import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireGuardianOf } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";
import { writeAudit } from "@/server/audit/log";
import { deriveBalanceCents } from "@/server/ledger/ledger";
import { paymentPort } from "@/server/ports/payment";
import {
  notifyAutomaticTopUpCompleted,
  notifyAutomaticTopUpSkipped,
} from "@/server/notifications/service";
import { districtDateOnly } from "@/server/time/district";
import { automaticTopUpSchema, type AutomaticTopUpInput } from "./schemas";

function guardianId(session: AppSession | null | undefined): string {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (session.principalType !== "guardian") throw new AuthError("FORBIDDEN_ROLE");
  return session.guardianId;
}

function districtMonthRange(timeZone: string, now = new Date()) {
  const today = districtDateOnly(timeZone, now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 1)),
  };
}

export interface AutomaticTopUpRuleView {
  id: string;
  studentId: string;
  studentName: string;
  triggerBalanceCents: number;
  topUpAmountCents: number;
  monthlyCeilingCents: number;
}

export async function getAutomaticTopUpRules(
  session: AppSession | null | undefined,
): Promise<AutomaticTopUpRuleView[]> {
  const gid = guardianId(session);
  const rules = await prisma.automaticTopUpRule.findMany({
    where: {
      guardianId: gid,
      active: true,
      student: { guardianLinks: { some: { guardianId: gid } } },
    },
    include: { student: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rules.map((rule) => ({
    id: rule.id,
    studentId: rule.studentId,
    studentName: `${rule.student.firstName} ${rule.student.lastName}`,
    triggerBalanceCents: rule.triggerBalanceCents,
    topUpAmountCents: rule.topUpAmountCents,
    monthlyCeilingCents: rule.monthlyCeilingCents,
  }));
}

export class AutomaticTopUpError extends Error {
  constructor(
    public code: "INVALID_INPUT" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AutomaticTopUpError";
  }
}

export async function saveAutomaticTopUpRule(
  session: AppSession | null | undefined,
  input: AutomaticTopUpInput,
) {
  const gid = guardianId(session);
  const parsed = automaticTopUpSchema.safeParse(input);
  if (!parsed.success) {
    throw new AutomaticTopUpError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Check the automatic top-up details.",
    );
  }
  await requireGuardianOf(session, parsed.data.studentId);

  const before = await prisma.automaticTopUpRule.findFirst({
    where: { guardianId: gid, studentId: parsed.data.studentId, active: true },
  });

  try {
    const rule = before
      ? await prisma.automaticTopUpRule.update({
          where: { id: before.id },
          data: {
            triggerBalanceCents: parsed.data.triggerBalanceCents,
            topUpAmountCents: parsed.data.topUpAmountCents,
            monthlyCeilingCents: parsed.data.monthlyCeilingCents,
          },
        })
      : await prisma.automaticTopUpRule.create({
          data: {
            guardianId: gid,
            studentId: parsed.data.studentId,
            triggerBalanceCents: parsed.data.triggerBalanceCents,
            topUpAmountCents: parsed.data.topUpAmountCents,
            monthlyCeilingCents: parsed.data.monthlyCeilingCents,
          },
        });

    await writeAudit({
      actorType: "GUARDIAN",
      actorId: gid,
      action: before ? "AUTO_TOP_UP_RULE_UPDATED" : "AUTO_TOP_UP_RULE_CREATED",
      subjectType: "student",
      subjectId: parsed.data.studentId,
      before: before
        ? {
            triggerBalanceCents: before.triggerBalanceCents,
            topUpAmountCents: before.topUpAmountCents,
            monthlyCeilingCents: before.monthlyCeilingCents,
          }
        : null,
      after: {
        ruleId: rule.id,
        triggerBalanceCents: rule.triggerBalanceCents,
        topUpAmountCents: rule.topUpAmountCents,
        monthlyCeilingCents: rule.monthlyCeilingCents,
      },
    });
    return rule;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.automaticTopUpRule.findFirstOrThrow({
        where: { guardianId: gid, studentId: parsed.data.studentId, active: true },
      });
      return prisma.automaticTopUpRule.update({
        where: { id: existing.id },
        data: {
          triggerBalanceCents: parsed.data.triggerBalanceCents,
          topUpAmountCents: parsed.data.topUpAmountCents,
          monthlyCeilingCents: parsed.data.monthlyCeilingCents,
        },
      });
    }
    throw error;
  }
}

export async function cancelAutomaticTopUpRule(
  session: AppSession | null | undefined,
  ruleId: string,
) {
  const gid = guardianId(session);
  const rule = await prisma.automaticTopUpRule.findFirst({
    where: {
      id: ruleId,
      guardianId: gid,
      active: true,
      student: { guardianLinks: { some: { guardianId: gid } } },
    },
  });
  if (!rule) throw new AutomaticTopUpError("NOT_FOUND", "Automatic top-up was not found.");

  const updated = await prisma.automaticTopUpRule.update({
    where: { id: rule.id },
    data: { active: false, cancelledAt: new Date() },
  });
  await writeAudit({
    actorType: "GUARDIAN",
    actorId: gid,
    action: "AUTO_TOP_UP_RULE_CANCELLED",
    subjectType: "student",
    subjectId: rule.studentId,
    before: {
      ruleId: rule.id,
      triggerBalanceCents: rule.triggerBalanceCents,
      topUpAmountCents: rule.topUpAmountCents,
      monthlyCeilingCents: rule.monthlyCeilingCents,
    },
    after: { active: false, cancelledAt: updated.cancelledAt?.toISOString() },
  });
  return updated;
}

interface PreparedRun {
  kind: "settle";
  runId: string;
  intentId: string;
  guardianId: string;
  studentId: string;
  amountCents: number;
}

interface SkippedRun {
  kind: "skipped";
  runId: string;
  guardianId: string;
  studentId: string;
  amountCents: number;
  ceilingCents: number;
}

type PrepareResult = PreparedRun | SkippedRun | { kind: "noop" };

async function prepareAutomaticTopUpRun(input: {
  ruleId: string;
  triggeringLedgerEntryId: string;
  balanceAfterCents: number;
}): Promise<PrepareResult> {
  const idempotencyKey = `atu:${input.ruleId}:${input.triggeringLedgerEntryId}`;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AutomaticTopUpRule" WHERE id = ${input.ruleId} FOR UPDATE`;

    const existing = await tx.automaticTopUpRun.findUnique({
      where: { idempotencyKey },
      include: { paymentIntent: true, rule: true },
    });
    if (existing) {
      if (existing.status === "PENDING" && existing.paymentIntent) {
        return {
          kind: "settle",
          runId: existing.id,
          intentId: existing.paymentIntent.id,
          guardianId: existing.rule.guardianId,
          studentId: existing.rule.studentId,
          amountCents: existing.amountCents,
        };
      }
      return { kind: "noop" };
    }

    const rule = await tx.automaticTopUpRule.findUnique({
      where: { id: input.ruleId },
      include: {
        student: { include: { district: { select: { timeZone: true } } } },
      },
    });
    if (!rule || !rule.active) return { kind: "noop" };

    const link = await tx.guardianStudent.findUnique({
      where: {
        guardianId_studentId: {
          guardianId: rule.guardianId,
          studentId: rule.studentId,
        },
      },
      select: { id: true },
    });
    if (!link) return { kind: "noop" };

    const { from, to } = districtMonthRange(rule.student.district.timeZone);
    const used = await tx.automaticTopUpRun.aggregate({
      where: {
        ruleId: rule.id,
        status: { in: ["PENDING", "COMPLETED"] },
        createdAt: { gte: from, lt: to },
      },
      _sum: { amountCents: true },
    });
    const usedCents = used._sum.amountCents ?? 0;

    if (usedCents + rule.topUpAmountCents > rule.monthlyCeilingCents) {
      const run = await tx.automaticTopUpRun.create({
        data: {
          ruleId: rule.id,
          triggeringLedgerEntryId: input.triggeringLedgerEntryId,
          idempotencyKey,
          status: "SKIPPED_CEILING",
          balanceAfterCents: input.balanceAfterCents,
          amountCents: rule.topUpAmountCents,
          ceilingCents: rule.monthlyCeilingCents,
          skippedReason: "monthly_ceiling_reached",
          completedAt: new Date(),
        },
      });
      return {
        kind: "skipped",
        runId: run.id,
        guardianId: rule.guardianId,
        studentId: rule.studentId,
        amountCents: rule.topUpAmountCents,
        ceilingCents: rule.monthlyCeilingCents,
      };
    }

    const run = await tx.automaticTopUpRun.create({
      data: {
        ruleId: rule.id,
        triggeringLedgerEntryId: input.triggeringLedgerEntryId,
        idempotencyKey,
        status: "PENDING",
        balanceAfterCents: input.balanceAfterCents,
        amountCents: rule.topUpAmountCents,
        ceilingCents: rule.monthlyCeilingCents,
      },
    });
    const intent = await tx.paymentIntent.create({
      data: {
        guardianId: rule.guardianId,
        totalCents: rule.topUpAmountCents,
        automaticTopUpRunId: run.id,
        allocations: {
          create: [{ studentId: rule.studentId, amountCents: rule.topUpAmountCents }],
        },
      },
    });
    return {
      kind: "settle",
      runId: run.id,
      intentId: intent.id,
      guardianId: rule.guardianId,
      studentId: rule.studentId,
      amountCents: rule.topUpAmountCents,
    };
  });
}

async function settlePreparedRun(run: PreparedRun) {
  const eventId = `evt_auto_${run.runId}`;
  try {
    const settlement = await paymentPort.settle({ intentId: run.intentId, eventId });
    const deposit = await prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: `${eventId}:${run.studentId}` },
      select: { id: true },
    });
    await prisma.automaticTopUpRun.update({
      where: { id: run.runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        depositLedgerEntryId: deposit?.id ?? null,
      },
    });
    if (!settlement.alreadySettled) {
      await writeAudit({
        actorType: "SYSTEM",
        action: "AUTO_TOP_UP_COMPLETED",
        subjectType: "student",
        subjectId: run.studentId,
        after: {
          runId: run.runId,
          paymentIntentId: run.intentId,
          amountCents: run.amountCents,
        },
      });
      await notifyAutomaticTopUpCompleted({
        guardianId: run.guardianId,
        studentId: run.studentId,
        amountCents: run.amountCents,
      });
    }
  } catch (error) {
    await prisma.automaticTopUpRun.update({
      where: { id: run.runId },
      data: { status: "FAILED", completedAt: new Date(), skippedReason: "payment_settlement_failed" },
    });
    throw error;
  }
}

async function finishSkippedRun(run: SkippedRun) {
  await writeAudit({
    actorType: "SYSTEM",
    action: "AUTO_TOP_UP_SKIPPED",
    subjectType: "student",
    subjectId: run.studentId,
    after: {
      runId: run.runId,
      amountCents: run.amountCents,
      ceilingCents: run.ceilingCents,
      reason: "monthly_ceiling_reached",
    },
  });
  await notifyAutomaticTopUpSkipped({
    guardianId: run.guardianId,
    studentId: run.studentId,
    amountCents: run.amountCents,
    ceilingCents: run.ceilingCents,
  });
}

export async function triggerAutomaticTopUpsForDebit(input: {
  studentId: string;
  debitCents: number;
  triggeringLedgerEntryId: string | null | undefined;
}): Promise<void> {
  if (input.debitCents <= 0 || !input.triggeringLedgerEntryId) return;

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    include: {
      account: true,
      autoTopUpRules: { where: { active: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!student?.account || student.autoTopUpRules.length === 0) return;

  const after = await deriveBalanceCents(student.account.id);
  const before = after + input.debitCents;
  const crossingRules = student.autoTopUpRules.filter(
    (rule) => before >= rule.triggerBalanceCents && after < rule.triggerBalanceCents,
  );

  for (const rule of crossingRules) {
    const prepared = await prepareAutomaticTopUpRun({
      ruleId: rule.id,
      triggeringLedgerEntryId: input.triggeringLedgerEntryId,
      balanceAfterCents: after,
    });
    if (prepared.kind === "settle") {
      await settlePreparedRun(prepared);
    } else if (prepared.kind === "skipped") {
      await finishSkippedRun(prepared);
    }
  }
}
