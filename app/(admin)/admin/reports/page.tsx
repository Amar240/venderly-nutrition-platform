import { LinkButton } from "@/components/ui/link-button";

/** Reports hub. Read-only surfaces, scoped to the session. */
export default function ReportsHubPage() {
  const reports = [
    { href: "/admin/reports/meals", title: "Daily meal counts", desc: "Served vs overrides, per school, by date and meal type." },
    { href: "/admin/reports/deposits", title: "Monthly deposits", desc: "Deposits, transfers, refunds/adjustments and totals per school." },
    { href: "/admin/reports/export", title: "Transaction export", desc: "Download a filtered CSV of ledger transactions." },
  ];
  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Reports</h1>
      <p className="mt-1 text-sm text-ink-muted">All figures derive from the ledger. Scoped to your schools.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {reports.map((r) => (
          <div key={r.href} className="flex flex-col rounded-card border border-border bg-surface-card p-6">
            <h2 className="text-lg font-medium text-ink">{r.title}</h2>
            <p className="mt-1 flex-1 text-sm text-ink-muted">{r.desc}</p>
            <div className="mt-4">
              <LinkButton href={r.href} variant="secondary">Open</LinkButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
