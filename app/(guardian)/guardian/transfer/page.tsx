import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { TransferForm } from "./transfer-form";

/**
 * Sibling transfer. Needs at least two linked children. The available-money
 * rule and the linked debit+credit are enforced server-side (server/ledger).
 */
export default async function TransferPage() {
  const session = await getAppSession();
  const household = await getHousehold(session);

  return (
    <section className="mx-auto max-w-lg">
      <Link href="/guardian" className="text-sm text-ink-muted hover:text-ink">
        ← Back to household
      </Link>
      <h1 className="mt-4 text-2xl font-medium text-ink">Move money between children</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Move snack money from one child to another. You&apos;ll review
        the details before anything moves.
      </p>

      <div className="mt-6">
        {household.length < 2 ? (
          <p className="rounded-card border border-border bg-surface-card p-6 text-sm text-ink-muted">
            Link at least two children to move money between them.
          </p>
        ) : (
          <TransferForm
            token={crypto.randomUUID()}
            students={household.map((c) => ({
              studentId: c.studentId,
              name: `${c.firstName} ${c.lastName}`,
              balanceCents: c.balanceCents,
            }))}
          />
        )}
      </div>
    </section>
  );
}
