import { prisma } from "@/server/db/client";
import type { AppSession } from "@/server/auth/types";
import type { CorrectionCaseStatus, CorrectionSituation } from "@prisma/client";
import { reportScope } from "./scope";

export interface CorrectionPeriodRow {
  id: string;
  situation: CorrectionSituation;
  status: CorrectionCaseStatus;
  reason: string;
  createdAt: Date;
  completedAt: Date | null;
  studentName: string;
  targetStudentName: string | null;
  actorName: string | null;
  completedByName: string | null;
}

/**
 * Corrections made in a date range, scoped to the staff session's schools —
 * the "corrections made in the period with reasons and actors" section of
 * the claim pack. Reads CorrectionCase directly (reason/actorId are already
 * first-class columns there); no new correction logic.
 */
export async function correctionsInPeriod(
  session: AppSession | null | undefined,
  range: { from: Date; to: Date },
): Promise<CorrectionPeriodRow[]> {
  const scope = await reportScope(session);
  const schoolIds = scope.schools.map((school) => school.id);

  const cases = await prisma.correctionCase.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      student: { schoolId: { in: schoolIds } },
    },
    include: {
      student: { select: { firstName: true, lastName: true } },
      targetStudent: { select: { firstName: true, lastName: true } },
      actor: { select: { firstName: true, lastName: true } },
      completedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return cases.map((c) => ({
    id: c.id,
    situation: c.situation,
    status: c.status,
    reason: c.reason,
    createdAt: c.createdAt,
    completedAt: c.completedAt,
    studentName: `${c.student.firstName} ${c.student.lastName}`,
    targetStudentName: c.targetStudent ? `${c.targetStudent.firstName} ${c.targetStudent.lastName}` : null,
    actorName: c.actor ? `${c.actor.firstName} ${c.actor.lastName}` : null,
    completedByName: c.completedBy ? `${c.completedBy.firstName} ${c.completedBy.lastName}` : null,
  }));
}
