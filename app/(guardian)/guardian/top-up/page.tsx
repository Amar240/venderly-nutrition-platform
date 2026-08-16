import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { getAutomaticTopUpRules } from "@/server/household/autoTopUp";
import { TopUpManager } from "./top-up-manager";

export default async function AutomaticTopUpPage() {
  const session = await getAppSession();
  const [household, rules] = await Promise.all([
    getHousehold(session),
    getAutomaticTopUpRules(session),
  ]);

  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/guardian" className="text-sm text-ink-muted hover:text-ink">
        ← Back to household
      </Link>
      <h1 className="mt-4 text-2xl font-medium text-ink">Automatic top-up</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Choose when money should be added for each child, how much to add, and
        the monthly limit you want.
      </p>

      <div className="mt-6">
        <TopUpManager
          students={household.map((child) => ({
            studentId: child.studentId,
            name: `${child.firstName} ${child.lastName}`,
            schoolName: child.schoolName,
            lunchPriceCents: child.lunchPriceCents,
          }))}
          rules={rules}
        />
      </div>
    </section>
  );
}
