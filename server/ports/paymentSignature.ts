import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed-style events for the SIMULATED payment provider (CLAUDE.md rule 12).
 * The fake provider signs an event with PAYMENT_SIM_SECRET; the webhook verifies
 * the signature before trusting anything. In phase 8 a real provider (Stripe)
 * swaps in behind PaymentPort and this file is replaced by its signature scheme.
 */

export interface PaymentEvent {
  /** Provider event id — deterministic per intent so replays settle once. */
  id: string;
  type: "checkout.settled";
  intentId: string;
  createdAt: string;
}

const SIGNATURE_PREFIX = "sha256=";

function secret(): string {
  const s = process.env.PAYMENT_SIM_SECRET;
  if (!s) throw new Error("PAYMENT_SIM_SECRET is not set");
  return s;
}

function hmacHex(rawBody: string): string {
  return createHmac("sha256", secret()).update(rawBody).digest("hex");
}

/** Serialize + sign an event. Returns the exact bytes to POST and the header. */
export function signPaymentEvent(event: PaymentEvent): {
  body: string;
  signature: string;
} {
  const body = JSON.stringify(event);
  return { body, signature: `${SIGNATURE_PREFIX}${hmacHex(body)}` };
}

/**
 * Verify a signature header against the raw body using a timing-safe compare.
 * Returns false for a missing, malformed, or mismatched signature — the webhook
 * treats any false as a hard reject.
 */
export function verifyPaymentSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;
  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = hmacHex(rawBody);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
