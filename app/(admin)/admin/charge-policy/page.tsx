import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getChargePolicy } from "@/server/policy/chargePolicy";
import { PolicyText } from "@/components/policy/policy-text";
import { ChargePolicyForm } from "./charge-policy-form";

export default async function AdminChargePolicyPage() {
  const session = await getAppSession();
  const policy = await getChargePolicy(session);
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/admin" className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Overview
      </Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Charge policy</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {policy.districtName} controls this wording. Families see the same text in the guardian portal.
      </p>

      <div className="mt-6">
        {policy.canEdit ? (
          <ChargePolicyForm initialText={policy.policyText} />
        ) : (
          <PolicyText
            text={policy.policyText}
            missingBody="The district has not shared its charge policy here yet. Ask the nutrition office for the current written policy."
          />
        )}
      </div>
    </section>
  );
}
