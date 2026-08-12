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
