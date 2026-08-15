import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getReceiptForGuardian } from "@/server/household/household";
import { MoneyDisplay } from "@/components/ui/money";
import { Button } from "@/components/ui/button";
import { InfoIcon } from "@/components/icons";

/**
 * SIMULATED hosted checkout. Clicking Pay posts to the fake provider endpoint,
 * which signs a settlement event and delivers it to our webhook — this page
 * itself credits nothing. The amount shown is read from the server-side intent.
 */
export default async function CheckoutPage({
  params,
}: {
  params: { checkoutId: string };
}) {
  const session = await getAppSession();
  const receipt = await getReceiptForGuardian(session, params.checkoutId);
  if (!receipt) notFound();
  if (receipt.status === "COMPLETED") {
    redirect(`/guardian/deposit/return/${receipt.intentId}`);
  }

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-card border border-border bg-surface-card p-6">
        <div className="flex items-center gap-2 rounded-control bg-brand-wash px-3 py-2 text-xs text-ink-muted">
          <InfoIcon className="shrink-0 text-brand" />
          Simulated hosted checkout — no real card is charged.
        </div>

        <h1 className="mt-4 text-xl font-medium text-ink">Review your deposit</h1>

        <ul className="mt-4 divide-y divide-border">
          {receipt.lines.map((line) => (
            <li key={line.studentName} className="flex justify-between py-2 text-sm">
              <span className="text-ink-muted">{line.studentName}</span>
              <MoneyDisplay amountCents={line.amountCents} />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-medium">
          <span>Total</span>
          <MoneyDisplay amountCents={receipt.totalCents} />
        </div>

        {/* Decorative only — the simulated provider needs no real card data. */}
        <div className="mt-6 space-y-1" aria-hidden>
          <span className="text-xs text-ink-muted">Card number</span>
          <div className="rounded-control border border-dashed border-border px-3 py-2 text-sm text-ink-muted/60">
            4242 4242 4242 4242 (demo)
          </div>
        </div>

        <form action="/api/payments/sim/pay" method="post" className="mt-6">
          <input type="hidden" name="checkoutId" value={receipt.intentId} />
          <Button type="submit" className="w-full">
            Pay <MoneyDisplay amountCents={receipt.totalCents} className="text-white" />
          </Button>
        </form>
        <div className="mt-3 text-center">
          <Link href="/guardian/deposit" className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </Link>
        </div>
      </div>
    </section>
  );
}
