import { AuthError } from "@/server/auth/errors";
import { reportScope } from "./scope";
import { formatCents } from "@/lib/utils";
import { PROTOTYPE_BANNER_TEXT } from "@/lib/prototype";
import { getMoneyHistoryForExport } from "@/server/ledger/moneyHistory";
import type { AppSession } from "@/server/auth/types";

/**
 * Money-history listing + download. Scoped to the session's schools; a requested
 * school outside scope is rejected. NO pricing tier is queried or emitted.
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
  activity: string;
  amountCents: number;
  connection: string | null;
  reason: string | null;
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

  const rows = await getMoneyHistoryForExport({
    account: { student: { schoolId: { in: schoolIds } } },
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  }, { visibleSchoolIds: schoolIds });

  return rows.map((row) => ({
    createdAt: row.createdAt,
    studentNumber: row.studentNumber,
    studentName: row.studentName,
    schoolName: row.schoolName,
    activity: row.activity,
    amountCents: row.amountCents,
    connection: row.connection,
    reason: row.reason,
  }));
}

function csvCell(value: string): string {
  // Quote and escape; guard against CSV/formula injection.
  const needsGuard = /^[=+\-@]/.test(value);
  const safe = needsGuard ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function transactionsToCsv(rows: TransactionRow[]): string {
  const header = ["Date", "Student number", "Student name", "School", "Activity", "Amount", "Connection", "Reason"];
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
        r.activity,
        formatCents(r.amountCents),
        r.connection ?? "",
        r.reason ?? "",
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}
