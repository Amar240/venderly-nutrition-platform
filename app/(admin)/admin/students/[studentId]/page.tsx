import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getStudentAdminDetail } from "@/server/directory/adminStudents";
import { AuthError } from "@/server/auth/errors";
import { MoneyDisplay } from "@/components/ui/money";
import { formatCents } from "@/lib/utils";
import { CorrectionsPanel } from "./corrections-panel";

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  MEAL_CHARGE: "Meal",
  ALACARTE_CHARGE: "A-la-carte",
  TRANSFER_DEBIT: "Transfer out",
  TRANSFER_CREDIT: "Transfer in",
  ADJUSTMENT: "Adjustment",
  REFUND: "Refund",
  CORRECTION: "Correction",
};

const REFUNDABLE = new Set(["DEPOSIT", "MEAL_CHARGE", "ALACARTE_CHARGE", "TRANSFER_CREDIT", "TRANSFER_DEBIT"]);

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function StudentDetailPage({ params }: { params: { studentId: string } }) {
  const session = await getAppSession();
  let detail;
  try {
    detail = await getStudentAdminDetail(session, params.studentId);
  } catch (err) {
    if (err instanceof AuthError) notFound(); // out of scope — don't reveal existence
    throw err;
  }
  if (!detail) notFound();

  const shortId = (id: string) => id.slice(-6);
  const refundable = detail.history
    .filter((e) => REFUNDABLE.has(e.type))
    .map((e) => ({ id: e.id, label: `${TYPE_LABEL[e.type]} ${formatCents(e.amountCents)} · ${fmtDate(e.createdAt)}` }));

  return (
    <section className="space-y-6">
      <div>
        <Link href="/admin/students" className="text-sm text-ink-muted hover:text-ink">
          ← Back to search
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-ink">
              {detail.firstName} {detail.lastName}
            </h1>
            <p className="text-sm text-ink-muted">
              #{detail.studentNumber} · Grade {detail.grade} · {detail.schoolName} · {detail.enrollmentStatus}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-muted">Balance (from ledger)</div>
            <div className="text-2xl">
              <MoneyDisplay amountCents={detail.balanceCents} />
            </div>
          </div>
        </div>
      </div>

      {detail.canCorrect && <CorrectionsPanel studentId={detail.id} refundable={refundable} />}

      {/* Ledger history — original and corrective activity side by side. */}
      <Panel title="Ledger history">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-2 font-medium">Date</th>
              <th scope="col" className="px-4 py-2 font-medium">Activity</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="px-4 py-2 font-medium">Corrects</th>
            </tr>
          </thead>
          <tbody>
            {[...detail.history].reverse().map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{fmtDate(e.createdAt)}</td>
                <td className="px-4 py-2 text-ink">
                  {TYPE_LABEL[e.type] ?? e.type}
                  <span className="block text-xs text-ink-muted">{e.description}</span>
                </td>
                <td className="px-4 py-2 text-right"><MoneyDisplay amountCents={e.amountCents} sign /></td>
                <td className="px-4 py-2 text-xs text-ink-muted">
                  {e.correctsEntryId ? `#${shortId(e.correctsEntryId)}` : "—"}
                </td>
              </tr>
            ))}
            {detail.history.length === 0 && <Empty span={4} />}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Meals">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th scope="col" className="px-4 py-2 font-medium">Date</th>
                <th scope="col" className="px-4 py-2 font-medium">Meal</th>
              </tr>
            </thead>
            <tbody>
              {detail.mealEvents.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{fmtDate(m.serviceDate)}</td>
                  <td className="px-4 py-2 text-ink">
                    {m.mealType === "BREAKFAST" ? "Breakfast" : "Lunch"}
                    {m.overrideSeq > 0 && (
                      <span className="ml-2 rounded-pill bg-warn-wash px-2 py-0.5 text-xs text-warn">
                        Override
                      </span>
                    )}
                    {m.overrideReason && <span className="block text-xs text-ink-muted">{m.overrideReason}</span>}
                  </td>
                </tr>
              ))}
              {detail.mealEvents.length === 0 && <Empty span={2} />}
            </tbody>
          </table>
        </Panel>

        <Panel title="A-la-carte sales">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th scope="col" className="px-4 py-2 font-medium">Date</th>
                <th scope="col" className="px-4 py-2 font-medium">Item</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {detail.itemSales.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{fmtDate(s.createdAt)}</td>
                  <td className="px-4 py-2 text-ink">{s.itemName}</td>
                  <td className="px-4 py-2 text-right"><MoneyDisplay amountCents={s.priceCentsAtSale} /></td>
                </tr>
              ))}
              {detail.itemSales.length === 0 && <Empty span={3} />}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Guardians">
          <ul className="divide-y divide-border">
            {detail.guardians.map((g) => (
              <li key={g.email} className="px-4 py-2">
                <div className="text-ink">{g.name}</div>
                <div className="text-xs text-ink-muted">{g.email}{g.relationship ? ` · ${g.relationship}` : ""}</div>
              </li>
            ))}
            {detail.guardians.length === 0 && <li className="px-4 py-3 text-ink-muted">No linked guardians.</li>}
          </ul>
        </Panel>

        <Panel title="Audit history">
          <ul className="divide-y divide-border">
            {detail.audit.map((a) => (
              <li key={a.id} className="px-4 py-2">
                <div className="text-ink">{a.action}</div>
                <div className="text-xs text-ink-muted">
                  {fmtDate(a.createdAt)} · {a.actorType}
                  {a.reason ? ` · ${a.reason}` : ""}
                </div>
              </li>
            ))}
            {detail.audit.length === 0 && <li className="px-4 py-3 text-ink-muted">No audit entries.</li>}
          </ul>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ span }: { span: number }) {
  return (
    <tr>
      <td colSpan={span} className="px-4 py-6 text-center text-ink-muted">
        No records yet. New activity will appear here after it is recorded.
      </td>
    </tr>
  );
}
