import Link from "next/link";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRUST_COPY } from "@/lib/presentation-labels";
import { getAppSession } from "@/server/auth/session";
import { editCheckReport } from "@/server/reports/editCheck";
import { districtToday } from "@/server/time/district";
import { markExceptionReviewedAction } from "./actions";

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | undefined, fallback: string): Date {
  const safe = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  return new Date(`${safe}T00:00:00.000Z`);
}

function safeDateString(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== value) return fallback;
  return value;
}

function formatPercent(basisPoints: number): string {
  return (basisPoints / 100).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

function percentageSourceLabel(provenance: "FNS_FEDERAL_DEFAULT" | "APPROVED_LOCAL"): string {
  return provenance === "FNS_FEDERAL_DEFAULT"
    ? "FNS federal default"
    : "approved state or district value";
}

export default async function EditCheckReportPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return null;

  const today = dateKey(await districtToday(session.districtId));
  const fromString = safeDateString(searchParams.from, today);
  const toString = safeDateString(searchParams.to, today);
  const report = await editCheckReport(session, {
    from: parseDate(fromString, today),
    to: parseDate(toString, today),
  });

  return (
    <section>
      <Link href="/admin/reports" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Reports
      </Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Check meal-count ceilings</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {report.status === "available" ? `${report.districtName} · ` : ""}Compare each school&apos;s recorded breakfasts and lunches with its current active enrollment.
      </p>

      <form action="/admin/reports/edit-check" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={fromString} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={toString} />
        </div>
        <Button type="submit">Check meal counts</Button>
      </form>

      {report.status === "unavailable" ? (
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
                Ceilings use the {formatPercent(report.factorBps)}% {percentageSourceLabel(report.factorProvenance)} and are rounded down to a whole meal. Confirm whether your state agency or the district has an approved local percentage to use instead.
              </p>
              <p>{TRUST_COPY.claimFigures}</p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">School</th>
                  <th scope="col" className="px-4 py-3 font-medium">Meal</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Active enrollment</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Meals recorded</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Maximum expected</th>
                  <th scope="col" className="px-4 py-3 font-medium">Check</th>
                  <th scope="col" className="px-4 py-3 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={`${row.schoolId}-${dateKey(row.serviceDate)}-${row.mealType}`} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{dateKey(row.serviceDate)}</td>
                    <td className="px-4 py-3 text-ink">{row.schoolName}</td>
                    <td className="px-4 py-3 text-ink">{row.mealType === "BREAKFAST" ? "Breakfast" : "Lunch"}</td>
                    <td className="px-4 py-3 text-right tabular">{row.activeEnrollment.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular">{row.claimedCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular">{row.ceiling.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {row.needsAttention ? (
                        <span className="inline-flex items-center gap-1 font-medium text-warn">
                          <AlertTriangleIcon className="shrink-0" /> Needs attention
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircleIcon className="shrink-0" /> Within expected maximum
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!row.needsAttention ? (
                        <span className="text-ink-muted">No review needed</span>
                      ) : row.reviewedAt ? (
                        <p className="text-ink-muted">
                          Reviewed by {row.reviewedByName} · {dateKey(row.reviewedAt)}
                          {row.reviewNote ? `. Note: "${row.reviewNote}"` : ""}
                        </p>
                      ) : (
                        <form action={markExceptionReviewedAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="schoolId" value={row.schoolId} />
                          <input type="hidden" name="serviceDate" value={dateKey(row.serviceDate)} />
                          <input type="hidden" name="mealType" value={row.mealType} />
                          <Label htmlFor={`note-${row.schoolId}-${dateKey(row.serviceDate)}-${row.mealType}`} className="sr-only">
                            Review note
                          </Label>
                          <Input
                            id={`note-${row.schoolId}-${dateKey(row.serviceDate)}-${row.mealType}`}
                            name="note"
                            placeholder="Note (optional)"
                            className="w-40"
                          />
                          <Button type="submit" variant="secondary">Mark reviewed</Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-ink-muted">
                      Choose a date range with recorded meals to check the ceilings.
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
