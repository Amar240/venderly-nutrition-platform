/**
 * Dedicated per-IP sliding-window limiter for the payment webhook — kept
 * SEPARATE from the auth limiter so payment traffic and login traffic never
 * share a budget. In-memory for the pilot; production swaps a shared store.
 */

export const WEBHOOK_MAX_HITS = 30;
export const WEBHOOK_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function webhookRateLimited(
  ip: string,
  now: number = Date.now(),
  max: number = WEBHOOK_MAX_HITS,
  windowMs: number = WEBHOOK_WINDOW_MS,
): boolean {
  const cutoff = now - windowMs;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

export function resetWebhookLimiter(): void {
  hits.clear();
}
