import { prisma } from "@/server/db/client";
import { AuthError } from "@/server/auth/errors";
import { requireGuardianOf } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";
import { resolveLowBalanceThresholdCents } from "@/server/pricing/config";
import { getLedgerHistory } from "@/server/ledger/ledger";
import { classifyBalance, type BalanceStatus } from "./balance";
import type { LedgerEntry } from "@prisma/client";

/**
 * Guardian read-models. Every student access is routed through
 * `requireGuardianOf` or a query joined on GuardianStudent — there is no open
 * student lookup for guardians (CLAUDE.md rule 7). Nothing here reads or returns
 * a price tier (D-1).
 */

function guardianId(session: AppSession | null | undefined): string {
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (session.principalType !== "guardian") throw new AuthError("FORBIDDEN_ROLE");
  return session.guardianId;
}

export interface HouseholdChild {
  linkId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  schoolName: string;
  balanceCents: number;
  status: BalanceStatus;
}

/** The guardian's linked children with balances + server-computed status. */
export async function getHousehold(
  session: AppSession | null | undefined,
): Promise<HouseholdChild[]> {
  const gid = guardianId(session);
  const links = await prisma.guardianStudent.findMany({
    where: { guardianId: gid },
    include: { student: { include: { account: true, school: true } } },
    orderBy: { student: { lastName: "asc" } },
  });

  const thresholdCache = new Map<string, number>();
  return Promise.all(
    links.map(async ({ id, student }) => {
      const balanceCents = student.account?.balanceCents ?? 0;
      let threshold = thresholdCache.get(student.schoolId);
      if (threshold === undefined) {
        threshold = await resolveLowBalanceThresholdCents(student.districtId, student.schoolId);
        thresholdCache.set(student.schoolId, threshold);
      }
      return {
        linkId: id,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        schoolName: student.school.name,
        balanceCents,
        status: classifyBalance(balanceCents, threshold),
      };
    }),
  );
}

export interface ChildDetail {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  schoolName: string;
  accountId: string;
  balanceCents: number;
  status: BalanceStatus;
  history: LedgerEntry[];
}

/** One child's detail + full ledger history, guarded by the household link. */
export async function getChildDetail(
  session: AppSession | null | undefined,
  studentId: string,
): Promise<ChildDetail | null> {
  await requireGuardianOf(session, studentId); // throws if not linked
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { account: true, school: true },
  });
  if (!student || !student.account) return null;

  const threshold = await resolveLowBalanceThresholdCents(student.districtId, student.schoolId);
  const history = await getLedgerHistory(student.account.id);
  return {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    grade: student.grade,
    schoolName: student.school.name,
    accountId: student.account.id,
    balanceCents: student.account.balanceCents,
    status: classifyBalance(student.account.balanceCents, threshold),
    history,
  };
}

export interface ReceiptView {
  intentId: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  totalCents: number;
  lines: { studentName: string; amountCents: number }[];
}

/**
 * The intent behind a return/receipt page, scoped to the viewing guardian.
 * Reads status only — it NEVER credits anything. Returns null if the intent
 * isn't the guardian's (the page renders notFound).
 */
export async function getReceiptForGuardian(
  session: AppSession | null | undefined,
  intentId: string,
): Promise<ReceiptView | null> {
  const gid = guardianId(session);
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: intentId },
    include: { allocations: { include: { student: true } } },
  });
  if (!intent || intent.guardianId !== gid) return null;
  return {
    intentId: intent.id,
    status: intent.status,
    totalCents: intent.totalCents,
    lines: intent.allocations.map((a) => ({
      studentName: `${a.student.firstName} ${a.student.lastName}`,
      amountCents: a.amountCents,
    })),
  };
}
