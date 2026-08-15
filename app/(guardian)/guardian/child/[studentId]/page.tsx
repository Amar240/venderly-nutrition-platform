import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getChildDetail } from "@/server/household/household";
import { MoneyDisplay } from "@/components/ui/money";
import { BalanceStatusPill } from "@/components/balance-status";
import { LinkButton } from "@/components/ui/link-button";
import { CheckCircleIcon } from "@/components/icons";
import { moneyActivityLabel } from "@/lib/presentation-labels";
import type { LedgerEntry } from "@prisma/client";

/** Attach a running balance to each entry (oldest → newest), then newest-first. */
function withRunningBalance(history: LedgerEntry[]) {
  let running = 0;
  const rows = history.map((e) => {
    running += e.amountCents;
    return { entry: e, runningCents: running };
  });
  return rows.reverse();
}

export default async function ChildHistoryPage({
  params,
  searchParams,
}: {
  params: { studentId: string };
  searchParams: { moved?: string };
}) {
  const session = await getAppSession();
  const child = await getChildDetail(session, params.studentId);
  if (!child) notFound();

  const rows = withRunningBalance(child.history);

  return (
    <section>
      <Link href="/guardian" className="text-sm text-ink-muted hover:text-ink">
        ← Back to household
      </Link>

      {searchParams.moved && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-control bg-success-wash px-3 py-2 text-sm text-success"
        >
          <CheckCircleIcon className="shrink-0" /> Money moved.
        </div>
      )}

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {child.firstName} {child.lastName}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Grade {child.grade} · {child.schoolName}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-muted">Snack money</div>
          <div className="text-2xl">
            <MoneyDisplay amountCents={child.balanceCents} />
          </div>
          <div className="mt-1 flex justify-end">
            <BalanceStatusPill status={child.status} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <LinkButton href="/guardian/deposit">Add money</LinkButton>
        <LinkButton href="/guardian/transfer" variant="secondary">
          Move money
        </LinkButton>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Money history</caption>
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">Activity</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Snack money</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, runningCents }) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                  {entry.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-ink">
                  {moneyActivityLabel(entry.type)}
                  <span className="block text-xs text-ink-muted">{entry.description}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <MoneyDisplay amountCents={entry.amountCents} sign className="tabular" />
                </td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">
                  <MoneyDisplay amountCents={runningCents} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-muted">
                  Nothing has happened on this account yet. Money added and meals taken will show here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
