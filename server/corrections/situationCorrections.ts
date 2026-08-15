import { Prisma, type CorrectionSituation, type LedgerEntry } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { AuthError } from "@/server/auth/errors";
import { canAccessSchool, requireRole } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { assertStudentInScope } from "@/server/directory/adminStudents";
import { LedgerError, recordAdjustment, recordRefund } from "@/server/ledger/ledger";
import { recordCorrectedItemCharge } from "@/server/meals/recordItemSale";
import { parseDollarsToCents } from "@/lib/utils";

type ReviewOutcome =
  | "refund"
  | "adjust"
  | "refund_and_charge"
  | "district_decision";

export type SituationChoice =
  | "CHARGED_TWICE"
  | "WRONG_STUDENT"
  | "SNACK_RETURNED"
  | "SOMETHING_ELSE"
  | "DISTRICT_DECISION";

export interface CorrectionCandidate {
  id: string;
  label: string;
  amountCents: number;
  itemName?: string;
}

export interface CorrectionFollowUp {
  id: string;
  targetName: string;
  itemName: string;
  amountCents: number;
}

export interface CorrectionPanelModel {
  snackCharges: CorrectionCandidate[];
  paymentsAndCharges: CorrectionCandidate[];
  followUps: CorrectionFollowUp[];
}

export interface CorrectionReview {
  ok: true;
  outcome: ReviewOutcome;
  lines: string[];
  confirmLabel: string;
}

export interface CorrectionFailure {
  ok: false;
  error: string;
}

export type CorrectionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const ORIGINAL_TYPES = new Set(["DEPOSIT", "MEAL_CHARGE", "ALACARTE_CHARGE"]);
const SNACK_TYPE = "ALACARTE_CHARGE";

function dollars(amountCents: number): string {
  const negative = amountCents < 0;
  const abs = Math.abs(amountCents);
  const whole = Math.floor(abs / 100).toLocaleString();
  const cents = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${whole}.${cents}`;
}

function personName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`;
}

function entryLabel(entry: LedgerEntry & { itemSale?: { item: { name: string } } | null }): string {
  const amount = dollars(Math.abs(entry.amountCents));
  const day = entry.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (entry.type === "DEPOSIT") return `Payment ${amount} from ${day}`;
  if (entry.type === "MEAL_CHARGE") return `Meal charge ${amount} from ${day}`;
  const item = entry.description || entry.itemSale?.item.name || "Snack";
  return `${item} ${amount} from ${day}`;
}

async function scopedStudent(session: AppSession | null | undefined, studentId: string) {
  const staffSession = requireRole(session, "DISTRICT_ADMIN", "SUPER_ADMIN");
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { account: true, school: { select: { name: true } } },
  });
  if (!student) throw new AuthError("FORBIDDEN_SCOPE");
  assertStudentInScope(staffSession, student);
  if (!student.account) throw new LedgerError("NO_ACCOUNT", "No account for student");
  return { session: staffSession, student };
}

async function originalForStudent(studentId: string, entryId: string) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: {
      id: entryId,
      account: { studentId },
      type: { in: Array.from(ORIGINAL_TYPES) as never[] },
    },
    include: {
      correctedBy: { select: { id: true }, take: 1 },
      itemSale: { include: { item: { select: { id: true, name: true } } } },
      correctionCaseOriginal: { select: { id: true, status: true } },
    },
  });
  if (!entry) throw new LedgerError("ENTRY_NOT_FOUND", "Original entry not found");
  if (entry.correctedBy.length > 0 || entry.correctionCaseOriginal?.status === "COMPLETED") {
    throw new LedgerError("ENTRY_NOT_FOUND", "Already corrected");
  }
  return entry;
}

function requireSnack(entry: Awaited<ReturnType<typeof originalForStudent>>) {
  if (entry.type !== SNACK_TYPE || !entry.itemSale?.item) {
    throw new LedgerError("ENTRY_NOT_FOUND", "Choose a snack charge");
  }
  return entry as typeof entry & {
    itemSale: NonNullable<typeof entry.itemSale> & { item: { id: string; name: string } };
  };
}

