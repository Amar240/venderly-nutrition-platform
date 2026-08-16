import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { DepositForm } from "./deposit-form";
import { LinkButton } from "@/components/ui/link-button";

/**
 * Deposit entry. Guardians may fund one child or split across several. The
 * amount is only staged here; the ledger credit happens after the simulated
 * checkout settles server-side.
 */
export default async function DepositPage() {
  const session = await getAppSession();
  const household = await getHousehold(session);

  return (
    <section className="mx-auto max-w-lg">
      <Link href="/guardian" className="text-sm text-ink-muted hover:text-ink">
        ← Back to household
      </Link>
      <h1 className="mt-4 text-2xl font-medium text-ink">Add money</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Enter an amount for one or more children, then continue to the simulated
        checkout. No real card is charged.
      </p>

      <div className="mt-6">
        <DepositForm
          students={household.map((c) => ({
            studentId: c.studentId,
            name: `${c.firstName} ${c.lastName}`,
            schoolName: c.schoolName,
          }))}
        />
      </div>

      <div className="mt-6 rounded-card border border-border bg-surface-card p-4">
        <h2 className="text-base font-medium text-ink">Automatic top-up</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Set a rule for a child so money is added after the account drops below
          the amount you choose.
        </p>
        <LinkButton href="/guardian/top-up" variant="secondary" className="mt-3">
          Manage automatic top-up
        </LinkButton>
      </div>
    </section>
  );
}
