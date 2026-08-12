import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format integer cents as a plain USD string, e.g. 1234 -> "$12.34". */
export function formatCents(amountCents: number): string {
  const negative = amountCents < 0;
  const abs = Math.abs(amountCents);
  const dollars = Math.floor(abs / 100);
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars.toLocaleString()}.${cents}`;
}

/**
 * Parse a user-entered dollar string to integer cents WITHOUT floating point
 * (CLAUDE.md rule 1). Accepts "25", "25.5", "25.50", "$1,234.00". Returns null
 * for anything else (empty, negative, >2 decimals, non-numeric). Zod schemas
 * layer the "must be positive" rule on top; this only does exact conversion.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
