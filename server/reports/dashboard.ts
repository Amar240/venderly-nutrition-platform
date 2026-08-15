import { prisma } from "@/server/db/client";
import { reportScope } from "./scope";
import { SERVED_ONLY, OVERRIDES_ONLY } from "@/server/meals/mealCounts";
import { resolveLowBalanceThresholdCents } from "@/server/pricing/config";
import { monthRange } from "./deposits";
import { editCheckReport, type EditCheckRow } from "./editCheck";
import { districtToday } from "@/server/time/district";
import type { AppSession } from "@/server/auth/types";

/**
 * District dashboard. Meal counts (served vs overrides, D-10), deposits, and
 * adjustments for the current month, plus point-in-time low/negative-balance
 * exceptions per school. Balances are DERIVED from the ledger, never read from
 * Account.balanceCents. "Low-balance trend" is a current count in the pilot —
 * there are no historical snapshots to trend across.
 */
export interface DashboardSchoolRow {
  schoolId: string;
  schoolName: string;
  mealsServed: number;
  mealOverrides: number;
  depositsCents: number;
  adjustmentsCount: number;
  adjustmentsNetCents: number;
  lowBalanceCount: number;
  negativeBalanceCount: number;
}

export interface DistrictDashboard {
  periodLabel: string;
  schools: DashboardSchoolRow[];
  totals: Omit<DashboardSchoolRow, "schoolId" | "schoolName">;
  editCheckExceptions: EditCheckRow[];
  editCheckUnavailableMessage: string | null;
}

export async function districtDashboard(
  session: AppSession | null | undefined,
  now: Date = new Date(),
): Promise<DistrictDashboard> {
  const scope = await reportScope(session);
  const { from, to } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const today = await districtToday(scope.districtId, now);
  const editCheck = await editCheckReport(session, { from: today, to: today });

  // Derived balances for every in-scope account, in two queries.
  const accounts = await prisma.account.findMany({
    where: { student: { schoolId: { in: scope.schools.map((s) => s.id) } } },
    select: { id: true, student: { select: { schoolId: true } } },
  });
  const sums = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    where: { accountId: { in: accounts.map((a) => a.id) } },
    _sum: { amountCents: true },
  });
  const balByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amountCents ?? 0]));

  const rows: DashboardSchoolRow[] = [];
  for (const school of scope.schools) {
    const mealWhere = { schoolId: school.id, serviceDate: { gte: from, lt: to } };
    const [mealsServed, mealOverrides, ledgerByType, threshold] = await Promise.all([
      prisma.mealEvent.count({ where: { ...mealWhere, ...SERVED_ONLY } }),
      prisma.mealEvent.count({ where: { ...mealWhere, ...OVERRIDES_ONLY } }),
      prisma.ledgerEntry.groupBy({
        by: ["type"],
        where: { account: { student: { schoolId: school.id } }, createdAt: { gte: from, lt: to } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      resolveLowBalanceThresholdCents(scope.districtId, school.id),
    ]);

    const deposits = ledgerByType.find((g) => g.type === "DEPOSIT");
    const adjustments = ledgerByType.find((g) => g.type === "ADJUSTMENT");

    let lowBalanceCount = 0;
    let negativeBalanceCount = 0;
    for (const a of accounts) {
      if (a.student.schoolId !== school.id) continue;
      const bal = balByAccount.get(a.id) ?? 0;
      if (bal < 0) negativeBalanceCount++;
      else if (bal < threshold) lowBalanceCount++;
    }

    rows.push({
      schoolId: school.id,
      schoolName: school.name,
      mealsServed,
      mealOverrides,
      depositsCents: deposits?._sum.amountCents ?? 0,
      adjustmentsCount: adjustments?._count._all ?? 0,
      adjustmentsNetCents: adjustments?._sum.amountCents ?? 0,
      lowBalanceCount,
      negativeBalanceCount,
    });
  }

  const totals = rows.reduce(
    (t, r) => ({
      mealsServed: t.mealsServed + r.mealsServed,
      mealOverrides: t.mealOverrides + r.mealOverrides,
      depositsCents: t.depositsCents + r.depositsCents,
      adjustmentsCount: t.adjustmentsCount + r.adjustmentsCount,
      adjustmentsNetCents: t.adjustmentsNetCents + r.adjustmentsNetCents,
      lowBalanceCount: t.lowBalanceCount + r.lowBalanceCount,
      negativeBalanceCount: t.negativeBalanceCount + r.negativeBalanceCount,
    }),
    { mealsServed: 0, mealOverrides: 0, depositsCents: 0, adjustmentsCount: 0, adjustmentsNetCents: 0, lowBalanceCount: 0, negativeBalanceCount: 0 },
  );

  const periodLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    periodLabel,
    schools: rows,
    totals,
    editCheckExceptions:
      editCheck.status === "available"
        ? editCheck.rows.filter((row) => row.needsAttention)
        : [],
    editCheckUnavailableMessage:
      editCheck.status === "unavailable" ? editCheck.message : null,
  };
}
