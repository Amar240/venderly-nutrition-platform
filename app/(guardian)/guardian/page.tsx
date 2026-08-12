import { getAppSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { resolveLowBalanceThresholdCents } from "@/server/pricing/config";
import { classifyBalance, type BalanceStatus } from "@/server/household/balance";
import { MoneyDisplay } from "@/components/ui/money";
import { AlertTriangleIcon, AlertCircleIcon } from "@/components/icons";

/**
 * Guardian household view. Students are reached ONLY through the verified
 * GuardianStudent link — never an open lookup (CLAUDE.md rule 7). Eligibility /
 * price tier is never queried or shown here. Balance status is computed on the
 * server (thresholds come from PricingConfig); the UI only renders it.
 */
export default async function GuardianHomePage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "guardian") return null;

  const links = await prisma.guardianStudent.findMany({
    where: { guardianId: session.guardianId },
    include: { student: { include: { account: true, school: true } } },
    orderBy: { student: { lastName: "asc" } },
  });

  // Resolve the low-balance threshold per school (cached), then classify.
  const thresholdCache = new Map<string, number>();
  const rows = await Promise.all(
    links.map(async ({ id, student }) => {
      const balance = student.account?.balanceCents ?? 0;
      let threshold = thresholdCache.get(student.schoolId);
      if (threshold === undefined) {
        threshold = await resolveLowBalanceThresholdCents(
          student.districtId,
          student.schoolId,
        );
        thresholdCache.set(student.schoolId, threshold);
      }
      return {
        id,
        student,
        balance,
        status: classifyBalance(balance, threshold),
      };
    }),
  );

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">My household</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Balances and activity for your linked children.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {rows.map(({ id, student, balance, status }) => (
          <article
            key={id}
            className="rounded-card border border-border bg-surface-card p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-ink">
                  {student.firstName} {student.lastName}
                </h2>
                <p className="text-sm text-ink-muted">
                  Grade {student.grade} · {student.school.name}
                </p>
              </div>
              <BalanceStatusPill status={status} />
            </div>
            <div className="mt-4">
              <div className="text-xs text-ink-muted">Balance</div>
              <div className="text-2xl">
                <MoneyDisplay amountCents={balance} />
              </div>
            </div>
          </article>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-ink-muted">
            No linked children on this account yet.
          </p>
        )}
      </div>
    </section>
  );
}

function BalanceStatusPill({ status }: { status: BalanceStatus }) {
  if (status === "negative") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-danger-wash px-3 py-1 text-xs font-medium text-danger">
        <AlertCircleIcon /> Negative
      </span>
    );
  }
  if (status === "low") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-warn-wash px-3 py-1 text-xs font-medium text-warn">
        <AlertTriangleIcon /> Low balance
      </span>
    );
  }
  return null;
}
