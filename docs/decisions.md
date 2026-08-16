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

Unchanged: no tier in any POS payload, page source, client state, log line, export, or report.

**Second amendment (stage C, pricing configuration):** the pricing configuration screen is a **third authorised reader**, for **district-wide aggregate counts by category only** — "1,768 free, 218 reduced, 734 paid" — shown to `DISTRICT_ADMIN` and above.

Why this is not a loosening: the district determines these categories; it is their own data. An administrator setting six prices without knowing how many students each affects is configuring blind. Same shape as the guardian amendment — a legitimate reader with a real need.

Binding constraints on this reader:
- **District-wide totals only. Never a per-school breakdown.** At demo scale S.C.O.P.E. North holds roughly two students; a per-school category count there would effectively identify a child. This is the small-cell disclosure problem education data rules exist to prevent, and it would be easy to add later without noticing it.
- Counts only. No student identities, no drill-through from a count to a list, ever.
- Confined to the pricing configuration screen. Not exports, not general reports, not logs, not audit payloads.

**The reader list is now exactly three, and that is where it stops.** Both amendments were justified by a real need. A fourth reader requires genuine scrutiny, not another amendment by momentum — past three, the rule stops meaning anything.

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

## D-13 · Classroom is a separate, admin-maintained record — not a Student field, not an import column
**Decided:** stage B · **Status:** settled

Roster mode (`design-spec-01-cafeteria.md` §1.2) needs "which class is this student in." Homeroom/teacher assignment is not in the confirmed Infinite Campus export (the nine columns in CLAUDE.md) and not in OneRoster either — the same gap D-12 hit with attendance. Extending the importer to expect a class column would build the pilot around a field the real integration doesn't supply, and the problem would just resurface at phase 8.

A plain string field on `Student` was also rejected: a teacher name typed per student invites drift ("Ms. Garcia" vs "Ms Garcia" vs "Garcia") with no single place to rename a class or see its roster.

**Decision:** a new `Classroom` model — `id`, `teacherName`, `schoolId`, `grade` (optional), `active` — with a nullable `classroomId` on `Student`. Not a join table: a student has at most one current classroom, so a direct foreign key is the right level of complexity; revisit only if mid-year reassignment history ever matters. Maintained through its own admin screen ("Manage classes": create a class, assign or reassign students), independent of the CSV importer. Same reasoning as D-1's separate `StudentPricing` table: something with its own lifecycle gets its own table rather than a field bolted onto Student. `active` follows the same soft-delete convention as `Student.enrollmentStatus` (rule 10) — a retired classroom is deactivated, never deleted, since students remain linked to it historically.

Binding constraints:
- A student's `classroomId` must reference a classroom at their own school.
- Only the Early Childhood Center and elementary need this in the pilot. Other schools leave `classroomId` null and keep using numeric entry.
- A student missing a `classroomId` at a roster-mode school is a data problem to surface to an admin, not a silent gap — roster mode shows them as unassigned rather than omitting them.
- Reassigning a student's classroom is audited (it affects where a meal gets recorded), but it is not sensitive data — no confidentiality boundary like D-1's is needed.
- Creating, deactivating, and assigning students to a classroom requires `SCHOOL_STAFF` or above, scoped the same way the role already is: school staff act only within their own school, district admin reaches any school in their district. This sits with the front-office actions in `design-spec-02`, not with rare district-level config like D-2's pricing screen — it's a same-day operational task, not a financial change.
- If the student-list upload moves a student to a different school and they hold a `classroomId` at their prior school, the import clears it to null in the same transaction and records it in the import's audit trail (prior classroom noted, reason: school change). The student then appears as unassigned in roster mode at their new school if it is a roster-mode school, visible to front-office staff to fix — never silently dropped, and the upload is never rejected over it.
- Deactivating a classroom does not clear the `classroomId` of students linked to it, and does not block deactivation. Roster mode resolves status at read time by checking whether the linked classroom is still active: a student in a deactivated classroom appears as needing class assignment — the same unassigned treatment a null `classroomId` gets — never grouped under the retired classroom and never silently hidden. No separate audit event is needed here; deactivating the classroom is already the audited action.
- The importer is untouched. Classes and assignments are seeded directly in `prisma/seed-data.ts` for the pilot. If Infinite Campus later confirms where class data lives, phase 8 can extend the importer to populate `Classroom` and `Student.classroomId` — the schema doesn't need to change, only the importer.

