/**
 * Balance status classification — a money rule, computed on the server only.
 * The UI renders the returned status; it never compares balances itself
 * (CLAUDE.md: UI never computes money or eligibility).
 */
export type BalanceStatus = "healthy" | "low" | "negative";

export function classifyBalance(
  balanceCents: number,
  thresholdCents: number,
): BalanceStatus {
  if (balanceCents < 0) return "negative";
  if (balanceCents < thresholdCents) return "low";
  return "healthy";
}
