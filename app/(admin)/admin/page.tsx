import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { districtDashboard } from "@/server/reports/dashboard";
import { MoneyDisplay } from "@/components/ui/money";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/icons";
import { LinkButton } from "@/components/ui/link-button";

function mealWords(mealType: "BREAKFAST" | "LUNCH", count: number) {
  const singular = mealType === "BREAKFAST" ? "breakfast" : "lunch";
  if (count === 1) return singular;
  return mealType === "BREAKFAST" ? "breakfasts" : "lunches";
}

/**
 * District dashboard. Meal counts (served vs overrides, kept separate per D-10),
 * deposits, adjustments, and low/negative-balance exceptions per school — all
 * derived from the ledger, scoped to the session. No eligibility / tier.
 */
export default async function AdminDashboardPage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return null;
  const dash = await districtDashboard(session);
  const t = dash.totals;

  const stats: { label: string; value: React.ReactNode }[] = [
    { label: "Meals served", value: t.mealsServed.toLocaleString() },
    { label: "Extra meals", value: t.mealOverrides.toLocaleString() },
    { label: "Money added", value: <MoneyDisplay amountCents={t.depositsCents} /> },
    { label: "Mistakes fixed", value: `${t.adjustmentsCount}` },
    { label: "Money low", value: t.lowBalanceCount.toLocaleString() },
    {
      label: "Money owed",
      value: t.negativeBalanceCount > 0
        ? <Link className="text-danger underline-offset-2 hover:underline" href="/admin/reports/arrears">{t.negativeBalanceCount.toLocaleString()}</Link>
        : t.negativeBalanceCount.toLocaleString(),
    },
  ];

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Overview</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {dash.periodLabel} · figures come from recorded meals and money activity. Money low is a current count.
      </p>

      <h2 className="mt-6 text-lg font-medium text-ink">What needs you</h2>
      {dash.editCheckUnavailableMessage ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-card border border-control-border bg-warn-wash p-4 text-ink">
          <AlertTriangleIcon className="mt-1 shrink-0 text-warn" />
          <p>{dash.editCheckUnavailableMessage}</p>
        </div>
      ) : dash.editCheckExceptions.length > 0 ? (
        <div className="mt-3 space-y-3">
          {dash.editCheckExceptions.map((item) => {
            const meal = item.mealType === "BREAKFAST" ? "Breakfast" : "Lunch";
            const date = item.serviceDate.toISOString().slice(0, 10);
            return (
              <article key={`${item.schoolId}-${date}-${item.mealType}`} className="rounded-card border border-control-border bg-warn-wash p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangleIcon className="mt-1 shrink-0 text-warn" />
                  <div>
                    <h3 className="font-medium text-ink">{meal} counts need attention</h3>
                    <p className="mt-1 text-sm text-ink">
                      {meal} counts look high at {item.schoolName}. Today recorded {item.claimedCount.toLocaleString()} {mealWords(item.mealType, item.claimedCount)}. The most you&apos;d expect for today is {item.ceiling.toLocaleString()}.
                    </p>
                    <LinkButton className="mt-3" variant="secondary" href={`/admin/reports/edit-check?from=${date}&to=${date}`}>
                      Check today&apos;s figures
                    </LinkButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-card border border-border bg-surface-card p-4 text-success">
          <CheckCircleIcon className="shrink-0" />
          <p>Nothing needs you today.</p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-border bg-surface-card p-4">
            <div className="text-xs text-ink-muted">{s.label}</div>
            <div className="mt-1 text-2xl font-medium tabular text-ink">{s.value}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-medium text-ink">By school</h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">School</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Served</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Extra meals</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Money added</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Mistakes fixed</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Low</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Money owed</th>
            </tr>
          </thead>
          <tbody>
            {dash.schools.map((s) => (
              <tr key={s.schoolId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-ink">{s.schoolName}</td>
                <td className="px-4 py-3 text-right tabular">{s.mealsServed}</td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">{s.mealOverrides}</td>
                <td className="px-4 py-3 text-right"><MoneyDisplay amountCents={s.depositsCents} /></td>
                <td className="px-4 py-3 text-right tabular">{s.adjustmentsCount}</td>
                <td className="px-4 py-3 text-right tabular">{s.lowBalanceCount}</td>
                <td className="px-4 py-3 text-right tabular">
                  {s.negativeBalanceCount > 0 ? (
                    <Link
                      className="text-danger underline-offset-2 hover:underline"
                      href={`/admin/reports/arrears?schoolId=${s.schoolId}`}
                    >
                      {s.negativeBalanceCount}
                    </Link>
                  ) : (
                    s.negativeBalanceCount
                  )}
                </td>
              </tr>
            ))}
            {dash.schools.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-muted">Nothing needs you today.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
