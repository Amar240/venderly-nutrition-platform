import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { MoneyDisplay } from "@/components/ui/money";
import { BalanceStatusPill } from "@/components/balance-status";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Guardian household dashboard. Children are reached ONLY through the verified
 * GuardianStudent link (getHousehold enforces it). Balances and status are
 * computed server-side; the UI just renders them. No eligibility / price tier.
 */
export default async function GuardianHomePage() {
  const session = await getAppSession();
  const household = await getHousehold(session);
  const canTransfer = household.length >= 2;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">My household</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Balances and activity for your linked children.
          </p>
        </div>
        <div className="flex gap-2">
          {canTransfer && (
            <LinkButton href="/guardian/transfer" variant="secondary">
              Transfer
            </LinkButton>
          )}
          <LinkButton href="/guardian/deposit">Add money</LinkButton>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {household.map((child) => (
          <Link
            key={child.linkId}
            href={`/guardian/child/${child.studentId}`}
            className="block rounded-card border border-border bg-surface-card p-6 transition-[filter] hover:brightness-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-ink">
                  {child.firstName} {child.lastName}
                </h2>
                <p className="text-sm text-ink-muted">
                  Grade {child.grade} · {child.schoolName}
                </p>
              </div>
              <BalanceStatusPill status={child.status} />
            </div>
            <div className="mt-4">
              <div className="text-xs text-ink-muted">Balance</div>
              <div className="text-2xl">
                <MoneyDisplay amountCents={child.balanceCents} />
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">View activity →</p>
          </Link>
        ))}
        {household.length === 0 && (
          <EmptyState
            title="No linked children yet"
            body="This guardian login is active, but no students are linked to it. Ask an admin to verify the household link, then refresh this page."
            className="sm:col-span-2"
          />
        )}
      </div>
    </section>
  );
}
