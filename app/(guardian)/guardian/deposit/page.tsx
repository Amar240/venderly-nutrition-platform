import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { DepositForm } from "./deposit-form";

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
        checkout. No real payment is processed.
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
    </section>
  );
}
