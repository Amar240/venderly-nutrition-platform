# Build plan — everything remaining

Written after an audit of what is actually in the repository versus what was only ever a mockup. Read `design-spec-00-overview.md` for the design intent; this document is the honest, current-state execution order.

---

## Where the project actually stands

**Real, in the repository, verified against the code:**

| Feature | Where |
|---|---|
| Six real Woodbridge schools, 200 students, three-tier pricing mix | `prisma/seed-data.ts` |
| Guardian home built around meals remaining, D-12-safe wording | `server/household/household.ts` |
| Register undo — 90 seconds, reversal not deletion, DB-enforced | `server/meals/undoMealEntry.ts` |
| Plain-language copy across every screen | `lib/presentation-labels.ts` |
| Roster mode for the Early Childhood Center and Wheatley | `server/meals/roster.ts`, `server/classrooms/` |
| Edit-check report and dashboard exception | `server/reports/editCheck.ts` |
| Situation-first corrections with follow-up handling | `server/corrections/situationCorrections.ts` |
| Money history as linked sentences | `server/ledger/moneyHistory.ts` |
| Arrears listing and district charge policy | `server/reports/arrears.ts`, `server/policy/chargePolicy.ts` |
| Automatic top-up | `server/household/autoTopUp.ts`, `app/(guardian)/guardian/top-up/` |
| Versioned meal-price configuration | `server/config/pricing.ts`, `app/(admin)/admin/config/pricing/page.tsx` |
| Monthly claim figures for CEP months | `server/reports/claimFigures.ts`, `app/(admin)/admin/reports/claim-figures/page.tsx` |

**Mockup only — no code exists:** the claim pack, month-end close, the rebuilt dashboard, the welfare signal, the guardian weekly view, leaving-students money.

---

## The finding that reorders everything

`prisma/seed.ts` creates meal history for **two students across six days**. Nothing else has any history at all.

Every remaining feature is a reporting feature, and a reporting feature with no data behind it cannot be built honestly or demonstrated at all:

- Monthly claim figures would read near zero instead of the ~27,000 lunches a real district claims.
- The edit-check report — already built and correct — has almost nothing to check.
- The welfare signal ("students who ate regularly last month and stopped") is undefined without a last month.
- The dashboard's anomaly cards have no anomalies to surface.

**So the seed comes first, before any Stage D or E work.** This is a deliberate departure from the original build order, and the reason is worth keeping: we would otherwise build four reporting screens against empty tables, discover they look broken, and retrofit data to make them look right — which is how demos end up lying.

### What the seed must plant

Deterministic, documented, and reproducible on every reset:

- A full month of meal events across all six schools at realistic participation rates, varying by school type.
- Operating days derived from days meals were actually recorded — never assumed weekdays (holidays and closures must appear naturally).
- **One deliberate edit-check breach:** a single day at one school recording more lunches than enrolment × attendance factor allows, so the exception card has something real to show.
- **A handful of students who stopped eating:** ate regularly through the prior month, nothing this week — the welfare signal's actual input.
- **Graduating students with leftover balances**, for the leaving-students work.
- **A stale student-list import date**, so the roster-freshness alert is real.
- Negative balances (already ~5%) retained.

Every planted anomaly gets a comment in the seed explaining what it exists to demonstrate. A future reader must never mistake a deliberate demo fixture for a bug.

---

## Scope line

Eight items get built. Three are deliberately deferred and documented as named-but-not-built, in the same way free and reduced application management already is — describable in the room, honestly, without having been built.

**Deferred, with reasons:**

- **Month-end close.** Overlaps substantially with claim figures and the claim pack, which together already surface unresolved items.
- **Guardian weekly view.** Never in the build order; came from a mockup and was never scoped. The guardian home already answers "did my child eat today" and carries the missed-lunch pattern note.
- **Leaving-students money.** The seed already plants 12 graduating students holding $235.24, so the data exists whenever this is taken up. Overlaps D-20's deferred group-contact action; scope both together.

Deferring is not rejecting. Each is a real capability with a real reason to wait.

---

## Order of work

### Foundation — done

1. ~~**Deepen the seed.**~~ Complete. 29 operating days, one planted edit-check breach verified through the real report, seven stopped-eating fixtures, reversed and override events for exclusion demos.

### Stage C — done

2. ~~**Automatic top-up.**~~ Complete. Family-set ceiling, low-money crossing, in-app notifications, payment-boundary reuse, and idempotent trigger handling are implemented.
3. ~~**Pricing configuration screen.**~~ Complete. The screen is versioned, effective-dated, district-admin accessible, and now includes D-14's district claim settings.

### Stage D — compliance

4. ~~**Monthly claim figures.**~~ Complete. CEP months show per-school totals, edit-check exceptions, the claiming-percentage arithmetic, the boundary statement, and the D-21 scale disclosure. Non-CEP and mixed months stop with the D-23 scope-boundary state.
5. **Claim pack.** One printable document for a state reviewer, prototype banner included on print. The artifact that makes item 4 survive an audit.

### Stage E — insight and polish

6. **Dashboard rebuilt** as things needing attention, each naming an action, numbers underneath. The first screen an evaluator sees when they sign in.
7. **Welfare signal** with the full spec-7 guardrails: count-only on dashboards, names only behind an audited action routed to a counsellor, switchable off, rule stated plainly. Eating pattern alone — never an attendance claim (D-12). The differentiator no competitor in the landscape has.
8. **Accessibility pass.** Keyboard-only, 200% zoom, contrast, live regions — plus the outstanding manual checks (physical tablet for roster mode, VoiceOver). This is a gate, not polish: US public-sector procurement carries real accessibility obligations, and a district can be exposed by buying software that fails them.
9. **Demo script**, rehearsing the CEP flip.

---

## How this gets built

Unchanged from how Stages A and B were built, because it has caught real defects repeatedly:

- One item at a time. Plan proposed and approved before code.
- Every cross-cutting decision written into `docs/decisions.md` before implementation, never mid-build.
- Ambiguity or conflict with a settled decision means stop and ask.
- Each item verified against the repository, not against its own summary.

## What must stay true

Carried from `decisions.md` — none of it is negotiable in the remaining work:

- Money is integer cents; the ledger is append-only; corrections are new linked entries.
- Authorisation is enforced in `server/`, never in the UI.
- The pricing tier has exactly two authorised readers.
- Reversed and override meal events never enter claim figures.
- We never assert why a meal is missing (D-12).
- Synthetic data only, prototype banner on every surface including print.
