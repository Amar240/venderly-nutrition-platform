# Decisions log

Settled decisions. Do not re-open these mid-implementation. If a phase spec appears to conflict with one, stop and ask.

---

## D-1 · Price tier lives in a separate table, not on Student
**Decided:** phase 1 · **Status:** settled

`StudentPricing` (studentId unique, tier, effectiveFrom, source) holds the pricing tier. It is deliberately NOT a field on `Student`.

Why: with a field on `Student`, any query doing `include: { student: true }` risks carrying the tier into a POS or guardian response, so confidentiality would depend on remembering to omit a field every time. A separate table makes the boundary structural — you must deliberately join to get it. Default-safe rather than default-leaky. It also keeps CLAUDE.md rule 9 literally true.

Binding constraints:
- `StudentPricing` is read and written ONLY inside `server/meals/pricing.ts`.
- It must never appear in a POS or guardian query, response, log line, or audit payload.
- The POS receives a resolved price and an operational result — never a tier.
- Tier changes are audited, because in production this may derive from FRAM data.

A price tier is a pricing input, not an eligibility record. See `open-decisions.md` item 2.

## D-2 · PricingConfig uses explicit tier names
**Decided:** phase 1 · **Status:** settled

Six fields — `breakfast{Free,Reduced,Paid}Cents` and `lunch{Free,Reduced,Paid}Cents` — plus `lowBalanceThresholdCents` and `cepEnabled`.

Free-tier fields exist even though they default to 0, so pricing is a two-key lookup by (tier, mealType) with no special-case branch.

CEP interaction, settled: when `cepEnabled` is true, breakfast and lunch resolve to $0 for every tier regardless of configured values; a-la-carte still charges normally. This logic lives in `server/meals`, never in a caller.

## D-3 · Presentational components live outside `server/`
**Decided:** phase 1 · **Status:** settled

Shared UI components go in `components/ui/` (shadcn convention). `server/` is domain logic only. The repo layout in CLAUDE.md describes domain modules, not the component tree.

## D-4 · Low-balance threshold is config, not environment
**Decided:** phase 1 · **Status:** settled

The threshold is resolved from `PricingConfig` (school override, then district default) server-side and passed to the UI as a status string. The UI never compares money. `LOW_BALANCE_THRESHOLD_CENTS` in `.env` is obsolete.

## D-5 · Notifications are in-app only for the pilot
**Decided:** phase 1 schema, phase 5 behaviour · **Status:** settled

`Notification` plus `NotificationDelivery` exist from phase 1. Generation logic and `NotificationPort` are phase 5. Nothing is emailed or texted in the pilot; production swaps GoHighLevel in behind the port.
