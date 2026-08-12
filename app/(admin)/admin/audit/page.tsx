import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { searchAuditLog } from "@/server/audit/query";
import { AuthError } from "@/server/auth/errors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Audit log viewer — SUPER ADMIN ONLY. searchAuditLog enforces the role; a
 * non-super-admin gets a 404 (don't reveal the page exists).
 */
export default async function AuditViewerPage({
  searchParams,
}: {
  searchParams: { action?: string; from?: string; to?: string };
}) {
  const session = await getAppSession();
  const action = searchParams.action?.trim() || undefined;
  const from = searchParams.from && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from) ? new Date(`${searchParams.from}T00:00:00.000Z`) : undefined;
  const to = searchParams.to && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to) ? new Date(`${searchParams.to}T23:59:59.999Z`) : undefined;

  let entries;
  try {
    entries = await searchAuditLog(session, { action, from, to });
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Audit log</h1>
      <p className="mt-1 text-sm text-ink-muted">Every sensitive action, most recent first.</p>

      <form action="/admin/audit" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="action">Action</Label>
          <Input id="action" name="action" defaultValue={action ?? ""} placeholder="e.g. LEDGER_ADJUSTMENT" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={searchParams.from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={searchParams.to ?? ""} />
        </div>
        <Button type="submit">Filter</Button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">Time</th>
              <th scope="col" className="px-4 py-3 font-medium">Action</th>
              <th scope="col" className="px-4 py-3 font-medium">Actor</th>
              <th scope="col" className="px-4 py-3 font-medium">Subject</th>
              <th scope="col" className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 align-top">
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                  {e.createdAt.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3 text-ink">{e.action}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {e.actorType}
                  {e.ip ? <span className="block text-xs">{e.ip}</span> : null}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {e.subjectType ? `${e.subjectType}` : "—"}
                  {e.subjectId ? <span className="block text-xs">#{e.subjectId.slice(-6)}</span> : null}
                </td>
                <td className="px-4 py-3 text-ink-muted">{e.reason ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">No audit entries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
