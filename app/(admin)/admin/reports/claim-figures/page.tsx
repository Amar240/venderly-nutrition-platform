import Link from "next/link";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRUST_COPY, formatBps, formatClaimRate } from "@/lib/presentation-labels";
import { DEMO_SCALE_DISCLOSURE } from "@/lib/prototype";
import { getAppSession } from "@/server/auth/session";
import { monthlyClaimFigures } from "@/server/reports/claimFigures";

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mealLabel(mealType: "BREAKFAST" | "LUNCH"): string {
  return mealType === "BREAKFAST" ? "Breakfast" : "Lunch";
}

function mealWord(mealType: "BREAKFAST" | "LUNCH", count: number): string {
  const base = mealType === "BREAKFAST" ? "breakfast" : "lunch";
  return count === 1 ? base : `${base}es`;
}

export default async function ClaimFiguresPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getAppSession();
  const report = await monthlyClaimFigures(session, { month: searchParams.month });

  return (
    <section>
      <Link href="/admin/reports" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Reports
      </Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Monthly claim figures</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {report.districtName} · {report.month.label}
        {report.month.isCurrentMonth ? " · Month to date" : ""}
      </p>

      <form action="/admin/reports/claim-figures" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="month">Month</Label>
          <Input id="month" name="month" type="month" defaultValue={report.month.value} />
        </div>
        <Button type="submit">Show claim figures</Button>
      </form>

      {report.status !== "available" ? (
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-card border border-control-border bg-warn-wash p-4 text-ink">
          <AlertTriangleIcon className="mt-1 shrink-0 text-warn" />
          <p>{report.message}</p>
        </div>
      ) : (
        <>
          <div role="note" className="mt-6 flex items-start gap-2 rounded-card border border-control-border bg-brand-wash p-4 text-ink">
            <InfoIcon className="mt-1 shrink-0 text-brand" />
            <div className="space-y-2 text-sm">
              <p>
                {TRUST_COPY.claimFigures}
              </p>
              <p>
                {DEMO_SCALE_DISCLOSURE}
              </p>
            </div>
          </div>

          {report.exceptions.length > 0 ? (
            <div className="mt-6 rounded-card border border-control-border bg-warn-wash p-4">
              <h2 className="flex items-center gap-2 text-lg font-medium text-ink">
                <AlertTriangleIcon className="text-warn" /> Counts to check before using these figures
              </h2>
              <div className="mt-3 space-y-3">
                {report.exceptions.map((item) => (
                  <div key={`${item.schoolId}-${dateKey(item.serviceDate)}-${item.mealType}`} className="rounded-control bg-surface-card p-3 text-sm text-ink">
                    <p>
                      {mealLabel(item.mealType)} counts look high at {item.schoolName}. {dateKey(item.serviceDate)} recorded{" "}
                      {item.claimedCount.toLocaleString()} {mealWord(item.mealType, item.claimedCount)}. The most you&apos;d expect is{" "}
                      {item.ceiling.toLocaleString()}.
                    </p>
                    {item.reviewedAt ? (
                      <p className="mt-1 text-ink-muted">
                        Reviewed by {item.reviewedByName} · {dateKey(item.reviewedAt)}
                        {item.reviewNote ? ` — "${item.reviewNote}"` : ""}
                      </p>
                    ) : null}
                    <Link
                      href={`/admin/reports/edit-check?from=${dateKey(item.serviceDate)}&to=${dateKey(item.serviceDate)}`}
                      className="mt-2 inline-flex min-h-touch items-center text-sm font-medium text-ink hover:underline"
                    >
                      Check that day
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 rounded-card border border-border bg-surface-card p-4 text-success">
              <CheckCircleIcon /> No meal-count exceptions in this month.
            </div>
          )}

          <div className="mt-6 rounded-card border border-border bg-surface-card p-4">
            <h2 className="text-lg font-medium text-ink">Free-meals claiming calculation</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {formatBps(report.identifiedStudentPercentageBps)}% × 1.6 = {formatClaimRate(report.freeRateUnits)}% at the free rate, with{" "}
              {formatClaimRate(report.paidRateUnits)}% at the paid rate.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-border p-3">
                <h3 className="text-sm font-medium text-ink">Breakfasts</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {report.breakfastSplit.freeRate.toLocaleString()} at the free rate · {report.breakfastSplit.paidRate.toLocaleString()} at the paid rate
                </p>
              </div>
              <div className="rounded-control border border-border p-3">
                <h3 className="text-sm font-medium text-ink">Lunches</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {report.lunchSplit.freeRate.toLocaleString()} at the free rate · {report.lunchSplit.paidRate.toLocaleString()} at the paid rate
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-medium">School</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Breakfasts</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Lunches</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Extra breakfasts</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Extra lunches</th>
                  <th scope="col" className="px-4 py-3 font-medium">Check</th>
                </tr>
              </thead>
              <tbody>
                {report.schools.map((row) => (
                  <tr key={row.schoolId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink">{row.schoolName}</td>
                    <td className="px-4 py-3 text-right tabular">{row.breakfastCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular">{row.lunchCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular text-ink-muted">{row.breakfastExtraCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular text-ink-muted">{row.lunchExtraCount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {row.needsAttention ? (
                        <span className="inline-flex items-center gap-1 font-medium text-warn">
                          <AlertTriangleIcon className="shrink-0" /> Needs attention
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircleIcon className="shrink-0" /> Ready to check
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border font-medium">
                  <th scope="row" className="px-4 py-3 text-left text-ink">Visible schools total</th>
                  <td className="px-4 py-3 text-right tabular">{report.totals.breakfastCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular">{report.totals.lunchCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-muted">{report.totals.breakfastExtraCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-muted">{report.totals.lunchExtraCount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {report.totals.needsAttention ? "Needs attention" : "Ready to check"}
                  </td>
                </tr>
                {report.totals.breakfastCount + report.totals.lunchCount === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                      Choose a month with recorded meals to prepare claim figures.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
