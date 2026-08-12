import { InfoIcon } from "@/components/icons";

/*
 * Persistent prototype banner — required on EVERY layout and surface, including
 * printed/exported output (CLAUDE.md + design-system.md). Exact text is fixed.
 */
export const PROTOTYPE_BANNER_TEXT =
  "PROTOTYPE — SYNTHETIC DATA. Not connected to Infinite Campus, PCS, or live payment processing.";

export function PrototypeBanner() {
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-border bg-warn-wash px-4 py-2 text-center text-sm text-ink"
    >
      <InfoIcon className="shrink-0 text-warn" />
      <span className="font-medium">{PROTOTYPE_BANNER_TEXT}</span>
    </div>
  );
}