## D-14 · The state attendance factor is a seeded district field, not a new settings screen
**Decided:** stage B · **Status:** settled

The edit check (`design-spec-05-claims-and-compliance.md`) needs a state-supplied attendance factor to compute the enrollment-based ceiling. Like `identifiedStudentPercentageBps` (the CEP percentage), it is external, district-scoped, precise config — not something derived from data we hold, and not something we can compute (D-12: we have no attendance data at all).

**Decision:** add it to `District` as an integer basis-points field, same shape and same precedent as `identifiedStudentPercentageBps` — which also has no admin edit screen today, only schema, seed, and migration. Give the attendance factor the same treatment rather than building a one-off settings UI for it now: that would leave one compliance number editable and another not, for no real reason, and would be scope creep on the edit-check item.

**Open follow-up:** neither number has an admin UI yet. When a district-settings screen gets built (Stage C's pricing config screen is the natural place, or a dedicated compliance-settings screen), it should cover both `identifiedStudentPercentageBps` and the attendance factor together, not just whichever one prompted it. Noting this now so it isn't lost.

**Seeded value and rounding (researched, not assumed):** no Delaware-specific published attendance factor was found in Delaware DOE's public School Nutrition Program materials. Seed the FNS national default instead — 9380 basis points (93.8%), unchanged since SY 2011-12, the federal fallback under 7 CFR 210.8 when no state or local factor has been developed. Do not label it as Delaware's factor in code, seed comments, or on screen — label it as the federal default, and the edit-check report must carry a visible note that the district should confirm whether Delaware or Woodbridge has its own locally-approved factor to use instead. Same honesty boundary as `TRUST_COPY.claimFigures`.

Ceiling = enrollment × attendance factor, rounded **down** to the nearest whole meal, per category. The ceiling is a maximum threshold used to flag over-claiming; rounding up would inflate it and let over-claims slip through undetected. This is a reasoned default, not a cited federal rounding rule — no explicit rounding instruction was found in the sources checked, so flag it as reviewable if the district's own auditor uses a different convention.

## D-15 · Moving a charge between two students is two independent outcomes, not one all-or-nothing correction
**Decided:** stage B · **Status:** settled

When a snack charge was applied to the wrong student, fixing it has two halves: refund the student who was wrongly charged (A), and charge the student who should have been charged (B). B's charge is subject to the same rule enforced at the register — a-la-carte is denied if it would take a balance below zero (rule 11).

**Decision:** these are not one atomic all-or-nothing operation. Refunding A is unconditionally correct and always succeeds, regardless of B's balance — A's problem isn't A's fault, and blocking their fix on an unrelated student's balance is unfair. Charging B reuses the exact balance check already used at the register (`lockAccountsForUpdate` + `assertCanDebit`, D-7) and can independently fail if B doesn't have enough snack money.

Binding constraints:
- If B's charge cannot be completed, A is still refunded. The correction record and audit entry show the second half as outstanding — never silently reported as fully resolved, never a signal-free gap for staff to discover later.
- B is never taken negative to force the correction through. That would bypass rule 11 through a back door and preempt Stage C item 9's arrears decision, where the district's actual policy on negative balances belongs deliberately, not introduced early by accident here.
- Once B's balance allows it, staff complete the outstanding half as a follow-up tied to the same original correction record, not a new unrelated one.

## D-16 · "Something else" corrections select the original entry and state what it should have been
**Decided:** stage B · **Status:** settled

The situation-first correction flow can't name every possible mistake. For anything that doesn't match a listed situation, staff select the actual payment or charge on the student's account and enter what it should have been; the server computes the difference and writes the correctly-linked, self-guarded correction (D-8, rule 2) — staff never name or choose a ledger operation.

Rejected: a generic add/remove-money amount with no selected entry. It doesn't link the correction to a specific original, which is exactly what rule 2 requires, and it's operation-first thinking wearing a thinner disguise — "more or less money" still asks staff to think in ledger terms. Also rejected: reason-only, deferred to a later manual review. No such review workflow exists anywhere in the spec set; deferring dodges the problem this item exists to solve.

**Binding constraint:** if a situation genuinely has no corresponding entry — money should have existed but was never recorded at all, not a wrong figure on something real — that is not a correction. It's a general adjustment, already its own self-guarded, distinctly labeled path (D-8's `recordAdjustment`). Don't force a fabricated selection through "Something else" to reach it.

