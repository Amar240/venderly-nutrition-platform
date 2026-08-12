import { NextResponse, type NextRequest } from "next/server";
import { signPaymentEvent, type PaymentEvent } from "@/server/ports/paymentSignature";

/**
 * The SIMULATED payment provider's "charge" endpoint. The fake checkout page's
 * Pay button posts here. This stands in for the provider's own backend: it
 * signs a settlement event and delivers it to our webhook server-to-server,
 * then redirects the browser to the return page independently. The browser
 * never carries the credit — only the opaque checkoutId.
 *
 * The event id is deterministic per intent (`evt_<intentId>`) so a replay
 * settles exactly once.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const checkoutId = String(form.get("checkoutId") ?? "").trim();
  if (!checkoutId) {
    return NextResponse.json({ error: "missing_checkout" }, { status: 400 });
  }

  const event: PaymentEvent = {
    id: `evt_${checkoutId}`,
    type: "checkout.settled",
    intentId: checkoutId,
    createdAt: new Date().toISOString(),
  };
  const { body, signature } = signPaymentEvent(event);

  // Deliver the signed event to our webhook (server-to-server).
  await fetch(new URL("/api/payments/webhook", req.nextUrl.origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-payment-signature": signature },
    body,
  }).catch(() => {
    // Delivery failure leaves the intent PENDING; the return page handles it.
  });

  return NextResponse.redirect(
    new URL(`/guardian/deposit/return/${checkoutId}`, req.nextUrl.origin),
    303,
  );
}
