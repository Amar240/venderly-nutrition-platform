import { describe, it, expect, beforeEach } from "vitest";
import {
  computeLockedUntil,
  isLocked,
  ipRateLimited,
  resetIpLimiter,
  IP_MAX_ATTEMPTS,
} from "./rateLimit";

describe("computeLockedUntil (progressive lockout)", () => {
  const now = new Date("2026-08-12T12:00:00Z");

  it("does not lock below the soft threshold", () => {
    expect(computeLockedUntil(0, now)).toBeNull();
    expect(computeLockedUntil(4, now)).toBeNull();
  });

  it("locks 1 minute at 5–7 failures", () => {
    const until = computeLockedUntil(5, now);
    expect(until?.getTime()).toBe(now.getTime() + 60_000);
    expect(computeLockedUntil(7, now)?.getTime()).toBe(now.getTime() + 60_000);
  });

  it("escalates to 5 minutes at 8–9 and 30 minutes at 10+", () => {
    expect(computeLockedUntil(8, now)?.getTime()).toBe(now.getTime() + 5 * 60_000);
    expect(computeLockedUntil(10, now)?.getTime()).toBe(now.getTime() + 30 * 60_000);
    expect(computeLockedUntil(25, now)?.getTime()).toBe(now.getTime() + 30 * 60_000);
  });
});

describe("isLocked", () => {
  const now = new Date("2026-08-12T12:00:00Z");
  it("true only while lockedUntil is in the future", () => {
    expect(isLocked(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLocked(new Date(now.getTime() - 1000), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});

describe("ipRateLimited (sliding window)", () => {
  beforeEach(() => resetIpLimiter());

  it("permits attempts up to the max, then blocks", () => {
    const ip = "203.0.113.7";
    const t0 = 1_000_000;
    for (let i = 1; i <= IP_MAX_ATTEMPTS; i++) {
      expect(ipRateLimited(ip, t0 + i)).toBe(false);
    }
    // One past the max within the window is limited.
    expect(ipRateLimited(ip, t0 + IP_MAX_ATTEMPTS + 1)).toBe(true);
  });

  it("forgets attempts older than the window", () => {
    const ip = "203.0.113.8";
    const t0 = 5_000_000;
    for (let i = 1; i <= IP_MAX_ATTEMPTS; i++) ipRateLimited(ip, t0 + i);
    // Far in the future — old hits have aged out, so not limited.
    expect(ipRateLimited(ip, t0 + 10 * 60_000)).toBe(false);
  });

  it("tracks IPs independently", () => {
    const t0 = 9_000_000;
    for (let i = 1; i <= IP_MAX_ATTEMPTS + 2; i++) ipRateLimited("10.0.0.1", t0 + i);
    expect(ipRateLimited("10.0.0.2", t0 + 1)).toBe(false);
  });
});
