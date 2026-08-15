import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getChargePolicy } from "@/server/policy/chargePolicy";
import { PolicyText } from "@/components/policy/policy-text";

export default async function PosChargePolicyPage() {
  const policy = await getChargePolicy(await getAppSession());
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/pos" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Serving line
      </Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Charge policy</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Read-only district wording for staff who need to answer family questions.
      </p>
      <div className="mt-6">
        <PolicyText
          text={policy.policyText}
          missingBody="The district has not shared its charge policy here yet. Ask the nutrition office for the current written policy."
        />
      </div>
    </section>
  );
}