## D-17 · A district decision with no original renders as a standalone entry in money history
**Decided:** stage B · **Status:** settled

D-16 deliberately leaves a district decision to add or take money unlinked to any original entry — it isn't a correction of anything. It's tracked through its own `CorrectionCase` record with `originalEntryId: null`, a state the schema already supports (the field has been nullable from the start; this is not new).

**Decision:** money history renders it as the normal actor/amount/reason sentence — no "Corrects" link, and no "no original payment or charge" note either. An absence note would imply a link should exist and doesn't, which re-couples it visually to corrections right after D-16 deliberately separated it. Restructuring persistence so district decisions stop creating a `CorrectionCase` record was considered and rejected — unnecessary; the nullable `originalEntryId` already models "no original" correctly. The money-history sentence formatter renders off whether a link is present, not off whether a `CorrectionCase` exists at all.

**Fix while here:** `recordAdjustment` currently stores the description as `Mistake fixed: ${reason}` unconditionally. Correct for D-16's linked "something else" adjustments — those are genuinely fixing a mistake — wrong for a district decision, which isn't one. Left as-is the sentence reads "Mistake fixed: District decision to change snack money," the same operation-shaped mislabeling item 7 was built to remove. Compose the sentence display-side from type, link presence, and reason — don't trust a one-size-fits-all stored description.

## D-18 · Arrears duration is a current streak, not lifetime history
**Decided:** stage C · **Status:** settled

The admin arrears view needs to show how long an account has been below zero. **Decision:** count from the first charge after the most recent point the derived balance was zero or positive — a current streak that resets every time the balance recovers.

Rejected: lifetime-first-ever-negative, which would overstate an account that recovered and later went negative again — the same overclaiming instinct D-12 already rules out, just applied to duration instead of attendance. Also rejected: most-recent-charge, which doesn't measure a duration at all — it's nearly always "today" and tells staff nothing.

Reuse the existing `deriveBalanceCents` pattern to compute the streak; don't add a second balance-tracking mechanism.

## D-19 · The district charge policy is edited by district admin and above, read by whoever needs it
**Decided:** stage C · **Status:** settled

Same treatment as D-2's pricing config and D-14's attendance factor: district-level compliance config, not a platform-provisioning task. **Decision:** `DISTRICT_ADMIN` and `SUPER_ADMIN` may edit the policy text. `SCHOOL_STAFF` and `CASHIER` can read it — someone fielding a guardian's question at the front office needs the exact wording — but cannot change it.

Rejected: locking it to `SUPER_ADMIN` only. That role is reserved for genuinely platform-level provisioning (D-11), explicitly called a demo shortcut rather than a general pattern for "important things." The charge policy is the district's own local determination under federal guidance ("SFAs have discretion in developing the specifics") — locking Woodbridge out of editing text they're required to keep current would be an unnecessary bottleneck.

## D-20 · Group-contact and write-off actions are deferred, not part of Stage C item 9
**Decided:** stage C · **Status:** settled

`design-spec-03-guardian.md`'s arrears section also describes a group-contact action (notifying multiple guardians in arrears at once) and a write-off action (forgiving debt). Neither was in item 9's actual scope — a read-only arrears listing, the always-serve guardian copy fix, and the charge-policy flow.

**Decision:** defer both. Group-contact is a new notification trigger; D-5 already treats notification generation as something scoped deliberately per feature, not bundled in as a side effect of an unrelated item — it needs its own pass on what the message says, whether it quotes the district's exact policy text, and the same D-12/no-pronoun language rules. Write-off is a real debt-forgiving money action with likely nonprofit-food-service-account accounting implications that haven't been researched at all, and it isn't named anywhere in the build order — building it ungoverned by its own spec is the same premature-feature mistake this project avoided elsewhere (free/reduced application management, deliberately named but not built).

Neither is rejected as a future capability — both should surface as their own scoped item when actually taken up, not as an unplanned add-on here.

## D-21 · Demo scale stays at 200 students; claim figures say so on screen
**Decided:** stage C · **Status:** settled

