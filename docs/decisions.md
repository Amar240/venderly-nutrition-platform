# Decisions log

Settled decisions. Do not re-open these mid-implementation. If a phase spec appears to conflict with one, stop and ask.

---

## D-1 · Price tier lives in a separate table, not on Student
**Decided:** phase 1 · **Status:** settled

`StudentPricing` (studentId unique, tier, effectiveFrom, source) holds the pricing tier. It is deliberately NOT a field on `Student`.

Why: with a field on `Student`, any query doing `include: { student: true }` risks carrying the tier into a POS or guardian response, so confidentiality would depend on remembering to omit a field every time. A separate table makes the boundary structural — you must deliberately join to get it. Default-safe rather than default-leaky. It also keeps CLAUDE.md rule 9 literally true.

Binding constraints:
- `StudentPricing` is read and written only inside `server/meals/pricing.ts`, plus the guardian household view may read it for the guardian's own verified linked children.
- It must never appear in a POS response, page source, client state, export, report, log line, or audit payload. The guardian view may show the resolved meal cost, never the tier.
- The POS receives a resolved price and an operational result — never a tier.
- Tier changes are audited, because in production this may derive from FRAM data.

A price tier is a pricing input, not an eligibility record. See `open-decisions.md` item 2.

**Amendment (design phase):** the guardian household view is a **second authorised reader**, scoped through the verified guardian-student relationship. A parent must be able to see what their own child's meal costs — a reduced-price family needs to know lunch is $0.40 in order to fund the account. Confidentiality was always about the cashier, other families, and general reports; never about the child's own parent.

Unchanged: no tier in any POS payload, page source, client state, log line, export, or report. The reader list is exactly two — `server/meals` pricing logic, and the guardian's own household query.

## D-2 · PricingConfig uses explicit tier names
**Decided:** phase 1 · **Status:** settled

Six fields — `breakfast{Free,Reduced,Paid}Cents` and `lunch{Free,Reduced,Paid}Cents` — plus `lowBalanceThresholdCents`, `lowBalanceMealsThreshold`, and `cepEnabled`.

Free-tier fields exist even though they default to 0, so pricing is a two-key lookup by (tier, mealType) with no special-case branch.

CEP interaction, settled: when `cepEnabled` is true, breakfast and lunch resolve to $0 for every tier regardless of configured values; a-la-carte still charges normally. This logic lives in `server/meals`, never in a caller.

## D-3 · Presentational components live outside `server/`
**Decided:** phase 1 · **Status:** settled

Shared UI components go in `components/ui/` (shadcn convention). `server/` is domain logic only. The repo layout in CLAUDE.md describes domain modules, not the component tree.

## D-4 · Low-balance threshold is config, not environment
**Decided:** phase 1 · **Status:** settled

The threshold is resolved from `PricingConfig` (school override, then district default) server-side and passed to the UI as a status string. The UI never compares money. `LOW_BALANCE_THRESHOLD_CENTS` in `.env` is obsolete.

**Amendment (design phase):** `PricingConfig` carries **two** thresholds, and which one applies is decided per student by that student's own meal price.

- `lowBalanceMealsThreshold` (default 5) — used when the student's lunch price is greater than zero. Threshold = meals × their lunch price. A single dollar figure is wrong across tiers: $10 is a fortnight for a reduced-price child and three days for a paid one.
- `lowBalanceThresholdCents` — used when the student's lunch price is zero. That covers CEP districts and free-tier students in charging districts, where meals-remaining is undefined and the only balance is à-la-carte.

Key the decision on the student's own meal price, never on the CEP flag, so a free-tier student in a non-CEP district takes the same path. Both values stay configurable; resolution stays server-side.

## D-6 · Ledger entry type names are the phase-1 enum
**Decided:** phase 3 · **Status:** settled

The authoritative names are `DEPOSIT, MEAL_CHARGE, ALACARTE_CHARGE, TRANSFER_DEBIT, TRANSFER_CREDIT, ADJUSTMENT, REFUND, CORRECTION`. Earlier spec prose used `ITEM_SALE`, `TRANSFER_OUT`, and `TRANSFER_IN` — that wording was loose, not a decision. The enum is already migrated with data and referenced across phase 2. `DEBIT`/`CREDIT` is also the correct accounting vocabulary and pairs with the signed `amountCents`. Specs defer to the schema here, not the other way round.

## D-7 · Money-moving writes lock the account row first
**Decided:** phase 3 · **Status:** settled

Any operation that checks a balance and then writes must take a row lock on the account inside the transaction before deriving the balance (`SELECT ... FOR UPDATE`). Read Committed isolation without a lock allows two concurrent operations to both pass a balance check and both write, overdrawing the account.

This is a shared helper. Transfers use it; phase 4's a-la-carte insufficient-balance check must reuse it rather than reimplement the pattern.

Separately, transfers carry an idempotency key (`xfr:<server-issued per-render token>`) stored on the debit row. The lock prevents concurrent overdraw; the key prevents a sequential double-submit moving money twice. They solve different failures and both are required.

## D-8 · Ledger writers outside guardian flows self-guard
**Decided:** phase 4 · **Status:** settled

