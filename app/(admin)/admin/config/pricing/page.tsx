import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { listPricingConfigs } from "@/server/config/pricing";
import { AuthError } from "@/server/auth/errors";
import { PricingForm } from "./pricing-form";

export default async function PricingConfigPage() {
  const session = await getAppSession();
  let configs;
  try {
    configs = await listPricingConfigs(session);
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }
  const district = configs.find((c) => c.schoolId === null);
  const initial = {
    cepEnabled: district?.cepEnabled ?? true,
    breakfastFreeCents: district?.breakfastFreeCents ?? 0,
    breakfastReducedCents: district?.breakfastReducedCents ?? 0,
    breakfastPaidCents: district?.breakfastPaidCents ?? 0,
    lunchFreeCents: district?.lunchFreeCents ?? 0,
    lunchReducedCents: district?.lunchReducedCents ?? 0,
    lunchPaidCents: district?.lunchPaidCents ?? 0,
    lowBalanceThresholdCents: district?.lowBalanceThresholdCents ?? 1000,
  };

  return (
    <section className="mx-auto max-w-xl">
      <Link href="/admin/config" className="text-sm text-ink-muted hover:text-ink">← Configuration</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Pricing config</h1>
      <p className="mt-1 text-sm text-ink-muted">
        District defaults. When CEP is on, breakfast and lunch are $0 for everyone.
      </p>
      <div className="mt-6">
        <PricingForm initial={initial} />
      </div>
    </section>
  );
}
