import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { getDeliveryLog } from "@/server/notifications/inbox";
import { AuthError } from "@/server/auth/errors";

const TYPE_LABEL: Record<string, string> = {
  LOW_BALANCE: "Low balance",
  DEPOSIT_COMPLETED: "Deposit",
  TRANSFER_COMPLETED: "Transfer",
};

/** Notification delivery log — the "did the parent get told?" trail. */
export default async function DeliveryLogPage() {
  const session = await getAppSession();
  let rows;
  try {
    rows = await getDeliveryLog(session);
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Notification delivery</h1>
      <p className="mt-1 text-sm text-ink-muted">In-app notifications sent to guardians, most recent first.</p>

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">Time</th>
              <th scope="col" className="px-4 py-3 font-medium">Guardian</th>
              <th scope="col" className="px-4 py-3 font-medium">Type</th>
              <th scope="col" className="px-4 py-3 font-medium">Title</th>
              <th scope="col" className="px-4 py-3 font-medium">Delivery</th>
              <th scope="col" className="px-4 py-3 font-medium">Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                  {r.createdAt.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3 text-ink">{r.guardianName}</td>
                <td className="px-4 py-3 text-ink-muted">{TYPE_LABEL[r.type] ?? r.type}</td>
                <td className="px-4 py-3 text-ink">{r.title}</td>
                <td className="px-4 py-3">
                  <span className="rounded-pill bg-success-wash px-2 py-0.5 text-xs text-success">{r.deliveryStatus}</span>
                </td>
                <td className="px-4 py-3 text-ink-muted">{r.readByGuardian ? "Read" : "Unread"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No notifications yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
