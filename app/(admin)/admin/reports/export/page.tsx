import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { reportScope } from "@/server/reports/scope";
import { ExportForm } from "./export-form";

/**
 * Money-history download. The form POSTs to the export route, which permission-checks
 * the scope, writes a staff-activity record, and streams a file.
 */
export default async function ExportPage() {
  const session = await getAppSession();
  const scope = await reportScope(session);

  return (
    <section className="mx-auto max-w-lg">
      <Link href="/admin/reports" className="text-sm text-ink-muted hover:text-ink">← Reports</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Download money history</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Download a filtered file of money in and out. Every download is recorded in staff activity.
      </p>

      <ExportForm schools={scope.schools} />
    </section>
  );
}
