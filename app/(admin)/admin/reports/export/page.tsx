import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { reportScope } from "@/server/reports/scope";
import { ExportForm } from "./export-form";

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

      <ExportForm schools={scope.schools} />
    </section>
  );
}