The deeper meal-history seed keeps the existing 200 synthetic students rather than expanding to Woodbridge's real ~2,720 enrolment. Monthly totals will therefore read around 2,000 lunches, not the ~27,000 a district of that size actually claims.

**Consequence, and the required mitigation:** a nutrition director reading 2,000 could reasonably conclude the system undercounts. The claim figures screen must state plainly that the figures come from a 200-student synthetic subset and are not district scale — the same honesty boundary as D-14's federal-default labelling and the existing `TRUST_COPY.claimFigures` statement. Proportional honesty is not enough on its own; the scale has to be named.

Rejected: expanding the seed to full district enrolment. It multiplies reset time, fixtures, and UI datasets for a demo environment that gets reset often, and the mitigation above costs nothing by comparison. Revisit only if a full-scale performance demonstration is actually required.

**Firmly rejected: a separate aggregate count table for claims.** Claim figures derive from `MealEvent` rows and nothing else. Every trust guarantee in the project depends on one source — reversed events never counting, overrides reported on their own line (D-10), the edit check reading the same query as the report (item 6). A second source silently breaks all of them and would be very hard to detect once introduced.

## D-22 · Pricing configuration is versioned and dated, never overwritten
**Decided:** stage C · **Status:** settled

The pricing screen's "These prices start on" field is backed by immutable dated versions, not a mutable date on a single current row.

**The decisive argument:** `TRUST_COPY.priceChange` already promises on screen that "meals already served keep the price they were charged at — changing these numbers never changes anything in the past." Overwriting a row's effective date would make that sentence false. It is the append-only instinct (rule 2) applied to configuration instead of money: supersede, never rewrite.

The operational need is equally real — districts set next school year's prices during the summer, before the year begins. A change dated "today" cannot express that.

Binding constraints:
- Prices resolve **by the meal's service date**, not by "whatever is current." A backdated or corrected meal prices under the rules actually in force on the day it was served.
- **One scheduled future version at a time.** A queue of pending changes nobody can see is worse than no scheduling.
- A future version that has not yet taken effect **may be cancelled** — nothing depends on it — and the cancellation is audited.
- A version that has ever been effective is **never** edited or deleted. A correction is a new superseding version.
- Every version records who created it, when, and its effective date, like any other config change (rule 8).

## D-23 · Claim figures cover CEP months only; non-CEP months show an honest unavailable state
**Decided:** stage D · **Status:** settled

**This is the first test of D-1's "fourth reader requires genuine scrutiny" clause, and the answer is no — on scope grounds, explicitly not on principle.**

The honest position first: a non-CEP claim report genuinely does need meal counts by category. NSLP reimburses free, reduced, and paid at different rates, so a district cannot file a claim without them. Showing reimbursable totals without the split (the third option considered) would produce a report nobody can actually submit from — worse than declining, because it looks complete and is not.

Why it is nonetheless out of scope now:
- Woodbridge is CEP district-wide, the seed is CEP, and no demo path exercises non-CEP claiming.
- Building it properly requires a historical tier snapshot — resolving what each student's category was **on the service date**, not today — plus a fourth D-1 reader with aggregate-only and small-cell rules. Substantial work for a path nothing currently walks.
- Real CEP status is set per school on a four-year cycle, not toggled mid-month. A genuinely mixed month is an artifact of our demo toggle, not something a district experiences. The toggle exists to prove the system handles both kinds of district, not to model one changing its mind in October.

**Behaviour:** a CEP month produces the full report. A non-CEP or mixed month shows a clear unavailable state naming the reason plainly and pointing to PCS — consistent with `TRUST_COPY.claimFigures`, which already states PCS remains the official counting record. Never a partial report presented as usable.

**Named as future work, not a permanent limitation.** If a non-CEP district becomes a real prospect, this gets designed properly: historical tier resolution by service date, aggregate counts only, small-cell suppression, and a deliberate D-1 amendment rather than an incidental one.

## D-5 · Notifications are in-app only for the pilot
**Decided:** phase 1 schema, phase 5 behaviour · **Status:** settled

`Notification` plus `NotificationDelivery` exist from phase 1. Generation logic and `NotificationPort` are phase 5. Nothing is emailed or texted in the pilot; production swaps GoHighLevel in behind the port.

