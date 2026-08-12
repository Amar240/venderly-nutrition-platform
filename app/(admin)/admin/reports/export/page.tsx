import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { reportScope } from "@/server/reports/scope";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const selectClass =
  "min-h-touch w-full rounded-control border border-border bg-surface-card px-3 py-2 text-base text-ink";

/**
 * Transaction export. The form POSTs to the export route, which permission-checks
 * the scope, writes an audit entry (who, filters, when), and streams a CSV.
 */
export default async function ExportPage() {
  const session = await getAppSession();
  const scope = await reportScope(session);

  return (
    <section className="mx-auto max-w-lg">
      <Link href="/admin/reports" className="text-sm text-ink-muted hover:text-ink">← Reports</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Transaction export</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Download a filtered CSV of ledger transactions. Every export is recorded in the audit log.
      </p>

      <form action="/api/reports/transactions/export" method="post" className="mt-6 space-y-4">
        <div className="space-y-1">
          <Label htmlFor="schoolId">School</Label>
          <select id="schoolId" name="schoolId" className={selectClass}>
            <option value="">All my schools</option>
            {scope.schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" />
          </div>
        </div>
        <Button type="submit">Download CSV</Button>
      </form>
    </section>
  );
}
