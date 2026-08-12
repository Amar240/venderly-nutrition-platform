import { getAppSession } from "@/server/auth/session";
import { getInbox } from "@/server/notifications/inbox";
import { Button } from "@/components/ui/button";
import { markInboxReadAction } from "./actions";

/** Guardian inbox — in-app notifications (deposits, transfers, low balance). */
export default async function InboxPage() {
  const session = await getAppSession();
  const notifications = await getInbox(session);
  const hasUnread = notifications.some((n) => n.readAt === null);

  return (
    <section className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Inbox</h1>
          <p className="mt-1 text-sm text-ink-muted">Updates about your household&apos;s balances.</p>
        </div>
        {hasUnread && (
          <form action={markInboxReadAction}>
            <Button type="submit" variant="secondary">Mark all read</Button>
          </form>
        )}
      </div>

      <ul className="mt-6 space-y-2">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`rounded-card border border-border p-4 ${n.readAt === null ? "bg-brand-wash" : "bg-surface-card"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{n.title}</div>
                <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
              </div>
              <time className="whitespace-nowrap text-xs text-ink-muted">
                {n.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </time>
            </div>
          </li>
        ))}
        {notifications.length === 0 && (
          <li className="rounded-card border border-border bg-surface-card p-6 text-center text-sm text-ink-muted">
            No notifications yet.
          </li>
        )}
      </ul>
    </section>
  );
}
