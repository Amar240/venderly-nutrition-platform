import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getChildDetail } from "@/server/household/household";
import { MoneyDisplay } from "@/components/ui/money";
import { BalanceStatusPill } from "@/components/balance-status";
import { LinkButton } from "@/components/ui/link-button";
import { CheckCircleIcon } from "@/components/icons";
import { MoneyHistoryList } from "@/components/money-history-list";

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

      <div className="mt-6 rounded-card border border-border bg-surface-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-ink">Money history</h2>
        <MoneyHistoryList items={child.history} showRunningBalance />
      </div>
    </section>
  );
}
