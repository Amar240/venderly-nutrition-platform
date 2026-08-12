/**
 * Per-cashier sliding-window limiter on student-number attempts (phase-4 spec).
 * Separate budget from auth and payments. In-memory for the pilot; production
 * swaps a shared store.
 */

export const POS_MAX_ATTEMPTS = 60;
export const POS_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function posRateLimited(
  key: string,
  now: number = Date.now(),
  max: number = POS_MAX_ATTEMPTS,
  windowMs: number = POS_WINDOW_MS,
): boolean {
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

export function resetPosLimiter(): void {
  hits.clear();
}