export async function getCorrectionPanelModel(
  session: AppSession | null | undefined,
  studentId: string,
): Promise<CorrectionPanelModel> {
  await scopedStudent(session, studentId);
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      account: { studentId },
      type: { in: Array.from(ORIGINAL_TYPES) as never[] },
      correctedBy: { none: {} },
      correctionCaseOriginal: null,
    },
    include: { itemSale: { include: { item: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const candidates = entries.map((entry) => ({
    id: entry.id,
    label: entryLabel(entry),
    amountCents: Math.abs(entry.amountCents),
    itemName: entry.itemSale?.item.name,
  }));
  const followUps = await prisma.correctionCase.findMany({
    where: { studentId, status: "FOLLOW_UP_REQUIRED", situation: "WRONG_STUDENT" },
    include: {
      targetStudent: { select: { firstName: true, lastName: true } },
      originalEntry: { include: { itemSale: { include: { item: { select: { name: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    snackCharges: candidates.filter((entry) => Boolean(entry.itemName)),
    paymentsAndCharges: candidates,
    followUps: followUps.map((caseRecord) => ({
      id: caseRecord.id,
      targetName: caseRecord.targetStudent ? personName(caseRecord.targetStudent) : "the other student",
      itemName: caseRecord.originalEntry?.itemSale?.item.name ?? "Snack",
      amountCents: Math.abs(caseRecord.originalEntry?.amountCents ?? 0),
    })),
  };
}

export interface ReviewInput {
  studentId: string;
  situation: SituationChoice;
  originalEntryId?: string;
  targetStudentNumber?: string;
  expectedAmount?: string;
  amount?: string;
  direction?: string;
}

export async function reviewSituationCorrection(
  session: AppSession | null | undefined,
  input: ReviewInput,
): Promise<CorrectionReview | CorrectionFailure> {
  try {
    const { session: staffSession, student } = await scopedStudent(session, input.studentId);
    if (input.situation === "DISTRICT_DECISION") {
      const amountCents = parseDollarsToCents(input.amount ?? "");
      if (!amountCents || amountCents <= 0) return { ok: false, error: "Enter the amount to change, then review it again." };
      const signed = input.direction === "take" ? -amountCents : amountCents;
      return {
        ok: true,
        outcome: "district_decision",
        lines: [
          `${personName(student)}'s snack money will change by ${dollars(signed)}.`,
          "This is used only when there is no payment or charge to choose.",
        ],
        confirmLabel: signed > 0 ? `Add ${dollars(signed)}` : `Take ${dollars(Math.abs(signed))}`,
      };
    }

    if (!input.originalEntryId) return { ok: false, error: "Choose the payment or charge, then review it again." };
    const original = await originalForStudent(input.studentId, input.originalEntryId);

    if (input.situation === "CHARGED_TWICE" || input.situation === "SNACK_RETURNED") {
      const snack = requireSnack(original);
      const amount = Math.abs(snack.amountCents);
      return {
        ok: true,
        outcome: "refund",
        lines: [`${dollars(amount)} will go back to ${personName(student)} for ${snack.itemSale.item.name}.`],
        confirmLabel: `Give back ${dollars(amount)}`,
      };
    }

    if (input.situation === "WRONG_STUDENT") {
      const snack = requireSnack(original);
      const targetNumber = input.targetStudentNumber?.trim();
      if (!targetNumber) return { ok: false, error: "Enter the student who should have been charged, then review it again." };
      const target = await prisma.student.findUnique({
        where: { districtId_studentNumber: { districtId: student.districtId, studentNumber: targetNumber } },
        include: { account: true },
      });
      if (!target || target.enrollmentStatus !== "ACTIVE" || !canAccessSchool(staffSession, target.schoolId)) {
        return { ok: false, error: "No student in your schools matches that number. Check the number and try again." };
      }
      if (target.id === student.id) return { ok: false, error: "Choose a different student, then review it again." };
      const amount = Math.abs(snack.amountCents);
      return {
        ok: true,
        outcome: "refund_and_charge",
        lines: [
          `${dollars(amount)} will go back to ${personName(student)} for ${snack.itemSale.item.name}.`,
          `The system will try to charge ${personName(target)} ${dollars(amount)} for the same snack.`,
        ],
        confirmLabel: `Give back ${dollars(amount)} and try the charge`,
      };
    }

    if (input.situation === "SOMETHING_ELSE") {
      const expected = parseDollarsToCents(input.expectedAmount ?? "");
      if (expected === null) return { ok: false, error: "Enter what the amount should have been, then review it again." };
      const expectedSigned = original.amountCents < 0 ? -expected : expected;
      const difference = expectedSigned - original.amountCents;
      if (difference === 0) return { ok: false, error: "That amount already matches. Choose a different payment or charge, or change the amount." };
      if (difference === -original.amountCents) {
        const amount = Math.abs(original.amountCents);
        return {
          ok: true,
          outcome: "refund",
          lines: [`${dollars(amount)} will be reversed for ${personName(student)}.`],
          confirmLabel: `Give back ${dollars(amount)}`,
        };
      }
      const verb = difference > 0 ? "go back to" : "come out of";
      return {
        ok: true,
        outcome: "adjust",
        lines: [`${dollars(Math.abs(difference))} will ${verb} ${personName(student)}'s snack money.`],
        confirmLabel: difference > 0 ? `Give back ${dollars(difference)}` : `Take ${dollars(Math.abs(difference))}`,
      };
    }

    return { ok: false, error: "Choose what happened, then review it again." };
  } catch (err) {
    return mapCorrectionError(err);
  }
}

function situationReason(situation: SituationChoice): string {
  const reasons: Record<SituationChoice, string> = {
    CHARGED_TWICE: "Charged twice for a snack",
    WRONG_STUDENT: "Wrong student charged",
    SNACK_RETURNED: "Snack was returned",
    SOMETHING_ELSE: "Corrected amount after review",
    DISTRICT_DECISION: "District decision to change snack money",
  };
  return reasons[situation];
}

async function createOrGetCase(input: {
  situation: CorrectionSituation;
  studentId: string;
  originalEntryId: string | null;
  targetStudentId?: string | null;
  expectedAmountCents?: number | null;
  reason: string;
  actorId: string;
}) {
  if (input.originalEntryId) {
    const existing = await prisma.correctionCase.findUnique({
      where: { originalEntryId: input.originalEntryId },
    });
    if (existing) return existing;
  }
  let created;
  try {
    created = await prisma.correctionCase.create({
      data: {
        situation: input.situation,
        studentId: input.studentId,
        originalEntryId: input.originalEntryId,
        targetStudentId: input.targetStudentId ?? null,
        expectedAmountCents: input.expectedAmountCents ?? null,
        reason: input.reason,
        actorId: input.actorId,
      },
    });
  } catch (err) {
    if (
      input.originalEntryId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.correctionCase.findUnique({
        where: { originalEntryId: input.originalEntryId },
      });
      if (existing) return existing;
    }
    throw err;
  }
  await writeAudit({
    actorType: "USER",
    actorId: input.actorId,
    action: "CORRECTION_CASE_CREATED",
    subjectType: "student",
    subjectId: input.studentId,
    reason: input.reason,
    after: {
      caseId: created.id,
      situation: input.situation,
      originalEntryId: input.originalEntryId,
      targetStudentId: input.targetStudentId ?? null,
    } as Prisma.InputJsonObject,
  });
  return created;
}

async function completeCase(caseId: string, actorId: string, data: Prisma.CorrectionCaseUpdateInput = {}) {
  return prisma.correctionCase.update({
    where: { id: caseId },
    data: {
      ...data,
      status: "COMPLETED",
      completedAt: new Date(),
      completedBy: { connect: { id: actorId } },
    },
  });
}

export async function commitSituationCorrection(
  session: AppSession | null | undefined,
  input: ReviewInput & { reason?: string },
): Promise<CorrectionResult> {
  const reason = input.reason?.trim() || situationReason(input.situation);
  try {
    const { session: staffSession, student } = await scopedStudent(session, input.studentId);
    if (staffSession.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");

    if (input.situation === "DISTRICT_DECISION") {
      const amountCents = parseDollarsToCents(input.amount ?? "");
      if (!amountCents || amountCents <= 0) return { ok: false, error: "Enter the amount to change, then try again." };
      const signed = input.direction === "take" ? -amountCents : amountCents;
      const entry = await recordAdjustment({
        accountId: student.account!.id,
        amountCents: signed,
        reason,
        actor: { kind: "staff", session: staffSession },
      });
      await prisma.correctionCase.create({
        data: {
          situation: "DISTRICT_DECISION",
          status: "COMPLETED",
          studentId: student.id,
          reason,
          actorId: staffSession.userId,
          adjustmentEntryId: entry.id,
          completedAt: new Date(),
          completedByUserId: staffSession.userId,
        },
      });
      return { ok: true, message: "Snack money was changed and kept with your name and the reason." };
    }

    if (!input.originalEntryId) return { ok: false, error: "Choose the payment or charge, then try again." };
    const original = await originalForStudent(input.studentId, input.originalEntryId);

    if (input.situation === "CHARGED_TWICE" || input.situation === "SNACK_RETURNED") {
      requireSnack(original);
      const caseRecord = await createOrGetCase({
        situation: input.situation,
        studentId: student.id,
        originalEntryId: original.id,
        reason,
        actorId: staffSession.userId,
      });
      if (!caseRecord.refundEntryId) {
        const refund = await recordRefund({
          originalEntryId: original.id,
          reason,
          actor: { kind: "staff", session: staffSession },
          idempotencyKey: `corr:${caseRecord.id}:refund`,
        });
        await completeCase(caseRecord.id, staffSession.userId, { refundEntry: { connect: { id: refund.id } } });
      }
      return { ok: true, message: `${dollars(Math.abs(original.amountCents))} was given back and kept with your name and the reason.` };
    }

    if (input.situation === "SOMETHING_ELSE") {
      const expected = parseDollarsToCents(input.expectedAmount ?? "");
      if (expected === null) return { ok: false, error: "Enter what the amount should have been, then try again." };
      const expectedSigned = original.amountCents < 0 ? -expected : expected;
      const difference = expectedSigned - original.amountCents;
      if (difference === 0) return { ok: false, error: "That amount already matches. Choose a different payment or charge, or change the amount." };
      const caseRecord = await createOrGetCase({
        situation: "SOMETHING_ELSE",
        studentId: student.id,
        originalEntryId: original.id,
        expectedAmountCents: expected,
        reason,
        actorId: staffSession.userId,
      });
      if (difference === -original.amountCents) {
        if (!caseRecord.refundEntryId) {
          const refund = await recordRefund({
            originalEntryId: original.id,
            reason,
            actor: { kind: "staff", session: staffSession },
            idempotencyKey: `corr:${caseRecord.id}:refund`,
          });
          await completeCase(caseRecord.id, staffSession.userId, { refundEntry: { connect: { id: refund.id } } });
        }
        return { ok: true, message: "The amount was given back and kept with your name and the reason." };
      }
      if (!caseRecord.adjustmentEntryId) {
        const adjustment = await recordAdjustment({
          originalEntryId: original.id,
          amountCents: difference,
          reason,
          actor: { kind: "staff", session: staffSession },
          idempotencyKey: `corr:${caseRecord.id}:adjust`,
        });
        await completeCase(caseRecord.id, staffSession.userId, { adjustmentEntry: { connect: { id: adjustment.id } } });
      }
      return { ok: true, message: "Snack money was corrected and kept with your name and the reason." };
    }

    if (input.situation === "WRONG_STUDENT") {
      const snack = requireSnack(original);
      const targetNumber = input.targetStudentNumber?.trim();
      if (!targetNumber) return { ok: false, error: "Enter the student who should have been charged, then try again." };
      const target = await prisma.student.findUnique({
        where: { districtId_studentNumber: { districtId: student.districtId, studentNumber: targetNumber } },
        include: { account: true },
      });
      if (!target || target.enrollmentStatus !== "ACTIVE" || !target.account || !canAccessSchool(staffSession, target.schoolId)) {
        return { ok: false, error: "No student in your schools matches that number. Check the number and try again." };
      }
      if (target.id === student.id) return { ok: false, error: "Choose a different student, then try again." };

      const caseRecord = await createOrGetCase({
        situation: "WRONG_STUDENT",
        studentId: student.id,
        originalEntryId: original.id,
        targetStudentId: target.id,
        reason,
        actorId: staffSession.userId,
      });
      let refundEntryId = caseRecord.refundEntryId;
      if (!refundEntryId) {
        const refund = await recordRefund({
          originalEntryId: original.id,
          reason,
          actor: { kind: "staff", session: staffSession },
          idempotencyKey: `corr:${caseRecord.id}:refund`,
        });
        refundEntryId = refund.id;
        await prisma.correctionCase.update({
          where: { id: caseRecord.id },
          data: { refundEntryId },
        });
      }

      if (!caseRecord.chargeEntryId) {
        const charge = await recordCorrectedItemCharge({
          studentId: target.id,
          itemId: snack.itemSale.item.id,
          priceCents: snack.itemSale.priceCentsAtSale,
          originalEntryId: original.id,
          reason,
          idempotencyKey: `corr:${caseRecord.id}:charge`,
          session: staffSession,
        });
        if (charge.status === "insufficient_balance") {
          await prisma.correctionCase.update({
            where: { id: caseRecord.id },
            data: { status: "FOLLOW_UP_REQUIRED", refundEntryId, targetStudentId: target.id },
          });
          await writeAudit({
            actorType: "USER",
            actorId: staffSession.userId,
            action: "CORRECTION_FOLLOW_UP_REQUIRED",
            subjectType: "student",
            subjectId: student.id,
            districtId: staffSession.districtId,
            reason,
            after: { caseId: caseRecord.id, targetStudentId: target.id, amountCents: snack.itemSale.priceCentsAtSale },
          });
          return {
            ok: true,
            message: `${dollars(snack.itemSale.priceCentsAtSale)} was given back. The other student was not charged because there is not enough snack money.`,
          };
        }
        if (charge.status !== "recorded") return { ok: false, error: "The other student could not be charged. Check the student and try again." };
        await completeCase(caseRecord.id, staffSession.userId, {
          refundEntry: { connect: { id: refundEntryId! } },
          chargeEntry: { connect: { id: charge.ledgerEntryId } },
          targetStudent: { connect: { id: target.id } },
        });
      }
      return { ok: true, message: `${dollars(snack.itemSale.priceCentsAtSale)} was given back and the other student was charged.` };
    }

    return { ok: false, error: "Choose what happened, then try again." };
  } catch (err) {
    return mapCorrectionError(err);
  }
}

export async function completeWrongStudentFollowUp(
  session: AppSession | null | undefined,
  caseId: string,
): Promise<CorrectionResult> {
  try {
    const staffSession = requireRole(session, "DISTRICT_ADMIN", "SUPER_ADMIN");
    if (staffSession.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
    const caseRecord = await prisma.correctionCase.findUnique({
      where: { id: caseId },
      include: {
        student: true,
        targetStudent: { include: { account: true } },
        originalEntry: { include: { itemSale: { include: { item: true } } } },
      },
    });
    if (!caseRecord || caseRecord.status !== "FOLLOW_UP_REQUIRED") {
      return { ok: false, error: "That follow-up is no longer waiting. Refresh the page and check the record." };
    }
    assertStudentInScope(staffSession, caseRecord.student);
    if (!caseRecord.targetStudent || !caseRecord.originalEntry?.itemSale?.item) {
      return { ok: false, error: "That follow-up is missing details. Ask a district administrator to review it." };
    }
    assertStudentInScope(staffSession, caseRecord.targetStudent);
    const charge = await recordCorrectedItemCharge({
      studentId: caseRecord.targetStudent.id,
      itemId: caseRecord.originalEntry.itemSale.item.id,
      priceCents: caseRecord.originalEntry.itemSale.priceCentsAtSale,
      originalEntryId: caseRecord.originalEntry.id,
      reason: caseRecord.reason,
      idempotencyKey: `corr:${caseRecord.id}:charge`,
      session: staffSession,
    });
    if (charge.status === "insufficient_balance") {
      return { ok: false, error: "There is still not enough snack money. Add money first, then try again." };
    }
    if (charge.status !== "recorded") return { ok: false, error: "The charge could not be recorded. Check the student and try again." };
    await completeCase(caseRecord.id, staffSession.userId, {
      chargeEntry: { connect: { id: charge.ledgerEntryId } },
    });
    await writeAudit({
      actorType: "USER",
      actorId: staffSession.userId,
      action: "CORRECTION_FOLLOW_UP_COMPLETED",
      subjectType: "student",
      subjectId: caseRecord.studentId,
      districtId: staffSession.districtId,
      reason: caseRecord.reason,
      after: { caseId: caseRecord.id, chargeEntryId: charge.ledgerEntryId },
    });
    return { ok: true, message: "The waiting charge was recorded and kept with your name and the reason." };
  } catch (err) {
    return mapCorrectionError(err);
  }
}

function mapCorrectionError(err: unknown): CorrectionFailure {
  if (err instanceof AuthError) {
    return { ok: false, error: "You don't have access to that. Ask a district administrator if you need it." };
  }
  if (err instanceof LedgerError) {
    if (err.code === "INSUFFICIENT_FUNDS") return { ok: false, error: "There is not enough snack money. Add money first, then try again." };
    if (err.code === "REASON_REQUIRED") return { ok: false, error: "Add the reason this is being fixed, then try again." };
    return { ok: false, error: "That choice could not be fixed. Refresh the page and try again." };
  }
  throw err;
}
