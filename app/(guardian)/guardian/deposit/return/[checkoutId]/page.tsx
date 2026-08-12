import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getReceiptForGuardian } from "@/server/household/household";
import { MoneyDisplay } from "@/components/ui/money";
import { LinkButton } from "@/components/ui/link-button";
import { CheckCircleIcon, InfoIcon, AlertCircleIcon } from "@/components/icons";

// Always read fresh status — this page reflects the settlement outcome.
export const dynamic = "force-dynamic";

/**
 * Return page after the simulated checkout. It reads PaymentIntent STATUS ONLY
 * and credits nothing. If the webhook hasn't settled yet, it shows a graceful
 * "processing" state the guardian can refresh.
 */
export default async function DepositReturnPage({
  params,
}: {
  params: { checkoutId: string };
}) {
  const session = await getAppSession();
  const receipt = await getReceiptForGuardian(session, params.checkoutId);
  if (!receipt) notFound();

  if (receipt.status === "PENDING") {
    return (
      <section className="mx-auto max-w-md">
        <div className="rounded-card border border-border bg-surface-card p-6 text-center">
          <InfoIcon className="mx-auto text-brand" />
          <h1 className="mt-2 text-xl font-medium text-ink">Payment processing</h1>
          <p className="mt-1 text-sm text-ink-muted">
            We&apos;re confirming your deposit. This usually takes a moment.
          </p>
          <div className="mt-4">
            <LinkButton
              href={`/guardian/deposit/return/${receipt.intentId}`}
              variant="secondary"
            >
              Refresh
            </LinkButton>
          </div>
        </div>
      </section>
    );
  }

  if (receipt.status === "FAILED") {
    return (
      <section className="mx-auto max-w-md">
        <div className="rounded-card border border-border bg-surface-card p-6 text-center">
          <AlertCircleIcon className="mx-auto text-danger" />
          <h1 className="mt-2 text-xl font-medium text-ink">Deposit not completed</h1>
          <p className="mt-1 text-sm text-ink-muted">
            No money was moved. You can try again.
          </p>
          <div className="mt-4">
            <LinkButton href="/guardian/deposit">Back to deposit</LinkButton>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-card border border-border bg-surface-card p-6">
        <div className="text-center">
          <CheckCircleIcon className="mx-auto text-success" />
          <h1 className="mt-2 text-xl font-medium text-ink">Deposit complete</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Your household balances have been updated.
          </p>
        </div>

        <ul className="mt-6 divide-y divide-border">
          {receipt.lines.map((line) => (
            <li key={line.studentName} className="flex justify-between py-2 text-sm">
              <span className="text-ink-muted">{line.studentName}</span>
              <MoneyDisplay amountCents={line.amountCents} sign />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-medium">
          <span>Total deposited</span>
          <MoneyDisplay amountCents={receipt.totalCents} sign />
        </div>

        <div className="mt-6">
          <LinkButton href="/guardian" className="w-full">
            Back to household
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
