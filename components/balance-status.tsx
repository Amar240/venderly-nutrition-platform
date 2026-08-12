import { AlertTriangleIcon, AlertCircleIcon } from "@/components/icons";
import type { BalanceStatus } from "@/server/household/balance";

/**
 * Presentational balance-status pill. The status is computed server-side; this
 * only renders it (never a bare colour — icon + word, WCAG: not colour-only).
 */
export function BalanceStatusPill({ status }: { status: BalanceStatus }) {
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
