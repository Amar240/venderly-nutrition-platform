/**
 * Sign-in protection (phase-1 spec + PRD NFR "Security").
 *
 * Two layers:
 *  - Per-account progressive lockout — persisted on User/Guardian
 *    (failedLoginCount + lockedUntil). Pure math here, applied by the
 *    Auth.js authorize() flow.
 *  - Per-IP sliding window — in-memory for the pilot. Production swaps this
 *    for a shared store (Redis); noted deliberately.
 */

// --- Per-account progressive lockout (pure, unit-tested) -------------------

/** Failures before any lock is applied. */
export const FAIL_SOFT_THRESHOLD = 5;

/**
 * Escalating lock duration for a given cumulative failure count.
 * Returns the lockedUntil instant, or null if not yet locked.
 */
export function computeLockedUntil(
  failedLoginCount: number,
  now: Date = new Date(),
): Date | null {
  let minutes = 0;
  if (failedLoginCount >= 10) minutes = 30;
  else if (failedLoginCount >= 8) minutes = 5;
  else if (failedLoginCount >= FAIL_SOFT_THRESHOLD) minutes = 1;
  if (minutes === 0) return null;
  return new Date(now.getTime() + minutes * 60_000);
}

export function isLocked(
  lockedUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

// --- Per-IP sliding window (in-memory; pilot only) -------------------------

export const IP_MAX_ATTEMPTS = 15;
export const IP_WINDOW_MS = 5 * 60_000;

const ipHits = new Map<string, number[]>();

/**
 * Record an attempt from an IP and report whether it is now rate-limited.
 * Returns true when the caller should reject before checking credentials.
 */
export function ipRateLimited(
  ip: string,
  now: number = Date.now(),
  max: number = IP_MAX_ATTEMPTS,
  windowMs: number = IP_WINDOW_MS,
): boolean {
  const cutoff = now - windowMs;
  const hits = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > max;
}

/** Test/maintenance helper. */
export function resetIpLimiter(): void {
  ipHits.clear();
}
