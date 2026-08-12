import { NextResponse, type NextRequest } from "next/server";
import { verifyPaymentSignature, type PaymentEvent } from "@/server/ports/paymentSignature";
import { paymentPort, PaymentError } from "@/server/ports/payment";
import { webhookRateLimited } from "@/server/ports/paymentRateLimit";

/**
 * Simulated payment provider webhook. This is the ONLY path that credits a
 * deposit to the ledger. It:
 *  - reads NO session and has NO CSRF protection (it is a server-to-server call
 *    from the provider, not a browser form) — settlement is gated by signature,
 *  - verifies the HMAC signature before trusting the body (unsigned/tampered
 *    events are rejected),
 *  - settles idempotently on the provider event id (replays credit nothing),
 *  - is rate-limited on its own budget, separate from auth.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (webhookRateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await req.text();
  if (!verifyPaymentSignature(rawBody, req.headers.get("x-payment-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: PaymentEvent;
  try {
    event = JSON.parse(rawBody) as PaymentEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (event.type !== "checkout.settled" || !event.id || !event.intentId) {
    return NextResponse.json({ error: "bad_event" }, { status: 400 });
  }

  try {
    const result = await paymentPort.settle({ intentId: event.intentId, eventId: event.id });
    return NextResponse.json({ ok: true, alreadySettled: result.alreadySettled });
  } catch (err) {
    if (err instanceof PaymentError && err.code === "INTENT_NOT_FOUND") {
      return NextResponse.json({ error: "unknown_intent" }, { status: 404 });
    }
    throw err;
  }
}