Any function that writes a `LedgerEntry` and is not part of a guardian's own household flow must take an explicit discriminated actor — `{ kind: "staff", session }` or `{ kind: "system", reason }` — and enforce the required role itself via `requireRole`. The call site guards as well; this is defence in depth, not a replacement.

Applies to `recordAdjustment`, `recordRefund`, and every correction function added later. A money-moving function must refuse to run unguarded, and an unguarded system call must be a deliberate, greppable choice rather than an omission.

Excluded: `recordDeposit` and `recordTransfer`, which already have their own boundary — `requireGuardianOf` at the action layer, and the webhook settling as a system actor with no session.

## D-9 · The append-only trigger is a soft guarantee; privileges are the hard one
**Decided:** phase 4 · **Status:** settled

The Postgres trigger on `LedgerEntry` rejects UPDATE and DELETE unless a transaction-local flag is set. Any connection using the same database role can set that flag, so the trigger prevents accidental mutation and creates evidence of intent — it is not a hard barrier.

Describe it accurately, including to the district: "the database rejects updates and deletes; bypassing it requires deliberately setting a flag." Do not claim mutation is impossible.

The hard control belongs to production (phase 8): revoke UPDATE and DELETE on `LedgerEntry` from the application role entirely, and run migrations under a separate role. Then no application code can escape regardless of session settings.

## D-10 · Duplicate-meal override creates a real second MealEvent
**Decided:** phase 5a · **Status:** settled

`MealEvent` gains `overrideSeq Int @default(0)`; the unique key becomes (studentId, serviceDate, mealType, overrideSeq).

Why a real row rather than an audit-only note: a second meal was actually served, and the record should reflect what happened at the counter. On a paid tier the second serving creates a ledger charge, which would otherwise be an orphaned debit with no meal event explaining it.

Binding constraints:
- `overrideSeq = 0` is the normal POS path. The duplicate guard is unchanged.
- Only an admin action creates `seq > 0`. The POS can never produce one — a cashier hitting a duplicate is told "duplicate" and nothing else.
- `seq > 0` requires a non-empty `overrideReason` and writes an AuditLog entry with actor, student, service date, meal type, and reason.
- **Meal count reports must never silently sum overrides.** Report `seq = 0` as the headline count and overrides as a separate line. A student normally gets one reimbursable meal per day; if a district ever authorizes these counts as an official source, a figure that quietly includes overrides would be a compliance problem. Test that the count query excludes `seq > 0`.

**Amendment (Stage A item 3):** cashier undo retains the normal `MealEvent` and
sets `reversedAt` plus `reversedByUserId`. Live uniqueness is enforced by a
partial index over `(studentId, serviceDate, mealType, overrideSeq)` where
`reversedAt IS NULL`. A later valid entry is therefore another ordinary
`overrideSeq = 0` event, never an administrator override. Every operational and
claim-facing count filters both `overrideSeq = 0` and `reversedAt IS NULL`;
reversed rows remain visible historical evidence and never count.

## D-12 · We never claim a child was absent
**Decided:** stage A · **Status:** settled

We have no attendance source. It is not in the confirmed Infinite Campus export, and OneRoster does not carry attendance. The platform must therefore never display "Not at school today" or otherwise assert why a meal is missing.

Where no meal is recorded, say only what is known — "No lunch recorded" — which makes no claim about the reason. A parent who sees "not at school" for a child who was in school stops trusting everything else on the page.

**Service times are different and are legitimate.** Per-school breakfast and lunch service end times are district configuration, not student data. They make the time-aware wording honest: "No lunch yet" before service ends, "No lunch recorded" after.

**Mechanism:** a server-side resolver returns a status per child per meal — `ate` / `not_yet` / `not_recorded`. The UI renders the status and never compares times or computes state. If the district later supplies an attendance feed, an `absent` status can be added behind the same contract without touching the UI.

**Knock-on:** the welfare signal in `design-spec-07-insights.md` originally read "ate regularly last month, hasn't this week, and is marked present at school." Without attendance the rule is eating pattern alone, which is weaker and more prone to false positives. State it accurately in the UI, and treat attendance as something worth asking the district for — it would materially improve that signal.

## D-5 · Notifications are in-app only for the pilot
**Decided:** phase 1 schema, phase 5 behaviour · **Status:** settled

`Notification` plus `NotificationDelivery` exist from phase 1. Generation logic and `NotificationPort` are phase 5. Nothing is emailed or texted in the pilot; production swaps GoHighLevel in behind the port.

## D-11 · Pilot staff provisioning is a deliberate demo shortcut
**Decided:** phase 5c · **Status:** settled

Super-admin "create staff user" sets the shared demo password (hashed) and generates a TOTP secret shown exactly once at creation — there is no "view secret" screen anywhere. `districtId` always comes from the session, never the form. Staff are DEACTIVATED (`User.disabledAt`), never deleted, because `AuditLog.actorId` references them; deactivation is audited, reversible, and makes authentication fail. Creating or changing a `SUPER_ADMIN` is audited with before/after like any other config change — no special-casing.

This is a demo shortcut, not a production pattern. Production needs an email invite with a set-password link and self-enrolled TOTP — not a shared password and not an admin-visible secret. Phase 8 replaces this flow.

Notification bodies carry money amounts and student names only — never a pricing tier or eligibility category (D-1). Generation goes through `NotificationPort` (in-app pilot; GoHighLevel in phase 8).