## D-11 · Pilot staff provisioning is a deliberate demo shortcut
**Decided:** phase 5c · **Status:** settled

Super-admin "create staff user" sets the shared demo password (hashed) and generates a TOTP secret shown exactly once at creation — there is no "view secret" screen anywhere. `districtId` always comes from the session, never the form. Staff are DEACTIVATED (`User.disabledAt`), never deleted, because `AuditLog.actorId` references them; deactivation is audited, reversible, and makes authentication fail. Creating or changing a `SUPER_ADMIN` is audited with before/after like any other config change — no special-casing.

This is a demo shortcut, not a production pattern. Production needs an email invite with a set-password link and self-enrolled TOTP — not a shared password and not an admin-visible secret. Phase 8 replaces this flow.

Notification bodies carry money amounts and student names only — never a pricing tier or eligibility category (D-1). Generation goes through `NotificationPort` (in-app pilot; GoHighLevel in phase 8).

(Duplicate D-13 from a parallel session, merged into the entry above. Removed to keep one authoritative source per decision — see the D-13 above for the settled version.)

A student without a `classId` at a roster-mode school is a data problem to surface to an admin, not a silent gap — roster mode should show them as unassigned rather than omitting them.

## D-24 · The container health probe is a dedicated liveness endpoint, not `/`
**Decided:** first AWS deployment · **Status:** settled

`GET /api/health` returns 200 with a small JSON body, reads no session, and is not audited.

Probing `/` does not work and is worth recording so nobody tries it again. The root route is an auth dispatcher that calls `redirect()`, and the App Router answers that with **307** — not 302. A load balancer configured for `200` (or even `200,302`) therefore marks a perfectly healthy container unhealthy and serves 503 forever. That failure mode is silent from the app side: the container logs a clean start and nothing else, because nothing ever reaches it.

It is deliberately a **liveness** probe, not readiness: it reports 200 whenever the process can serve, and never fails on database reachability. A probe that returned 503 on a database blip would make the load balancer deregister the task and ECS recycle the container in a loop — restarting an app cannot fix a database outage, so that turns a recoverable incident into a much louder one.

## D-25 · Startup fails closed when it cannot tell whether the roster is seeded
**Decided:** first AWS deployment · **Status:** settled

`docker-entrypoint.sh` seeds only on a **definitive** count of zero. The roster check reports through an exit code — 0 empty, 1 populated, 2 query failed — and state 2 aborts the container rather than seeding.

The original version treated any error as "empty". Since `npm run seed` resets the database as its first action, a transient connection error between `migrate deploy` and the count — a Multi-AZ failover during a deploy is the realistic trigger, and the instance is Multi-AZ — would have silently destroyed live evaluator data and replaced it with a fresh seed. A container that refuses to start is a loud, recoverable failure; a container that quietly wipes the database is neither.

## D-26 · The seed withholds credentials from deployed logs
**Decided:** first AWS deployment · **Status:** settled

The seed prints the shared demo password, each staff TOTP secret, and a live code when `NODE_ENV !== "production"`, and withholds all three otherwise. Emails, labels, and the POS fixture guide always print.

In a container the seed runs from the entrypoint, so everything it prints lands in CloudWatch Logs and persists. Anyone with read access to the log group could lift a staff TOTP secret and bypass the second factor. The data is synthetic, so this is not a breach — but the pilot's own story is that staff sign-in is protected by MFA and that sensitive actions are audited, and MFA secrets sitting in a durable log is a fair objection for a district's IT reviewer to raise. Local runs are unaffected: `npm run logins` is still the way to get a code, and it now refuses to run under `NODE_ENV=production` for the same reason.

## D-27 · Images are tagged by date and commit; never `latest`
**Decided:** first AWS deployment · **Status:** settled

`npm run deploy:image` builds and pushes as `<UTC date>-<git short sha>`, and refuses to build from a dirty working tree without an explicit confirmation.

The ECR repository has tag immutability enabled, which is correct — it is what makes a rollback trustworthy. The consequence is that pushing an already-used tag is **rejected**, and the rejection is nearly invisible: every layer reports "Layer already exists" and only the final line says the tag could not be overwritten. A push that has actually failed reads as a success, and the service keeps deploying the original image no matter how many times it is redeployed. That cost one full debugging session, during which a correct code fix appeared not to work; the script exists so it cannot happen twice.
