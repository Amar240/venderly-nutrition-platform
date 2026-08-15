# Design specification — overview and build order

The end-to-end redesign of the Woodbridge Nutrition Platform. Read this first, then the numbered specs.

**Read `decisions.md` before implementing anything.** Eleven decisions are settled and must not be re-opened mid-build. If a spec here appears to conflict with one, stop and ask.

---

## The documents

| File | Covers |
|---|---|
| `discovery-research.md` | Who Woodbridge actually is, what districts demand, competitive reality, demo choreography |
| `design-spec-01-cafeteria.md` | Serving screen, roster mode, à-la-carte, shift start and end |
| `design-spec-02-front-office.md` | Dashboard, student search and record, corrections, uploading the student list |
| `design-spec-03-guardian.md` | Household view, meals remaining, adding money, arrears, transfers, notifications |
| `design-spec-04-business-office.md` | Money history as sentences, pricing config, month-end, exports, audit viewer |
| `design-spec-05-claims-and-compliance.md` | Monthly claim figures, CEP claiming percentages, edit checks, the claim pack |
| `design-spec-06-language-and-accessibility.md` | The plain-English rules, error and empty-state copy, accessibility for this audience |
| `design-spec-07-insights.md` | What we surface, what we refuse to infer, and the welfare guardrails |

---

## The five ideas the whole design rests on

**1. Three tiers is the general case; CEP is a configuration.** Every student carries a price tier and every meal is priced per student. A CEP district is one where all tiers resolve to $0. Demo data holds a realistic mix — roughly 65% free, 8% reduced, 27% paid — so flipping CEP off produces a working non-CEP district with the same code.

**2. Meals, not dollars.** A balance means nothing across tiers. "About 21 more lunches" is the number a parent is already computing. Low-balance thresholds are in meals for the same reason.

**3. The system knows whether a child ate.** Under CEP nothing is charged, so no other system in the district can answer the question a parent actually has. We record every meal event anyway.

**4. Nothing on screen is named after how we built it.** No ledger, no reconciliation, no eligibility. Section 6 has the full table.

**5. Every insight names an action, and anything touching a child's welfare carries explicit guardrails.**

---

## Build order

Written for whoever implements — Claude Code, Codex, or a person. Each item is independently demonstrable.

### Stage A — makes the demo real (do these first)

1. **Reseed with the real district.** Six schools by name — Woodbridge Early Childhood Education Center, Phillis Wheatley Elementary, Woodbridge Middle, Woodbridge High, S.C.O.P.E. North, S.C.O.P.E. South — with proportional enrolment and the three-tier mix. Highest impact per hour of work in the entire plan.
2. **Guardian home rebuilt around meals remaining**, with the did-they-eat line first and money third.
3. **Undo last student at the register** — 90 seconds, reversing record, audited.
4. **Language pass** across all existing screens using the section 6 table.

### Stage B — the operational gaps

5. **Roster mode** for the Early Childhood Center and elementary. Without it the product does not work at two of six schools.
6. **Edit-check report and dashboard exception.** Federally required, done in a spreadsheet today, and we already hold every input.
7. **Correction flow rewritten** to start from what happened rather than which operation.
8. **Money history as sentences**, with corrections visibly linked to their originals.

### Stage C — the money layer for non-CEP districts

9. **Arrears handling** — negative balances, always-serve, the district's charge policy surfaced, admin arrears view.
10. **Automatic top-up**, with a family-set ceiling and a notification each time it fires.
11. **Pricing configuration screen** with the CEP switch, six tier prices, effective dates, and students-affected counts.

### Stage D — the compliance layer

12. **Monthly claim figures** with the CEP claiming percentage arithmetic shown and the boundary statement on screen.
13. **Claim pack** — one printable document for a reviewer.
14. **Month-end close** with unresolved items surfaced.

### Stage E — insight and polish

15. **Dashboard rebuilt** as things needing attention, with the numbers underneath.
16. **Welfare signal** with the full guardrails from spec 7, switchable off.
17. **Accessibility pass** — keyboard-only walkthrough, 200% zoom, contrast, live regions.
18. **Demo script** rehearsing the CEP flip.

### Named but not built

Free and reduced application management — online application, direct certification through SNAP and TANF matching, approval, notification letters, annual verification. Sketched in spec 3 §3.8. Large, not needed for the pilot, and worth being able to describe in the room.

---

## What has to stay true

Carried forward from `decisions.md` and the PRD. None of this is negotiable in the redesign:

- Money is integer cents; the ledger is append-only; corrections are new offsetting entries.
- Authorisation is enforced in `server/`, never in the UI.
- The pricing tier has exactly two authorised readers: meal pricing logic, and the guardian's own household query. Never a cashier, never an export, never a log.
- One meal event per student, date, and meal type; overrides are separate rows, counted on their own line.
- The importer drops date of birth, race, and gender at parse time.
- Every sensitive action is audited with actor, reason, and before/after.
- The prototype banner appears on every surface, printed and exported output included.
