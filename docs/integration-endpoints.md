# Integration endpoints — what we connect, and when

## Rule for the pilot: connect nothing
PRD non-goals forbid live Infinite Campus, PCS, GoHighLevel, and payment-provider integrations. Phases 1–7 use fakes only.

To make going live a swap rather than a rewrite, every external system sits behind a port interface in `server/`:

```
server/ports/PaymentPort.ts        createCheckout(), handleProviderEvent()
server/ports/NotificationPort.ts   sendLowBalance(), sendReceipt(), sendTransferConfirm()
server/ports/RosterImportPort.ts   fetchRosterFile()
```
Pilot implementations: `SimulatedPayment`, `ConsoleNotification`, `LocalFileRoster`.
Production implementations: `StripePayment`, `GoHighLevelNotification`, `SftpRoster`.
Nothing outside `server/ports/` may import a vendor SDK.

---

## 1. Payments — Stripe (production)
Docs: https://docs.stripe.com/api · Checkout Sessions · webhook events

**Do not use Payment Links here.** Payment Links are static, shareable, fixed-amount URLs — right for a fixed subscription, wrong for "deposit $23.50 split across two children." Use Checkout Sessions created per deposit.

| Direction | Endpoint / event | Purpose |
|---|---|---|
| Outbound | `POST /v1/checkout/sessions` | Create a hosted checkout for one deposit intent. Carry our `depositIntentId` in `client_reference_id` and `metadata`. |
| Inbound | webhook `checkout.session.completed` | The only proof of payment. Verify the Stripe signature server-side, then create exactly one ledger credit keyed to the Stripe event id. |
| Inbound | `charge.refunded` / `charge.dispute.created` | Create offsetting ledger entries; never edit history. |
| Outbound | `GET /v1/checkout/sessions/:id` | Reconciliation fallback if a webhook is missed. |

Rules: card data never touches our servers; a replayed webhook must be a no-op (unique constraint on the event id); a client-side "success" redirect updates the UI but never the ledger.

## 2. Notifications — GoHighLevel (production, optional)
Docs: https://marketplace.gohighlevel.com/docs · API base `https://services.leadconnectorhq.com`

Auth: two paths — Marketplace App with OAuth 2.0 (for public distribution) or a Private Integration Token (internal tooling). For Venderly operating its own sub-accounts, the Private Integration Token is the simpler and likely correct route. An app must be registered in the Marketplace Developer Portal before any call works.

| Direction | Endpoint area | Purpose |
|---|---|---|
| Outbound | Contacts | Upsert a guardian as a contact for messaging |
| Outbound | Conversations | Send low-balance alerts, deposit receipts, transfer confirmations |
| Outbound | Locations | Sub-account provisioning, if Venderly provisions per district |
| Inbound | Webhooks | Delivery/bounce status, unsubscribe handling |

Hard boundary: GHL is a notification channel, never a system of record. No balances, no ledger, no eligibility, no meal history stored there. Message bodies carry the least detail that still works — prefer "your child's meal account needs attention, sign in to view" over embedding amounts.

## 3. Roster — Infinite Campus (production)
Two possible paths. Both sit behind `RosterImportPort`, so the choice is a production swap, not a redesign.

**Path A — file exchange (confirmed model, what we build).** One scheduled CSV export, 9 headers, see `phase-6-import.md`. Production wiring: district drops the file into AWS Transfer Family (SFTP) → lands in the encrypted S3 bucket → EventBridge triggers the same validate-then-upsert pipeline the pilot uses.

**Path B — OneRoster API (probable, needs district action).** Infinite Campus supports OneRoster 1.1 with OAuth 2.0; districts obtain credentials through their Infinite Campus representative. If enabled it would replace the file drop and may also carry guardian associations, which the flat CSV does not. The district has to request this — Venderly cannot.

Either way, Infinite Campus stays authoritative. Nothing is ever written back to it.

## 4. Endpoints we expose
| Route | Caller | Notes |
|---|---|---|
| `POST /api/webhooks/payment` | Stripe | Signature-verified, idempotent, no auth session |
| `POST /api/webhooks/ghl` | GoHighLevel | Signature-verified, delivery status only |
| everything else | our own UI | Session + RBAC enforced |

Both webhook routes must be excluded from CSRF/session middleware and rate-limited separately.

---

## Go-live sequence (after district approval, not before)
1. Data agreement, privacy, retention, and security review signed.
2. Merchant of record decided and the Stripe account structure confirmed (see open decisions).
3. Stripe test mode wired end-to-end; replay and refund cases tested.
4. GHL app registered; notification templates approved by the district; minimal payload confirmed.
5. Secure file exchange agreed with district IT; first real roster import run in a staging environment.
6. MFA, monitoring, backups, alerting, and incident runbook in place.
7. Only then: production keys, real data, prototype labels removed.

## Standing risk — who holds the money
If the Stripe relationship sits inside GoHighLevel (as it does on Venderly's other properties), parents' meal deposits would settle into a Venderly-controlled account before reaching the district. A school district finance office will ask about this, and it is not a technical detail. Resolve before writing any payment code. See `open-decisions.md`.
