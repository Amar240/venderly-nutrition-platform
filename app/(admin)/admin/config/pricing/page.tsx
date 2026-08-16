import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getPricingConfigurationView } from "@/server/config/pricing";
import { AuthError } from "@/server/auth/errors";
import { districtToday } from "@/server/time/district";
import { PricingForm } from "./pricing-form";

export default async function PricingConfigPage() {
  const session = await getAppSession();
  let view;
  let today = new Date();
  try {
    view = await getPricingConfigurationView(session);
    if (session?.principalType === "staff") today = await districtToday(session.districtId);
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }
  const dateString = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

  return (
    <section className="mx-auto max-w-5xl">
      <Link href="/admin/config" className="text-sm text-ink-muted hover:text-ink">← Settings</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Meal prices</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {view.districtName} uses dated price settings, so meals already served keep the price shown at the time.
      </p>
      <div className="mt-6">
        <PricingForm
          current={{
            ...view.current,
            effectiveFrom: dateString(view.current.effectiveFrom),
          }}
          scheduled={view.scheduled ? {
            ...view.scheduled,
            effectiveFrom: dateString(view.scheduled.effectiveFrom),
          } : null}
          counts={view.counts}
          compliance={view.compliance}
          today={today.toISOString().slice(0, 10)}
        />
      </div>
    </section>
  );
}
