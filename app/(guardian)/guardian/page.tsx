import { getAppSession } from "@/server/auth/session";
import { getHousehold } from "@/server/household/household";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "@/components/icons";
import type { MealType } from "@prisma/client";

/**
 * Guardian household dashboard. Children are reached ONLY through the verified
 * GuardianStudent link (getHousehold enforces it). Balances and status are
 * computed server-side; the UI just renders them. No eligibility / price tier.
 */
function StatusIcon({ state }: { state: "ate" | "not_yet" | "not_recorded" }) {
  if (state === "ate") return <CheckCircleIcon className="mt-0.5 shrink-0 text-success" />;
  if (state === "not_yet") return <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" />;
  return <AlertTriangleIcon className="mt-0.5 shrink-0 text-warn" />;
}

function mealOrder(mealType: MealType) {
  return mealType === "BREAKFAST" ? 0 : 1;
}

export default async function GuardianHomePage() {
  const session = await getAppSession();
  const household = await getHousehold(session);
  const canTransfer = household.length >= 2;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">My household</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Balances and activity for your linked children.
          </p>
        </div>
        <div className="flex gap-2">
          {canTransfer && (
            <LinkButton href="/guardian/transfer" variant="secondary">
              Transfer
            </LinkButton>
          )}
          <LinkButton href="/guardian/deposit">Add money</LinkButton>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {household.map((child) => (
          <article
            key={child.linkId}
            aria-labelledby={`child-${child.studentId}`}
            className="rounded-card border border-border bg-surface-card p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`child-${child.studentId}`} className="text-lg font-medium text-ink">
                  {child.firstName} {child.lastName}
                </h2>
                <p className="text-sm text-ink-muted">
                  Grade {child.grade} · {child.schoolName}
                </p>
              </div>
            </div>

            <ul className="mt-5 space-y-2 text-[18px] leading-7 text-ink">
              {[...child.todayMeals].sort((a, b) => mealOrder(a.mealType) - mealOrder(b.mealType)).map((meal) => (
                <li key={meal.mealType} className="flex gap-2">
                  <StatusIcon state={meal.state} />
                  <span>{meal.label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 space-y-1">
              <p className="text-[18px] font-medium leading-7 text-ink">{child.mealCoverageText}</p>
              <p className="text-[18px] leading-7 text-ink-muted">{child.moneyText}</p>
            </div>

            {(child.pattern || child.warnings.length > 0) && (
              <div className="mt-5 space-y-2">
                {child.pattern && (
                  <p className="flex gap-2 rounded-control bg-brand-wash p-3 text-sm text-ink">
                    <InfoIcon className="mt-0.5 shrink-0 text-brand" />
                    <span>{child.pattern.line}</span>
                  </p>
                )}
                {child.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="flex gap-2 rounded-control bg-warn-wash p-3 text-sm text-ink"
                  >
                    {warning.includes("still be served") || warning.includes("free every day") ? (
                      <InfoIcon className="mt-0.5 shrink-0 text-warn" />
                    ) : child.status === "negative" ? (
                      <AlertCircleIcon className="mt-0.5 shrink-0 text-danger" />
                    ) : (
                      <AlertTriangleIcon className="mt-0.5 shrink-0 text-warn" />
                    )}
                    <span>{warning}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <LinkButton
                href={`/guardian/child/${child.studentId}`}
                variant="secondary"
                className="min-h-touch"
              >
                View activity
              </LinkButton>
              <LinkButton
                href="/guardian/deposit"
                aria-label={`Add money for ${child.firstName} ${child.lastName}`}
                className="min-h-touch"
              >
                Add money
              </LinkButton>
            </div>
          </article>
        ))}
        {household.length === 0 && (
          <EmptyState
            title="No linked children yet"
            body="This guardian login is active, but no students are linked to it. Ask an admin to verify the household link, then refresh this page."
            className="sm:col-span-2"
          />
        )}
      </div>
    </section>
  );
}
