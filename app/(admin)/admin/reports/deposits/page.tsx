import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { monthlyDeposits } from "@/server/reports/deposits";
import { MoneyDisplay } from "@/components/ui/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default async function DepositsReport({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getAppSession();
  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthStr = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : defaultMonth;
  const year = Number(monthStr.slice(0, 4));
  const month = Number(monthStr.slice(5, 7));
  const rows = await monthlyDeposits(session, { year, month });

  return (
    <section>
      <Link href="/admin/reports" className="text-sm text-ink-muted hover:text-ink">← Reports</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Monthly money added</h1>
      <p className="mt-1 text-sm text-ink-muted">Payments and money movement, per school.</p>

      <form action="/admin/reports/deposits" method="get" className="mt-4 flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="month">Month</Label>
          <Input id="month" name="month" type="month" defaultValue={monthStr} />
        </div>
        <Button type="submit">Show monthly money</Button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">School</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Money added</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Money moved</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Money fixed</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.schoolId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-ink">{r.schoolName}</td>
                <td className="px-4 py-3 text-right"><MoneyDisplay amountCents={r.depositsCents} /></td>
                <td className="px-4 py-3 text-right"><MoneyDisplay amountCents={r.transfersCents} /></td>
                <td className="px-4 py-3 text-right"><MoneyDisplay amountCents={r.refundsAdjustmentsCents} /></td>
                <td className="px-4 py-3 text-right font-medium"><MoneyDisplay amountCents={r.totalCents} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">Nothing needs you today.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
