import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { TransferForm } from "./transfer-form";

/**
 * Sibling transfer. Needs at least two linked children. The amount ≤ balance
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
      <h1 className="mt-4 text-2xl font-medium text-ink">Transfer between children</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Move money from one child&apos;s balance to another. You&apos;ll confirm
        the details before anything moves.
      </p>

      <div className="mt-6">
        {household.length < 2 ? (
          <p className="rounded-card border border-border bg-surface-card p-6 text-sm text-ink-muted">
            You need at least two linked children to transfer money.
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
