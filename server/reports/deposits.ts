import { prisma } from "@/server/db/client";
import { reportScope } from "./scope";
import type { AppSession } from "@/server/auth/types";

/**
 * Monthly deposits per school. Every figure is aggregated from the LEDGER
 * (never Account.balanceCents). Columns: deposits, transfers (net), refunds +
 * adjustments, and the net total of all activity. Scoped to the session.
 */
export interface MonthlyDepositsRow {
  schoolId: string;
  schoolName: string;
  depositsCents: number;
  transfersCents: number;
  refundsAdjustmentsCents: number;
  totalCents: number;
}

/** UTC month range [first, nextFirst). month is 1-12. */
export function monthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

export async function monthlyDeposits(
  session: AppSession | null | undefined,
  period: { year: number; month: number },
): Promise<MonthlyDepositsRow[]> {
  const scope = await reportScope(session);
  const { from, to } = monthRange(period.year, period.month);
  const rows: MonthlyDepositsRow[] = [];

  for (const school of scope.schools) {
    const grouped = await prisma.ledgerEntry.groupBy({
      by: ["type"],
      where: {
        account: { student: { schoolId: school.id } },
        createdAt: { gte: from, lt: to },
      },
      _sum: { amountCents: true },
    });
    const sumOf = (...types: string[]) =>
      grouped.filter((g) => types.includes(g.type)).reduce((n, g) => n + (g._sum.amountCents ?? 0), 0);

    rows.push({
      schoolId: school.id,
      schoolName: school.name,
      depositsCents: sumOf("DEPOSIT"),
      transfersCents: sumOf("TRANSFER_DEBIT", "TRANSFER_CREDIT"),
      refundsAdjustmentsCents: sumOf("REFUND", "ADJUSTMENT", "CORRECTION"),
      totalCents: grouped.reduce((n, g) => n + (g._sum.amountCents ?? 0), 0),
    });
  }
  return rows;
}
