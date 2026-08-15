import { LinkButton } from "@/components/ui/link-button";

/** Reports hub. Read-only surfaces, scoped to the session. */
export default function ReportsHubPage() {
  const reports = [
    { href: "/admin/reports/meals", title: "Daily meal counts", desc: "Meals served and extra meals, per school, by date and meal type." },
    { href: "/admin/reports/deposits", title: "Monthly money added", desc: "Payments, money moved, money given back, mistakes fixed, and totals per school." },
    { href: "/admin/reports/export", title: "Download money history", desc: "Download a filtered file of money in and out." },
  ];
  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Reports</h1>
      <p className="mt-1 text-sm text-ink-muted">All figures come from recorded meals and money activity. Scoped to your schools.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {reports.map((r) => (
          <div key={r.href} className="flex flex-col rounded-card border border-border bg-surface-card p-6">
            <h2 className="text-lg font-medium text-ink">{r.title}</h2>
            <p className="mt-1 flex-1 text-sm text-ink-muted">{r.desc}</p>
            <div className="mt-4">
              <LinkButton href={r.href} variant="secondary">View {r.title.toLowerCase()}</LinkButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
