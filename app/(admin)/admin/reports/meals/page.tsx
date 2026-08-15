import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { dailyMealCounts } from "@/server/reports/mealCounts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function parseDate(s: string | undefined, fallback: string): Date {
  const v = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
  return new Date(`${v}T00:00:00.000Z`);
}

export default async function MealCountsReport({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const session = await getAppSession();
  const fromStr = searchParams.from ?? todayStr();
  const toStr = searchParams.to ?? todayStr();
  const rows = await dailyMealCounts(session, { from: parseDate(fromStr, todayStr()), to: parseDate(toStr, todayStr()) });

  return (
    <section>
      <Link href="/admin/reports" className="text-sm text-ink-muted hover:text-ink">← Reports</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Daily meal counts</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Meals served and extra meals are counted separately, never summed. These are your figures to check and submit. This system doesn&apos;t file claims.
      </p>

      <form action="/admin/reports/meals" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={fromStr} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={toStr} />
        </div>
        <Button type="submit">Show meal counts</Button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">School</th>
              <th scope="col" className="px-4 py-3 font-medium">Meal</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Served</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Extra meals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.schoolId}-${r.serviceDate.toISOString()}-${r.mealType}`} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{r.serviceDate.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 text-ink">{r.schoolName}</td>
                <td className="px-4 py-3 text-ink">{r.mealType === "BREAKFAST" ? "Breakfast" : "Lunch"}</td>
                <td className="px-4 py-3 text-right tabular">{r.served}</td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">{r.overrides}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">Choose a date range with recorded meals to check the totals.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
