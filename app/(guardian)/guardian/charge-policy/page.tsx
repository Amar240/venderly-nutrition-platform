import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getChargePolicy } from "@/server/policy/chargePolicy";
import { PolicyText } from "@/components/policy/policy-text";

export default async function GuardianChargePolicyPage() {
  const policy = await getChargePolicy(await getAppSession());
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/guardian" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← My household
      </Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Charge policy</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {policy.districtName} shares how meal charges are handled when money is owed.
      </p>
      <div className="mt-6">
        <PolicyText
          text={policy.policyText}
          missingBody="The district has not shared its charge policy here yet. Contact the nutrition office for the current written policy."
        />
      </div>
    </section>
  );
}
