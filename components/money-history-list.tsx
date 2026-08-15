import { CheckCircleIcon, InfoIcon } from "@/components/icons";
import { MoneyDisplay } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import type { MoneyHistoryItem } from "@/server/ledger/moneyHistory";

function historyDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MoneyHistoryList({
  items,
  showRunningBalance = false,
}: {
  items: MoneyHistoryItem[];
  showRunningBalance?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-ink-muted">
        Nothing has happened on this account yet. Money added and meals taken will show here.
      </div>
    );
  }

  return (
    <ol className="divide-y divide-border" aria-label="Money history">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "px-4 py-4",
            item.correctedAbove && "bg-surface-muted text-ink-muted",
          )}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(7rem,auto)_1fr_auto] sm:items-start">
            <time className="text-sm text-ink-muted" dateTime={item.createdAt.toISOString()}>
              {historyDate(item.createdAt)}
            </time>
            <div className="min-w-0">
              <p className={cn("text-sm leading-6 text-ink", item.correctedAbove && "text-ink-muted")}>
                {item.activity}
              </p>
              {item.connection && (
                <p className="mt-2 flex items-start gap-2 rounded-control bg-brand-wash px-3 py-2 text-sm text-ink-muted">
                  <InfoIcon className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <span>{item.connection}</span>
                </p>
              )}
              {item.correctedAbove && (
                <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                  <CheckCircleIcon className="shrink-0 text-success" aria-hidden />
                  <span>Corrected above.</span>
                </p>
              )}
            </div>
            <div className="text-left sm:text-right">
              <MoneyDisplay
                amountCents={item.amountCents}
                sign
                className={cn(
                  "tabular",
                  item.amountDirection === "in" && "text-success",
                  item.amountDirection === "out" && "text-ink",
                )}
              />
              {showRunningBalance && typeof item.runningBalanceCents === "number" && (
                <div className="mt-1 text-xs text-ink-muted">
                  Snack money <MoneyDisplay amountCents={item.runningBalanceCents} />
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
