import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircleIcon } from "@/components/icons";
import { LinkButton } from "@/components/ui/link-button";
import { MoneyDisplay } from "@/components/ui/money";
import { EmptyState } from "@/components/ui/empty-state";
import { getAppSession } from "@/server/auth/session";
import { AuthError } from "@/server/auth/errors";
import { arrearsReport } from "@/server/reports/arrears";

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function ArrearsReportPage({
  searchParams,
}: {
  searchParams: { schoolId?: string };
}) {
  const session = await getAppSession();
  let report;
  try {
    report = await arrearsReport(session, { schoolId: searchParams.schoolId });
  } catch (error) {
    if (error instanceof AuthError) notFound();
    throw error;
  }
  const selectedSchool = searchParams.schoolId
    ? report.schools.find((school) => school.id === searchParams.schoolId)
    : null;

  return (
    <section>
      <Link href="/admin/reports" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Reports
      </Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Money owed</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {report.districtName} · Students whose meal account is currently below $0, based on money history.
      </p>

      <form action="/admin/reports/arrears" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-sm font-medium text-ink">School</span>
          <select
            name="schoolId"
            defaultValue={selectedSchool?.id ?? ""}
            className="min-h-touch rounded-control border border-control-border bg-white px-3 py-2 text-base text-ink"
          >
            <option value="">All schools</option>
            {report.schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-touch rounded-control border border-control-border bg-surface-card px-4 py-2 text-ink-muted hover:bg-brand-wash">
          View money owed
        </button>
        <LinkButton href="/admin/charge-policy" variant="secondary">
          Read charge policy
        </LinkButton>
      </form>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">Student</th>
              <th scope="col" className="px-4 py-3 font-medium">Student number</th>
              <th scope="col" className="px-4 py-3 font-medium">School</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Money owed</th>
              <th scope="col" className="px-4 py-3 font-medium">How long</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.studentId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-ink">{row.studentName}</td>
                <td className="px-4 py-3 tabular text-ink-muted">{row.studentNumber}</td>
                <td className="px-4 py-3 text-ink">{row.schoolName}</td>
                <td className="px-4 py-3 text-right">
                  <MoneyDisplay amountCents={row.amountOwedCents} />
                </td>
                <td className="px-4 py-3 text-ink">
                  {row.durationLabel} <span className="text-ink-muted">since {dateKey(row.streakStartDate)}</span>
                </td>
                <td className="px-4 py-3">
                  {row.enrollmentStatus === "INACTIVE" ? (
                    <span className="inline-flex items-center gap-1 text-ink-muted">
                      <AlertCircleIcon /> Marked as left
                    </span>
                  ) : (
                    <span>Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No money is owed right now"
          body="When a meal account drops below $0, it will appear here with how long it has been owed."
          action={<LinkButton href="/admin/charge-policy" variant="secondary">Read charge policy</LinkButton>}
        />
      ) : null}
    </section>
  );
}
