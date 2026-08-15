import { prisma } from "@/server/db/client";
import { AuthError } from "@/server/auth/errors";
import { reportScope } from "./scope";
import { formatCents } from "@/lib/utils";
import { PROTOTYPE_BANNER_TEXT } from "@/lib/prototype";
import { moneyActivityLabel } from "@/lib/presentation-labels";
import type { AppSession } from "@/server/auth/types";

/**
 * Transaction listing + CSV export. Scoped to the session's schools; a requested
 * school outside scope is rejected. NO pricing tier is queried or emitted — the
 * columns are date, student number, name, school, type, amount, description.
 */
export interface TransactionFilters {
  schoolId?: string;
  from?: Date;
  to?: Date;
}

export interface TransactionRow {
  createdAt: Date;
  studentNumber: string;
  studentName: string;
  schoolName: string;
  type: string;
  amountCents: number;
  description: string;
}

export async function listTransactions(
  session: AppSession | null | undefined,
  filters: TransactionFilters,
): Promise<TransactionRow[]> {
  const scope = await reportScope(session);
  const scopeIds = scope.schools.map((s) => s.id);
  let schoolIds = scopeIds;
  if (filters.schoolId) {
    if (!scopeIds.includes(filters.schoolId)) throw new AuthError("FORBIDDEN_SCOPE");
    schoolIds = [filters.schoolId];
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      account: { student: { schoolId: { in: schoolIds } } },
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    select: {
      createdAt: true,
      type: true,
      amountCents: true,
      description: true,
      account: {
        select: {
          student: {
            select: { studentNumber: true, firstName: true, lastName: true, school: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  return entries.map((e) => ({
    createdAt: e.createdAt,
    studentNumber: e.account.student.studentNumber,
    studentName: `${e.account.student.firstName} ${e.account.student.lastName}`,
    schoolName: e.account.student.school.name,
    type: e.type,
    amountCents: e.amountCents,
    description: e.description,
  }));
}

function csvCell(value: string): string {
  // Quote and escape; guard against CSV/formula injection.
  const needsGuard = /^[=+\-@]/.test(value);
  const safe = needsGuard ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function transactionsToCsv(rows: TransactionRow[]): string {
  const header = ["Date", "Student number", "Student name", "School", "Type", "Amount", "Description"];
  const lines = [
    ["Prototype notice", PROTOTYPE_BANNER_TEXT].map(csvCell).join(","),
    "",
    header.map(csvCell).join(","),
  ];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.studentNumber,
        r.studentName,
        r.schoolName,
        moneyActivityLabel(r.type),
        formatCents(r.amountCents),
        r.description,
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}
