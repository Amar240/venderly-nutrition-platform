import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { LinkButton } from "@/components/ui/link-button";

/** Super-admin configuration hub. */
export default async function ConfigHubPage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff" || session.role !== "SUPER_ADMIN") notFound();

  const screens = [
    { href: "/admin/config/items", title: "Item catalog", desc: "A-la-carte items and prices." },
    { href: "/admin/config/pricing", title: "Meal prices", desc: "Free meals for all students, meal prices, and warning thresholds." },
    { href: "/admin/config/schools", title: "Schools", desc: "School names and codes." },
    { href: "/admin/config/users", title: "Staff access", desc: "Roles and school assignment." },
  ];
  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Settings</h1>
      <p className="mt-1 text-sm text-ink-muted">System administrator only. Every change is recorded in staff activity.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {screens.map((s) => (
          <div key={s.href} className="flex flex-col rounded-card border border-border bg-surface-card p-6">
            <h2 className="text-lg font-medium text-ink">{s.title}</h2>
            <p className="mt-1 flex-1 text-sm text-ink-muted">{s.desc}</p>
            <div className="mt-4"><LinkButton href={s.href} variant="secondary">Change {s.title.toLowerCase()}</LinkButton></div>
          </div>
        ))}
      </div>
    </section>
  );
}
