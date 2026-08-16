import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRUST_COPY, correctionSituationLabel, formatBps, formatClaimRate, staffRoleLabel } from "@/lib/presentation-labels";
import { DEMO_SCALE_DISCLOSURE } from "@/lib/prototype";
import { AuthError } from "@/server/auth/errors";
import { getAppSession } from "@/server/auth/session";
import { writeAudit } from "@/server/audit/log";
import { monthlyClaimFigures, type MonthlyClaimFigures } from "@/server/reports/claimFigures";
import { dailyMealCounts, type DailyMealCountRow } from "@/server/reports/mealCounts";
import { correctionsInPeriod } from "@/server/reports/corrections";
import { PrintButton } from "./print-button";

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mealLabel(mealType: "BREAKFAST" | "LUNCH"): string {
  return mealType === "BREAKFAST" ? "Breakfast" : "Lunch";
}

function groupDailyBySchool(rows: DailyMealCountRow[]): Map<string, DailyMealCountRow[]> {
  const bySchool = new Map<string, DailyMealCountRow[]>();
  for (const row of rows) {
    const list = bySchool.get(row.schoolId) ?? [];
    list.push(row);
    bySchool.set(row.schoolId, list);
  }
  for (const list of bySchool.values()) {
    list.sort(
      (a, b) => a.serviceDate.getTime() - b.serviceDate.getTime() || a.mealType.localeCompare(b.mealType),
    );
  }
  return bySchool;
}

