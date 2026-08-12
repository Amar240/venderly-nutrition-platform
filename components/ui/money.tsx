import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/utils";

/*
 * MoneyDisplay — renders integer cents only (never a float; CLAUDE.md rule 1).
 * Negative -> minus sign + danger colour; positive -> ink, with an optional
 * explicit plus. Tabular numerals so ledger columns align.
 */
export interface MoneyDisplayProps {
  amountCents: number;
  /** Show an explicit "+" on non-negative amounts (e.g. deposits, credits). */
  sign?: boolean;
  className?: string;
}

export function MoneyDisplay({ amountCents, sign = false, className }: MoneyDisplayProps) {
  if (!Number.isInteger(amountCents)) {
    throw new Error(
      `MoneyDisplay requires integer cents, received ${amountCents}`,
    );
  }
  const negative = amountCents < 0;
  const formatted = formatCents(amountCents);
  const text = !negative && sign ? `+${formatted}` : formatted;
  return (
    <span
      className={cn("tabular", negative ? "text-danger" : "text-ink", className)}
    >
      {text}
    </span>
  );
}