export default async function ClaimPackPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getAppSession();
  let figures: MonthlyClaimFigures;
  try {
    figures = await monthlyClaimFigures(session, { month: searchParams.month });
  } catch (error) {
    if (error instanceof AuthError) notFound();
    throw error;
  }

  if (figures.status !== "available") {
    return (
      <section>
        <div data-print-hidden="true">
          <Link href="/admin/reports/claim-figures" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
            ← Monthly claim figures
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-medium text-ink">Claim pack</h1>
        <p className="mt-1 text-sm text-ink-muted">{figures.districtName} · {figures.month.label}</p>
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-card border border-control-border bg-warn-wash p-4 text-ink">
          <AlertTriangleIcon className="mt-1 shrink-0 text-warn" />
          <p>{figures.message}</p>
        </div>
      </section>
    );
  }

  const [dailyRows, corrections] = await Promise.all([
    dailyMealCounts(session, { from: figures.month.from, to: figures.month.classificationTo }),
    correctionsInPeriod(session, { from: figures.month.from, to: figures.month.classificationTo }),
  ]);
  const dailyBySchool = groupDailyBySchool(dailyRows);
  const generatedAt = new Date();
  // requireRole/requireStaff already ran inside monthlyClaimFigures — session is a staff principal here.
  const staff = session && session.principalType === "staff" ? session : null;

  await writeAudit({
    actorType: "USER",
    actorId: staff?.userId ?? null,
    action: "CLAIM_PACK_GENERATED",
    subjectType: "report",
    subjectId: figures.month.value,
    districtId: staff?.districtId ?? null,
    after: { month: figures.month.value },
  });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4" data-print-hidden="true">
        <Link href="/admin/reports/claim-figures" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
          ← Monthly claim figures
        </Link>
        <PrintButton />
      </div>

      <form action="/admin/reports/claim-pack" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="month">Month</Label>
          <Input id="month" name="month" type="month" defaultValue={figures.month.value} />
        </div>
        <Button type="submit">Prepare claim pack</Button>
      </form>

      <h1 className="mt-6 text-2xl font-medium text-ink">Claim pack</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {figures.districtName} · {figures.month.label}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Prepared {generatedAt.toLocaleString("en-US")} {staff ? `by ${staffRoleLabel(staff.role)}` : ""}
      </p>

      <div role="note" className="mt-6 flex items-start gap-2 rounded-card border border-control-border bg-warn-wash p-4 text-ink">
        <InfoIcon className="mt-1 shrink-0 text-warn" />
        <div className="space-y-2 text-sm">
          <p>{TRUST_COPY.claimFigures}</p>
          <p>{DEMO_SCALE_DISCLOSURE}</p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-medium text-ink">Per-school totals</h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">School</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Breakfasts</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Lunches</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Extra breakfasts</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Extra lunches</th>
            </tr>
          </thead>
          <tbody>
            {figures.schools.map((row) => (
              <tr key={row.schoolId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-ink">{row.schoolName}</td>
                <td className="px-4 py-3 text-right tabular">{row.breakfastCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular">{row.lunchCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">{row.breakfastExtraCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">{row.lunchExtraCount.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <th scope="row" className="px-4 py-3 text-left text-ink">District total</th>
              <td className="px-4 py-3 text-right tabular">{figures.totals.breakfastCount.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular">{figures.totals.lunchCount.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular text-ink-muted">{figures.totals.breakfastExtraCount.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular text-ink-muted">{figures.totals.lunchExtraCount.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Extra meals are override entries (D-10) and are never summed into the headline breakfast/lunch counts above.
      </p>

      <h2 className="mt-8 text-lg font-medium text-ink">Daily counts by site and meal type</h2>
      {figures.schools.map((school) => {
        const rows = dailyBySchool.get(school.schoolId) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={school.schoolId} className="mt-3">
            <h3 className="text-sm font-medium text-ink">{school.schoolName}</h3>
            <div className="mt-2 overflow-x-auto rounded-card border border-border bg-surface-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th scope="col" className="px-4 py-2 font-medium">Date</th>
                    <th scope="col" className="px-4 py-2 font-medium">Meal</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Served</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Extra</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${dateKey(row.serviceDate)}-${row.mealType}`} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{dateKey(row.serviceDate)}</td>
                      <td className="px-4 py-2 text-ink">{mealLabel(row.mealType)}</td>
                      <td className="px-4 py-2 text-right tabular">{row.served.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular text-ink-muted">{row.overrides.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <h2 className="mt-8 text-lg font-medium text-ink">Free-meals claiming calculation</h2>
      <div className="mt-3 rounded-card border border-border bg-surface-card p-4">
        <p className="text-sm text-ink-muted">
          {formatBps(figures.identifiedStudentPercentageBps)}% × 1.6 = {formatClaimRate(figures.freeRateUnits)}% at the free rate, with{" "}
          {formatClaimRate(figures.paidRateUnits)}% at the paid rate.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-border p-3">
            <h3 className="text-sm font-medium text-ink">Breakfasts</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {figures.breakfastSplit.freeRate.toLocaleString()} at the free rate · {figures.breakfastSplit.paidRate.toLocaleString()} at the paid rate
            </p>
          </div>
          <div className="rounded-control border border-border p-3">
            <h3 className="text-sm font-medium text-ink">Lunches</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {figures.lunchSplit.freeRate.toLocaleString()} at the free rate · {figures.lunchSplit.paidRate.toLocaleString()} at the paid rate
            </p>
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-medium text-ink">Edit-check exceptions</h2>
      {figures.exceptions.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-card border border-border bg-surface-card p-4 text-success">
          <CheckCircleIcon /> No meal-count exceptions in this month.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {figures.exceptions.map((item) => (
            <div key={`${item.schoolId}-${dateKey(item.serviceDate)}-${item.mealType}`} className="rounded-card border border-control-border bg-warn-wash p-3 text-sm text-ink">
              <p>
                {mealLabel(item.mealType)} at {item.schoolName}, {dateKey(item.serviceDate)}: {item.claimedCount.toLocaleString()} recorded against a maximum of {item.ceiling.toLocaleString()} ({item.activeEnrollment.toLocaleString()} active enrollment).
              </p>
              <p className="mt-1 text-ink-muted">
                {item.reviewedAt
                  ? `Reviewed by ${item.reviewedByName} · ${dateKey(item.reviewedAt)}${item.reviewNote ? `. Note: "${item.reviewNote}"` : ""}`
                  : "Not yet reviewed."}
              </p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-lg font-medium text-ink">Corrections in the period</h2>
      {corrections.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-card border border-border bg-surface-card p-4 text-success">
          <CheckCircleIcon /> No corrections recorded in this month.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-card border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Situation</th>
                <th scope="col" className="px-4 py-3 font-medium">Reason</th>
                <th scope="col" className="px-4 py-3 font-medium">Actor</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{dateKey(c.createdAt)}</td>
                  <td className="px-4 py-3 text-ink">
                    {c.studentName}
                    {c.targetStudentName ? ` → ${c.targetStudentName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-ink">{correctionSituationLabel(c.situation)}</td>
                  <td className="px-4 py-3 text-ink">{c.reason}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.actorName ?? "Not recorded"}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {c.status === "COMPLETED" ? `Completed${c.completedByName ? ` by ${c.completedByName}` : ""}` : c.status === "FOLLOW_UP_REQUIRED" ? "Follow-up required" : "Pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
