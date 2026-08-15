# Seed specification — deep meal history

The authoritative spec for the deeper seed. Written so it can be implemented without asking further questions. Where a number appears here, use that number.

Read `decisions.md` first, especially D-10 (override counting), D-12 (no attendance claims), D-18 (arrears streak), D-21 (demo scale).

---

## Purpose

Every remaining feature is a reporting feature. The seed currently creates meal history for two students across six days, so claim figures, month-end close, the welfare signal, and the dashboard cards have nothing real to read. This spec creates that history, including deliberately planted anomalies so each downstream feature has something true to show.

**Every planted anomaly must carry a code comment saying what it exists to demonstrate.** A future reader must never mistake a deliberate fixture for a bug.

---

## 1. Scale and determinism

- Keep **200 students** (D-21). Do not expand to real district enrolment.
- Keep the existing proportional distribution across the six schools.
- Reuse the existing `mulberry32` PRNG. Add one new documented seed constant for meal history so it is reproducible on every reset and independent of the existing student-generation stream.
- `npm run demo:reset` must stay under roughly 60 seconds. Use `createMany` in batches; do not insert row by row.

## 2. Period covered

- Generate operating days backwards from **today**, so the demo is always current after a reset. Never hardcode a calendar month.
- Cover **45 calendar days back from today**.
- Weekdays are candidate operating days. Deliberately skip **three** of them scattered through the period as closures.
- Do not seed weekends.

The closures matter: operating days are derived from days meals were actually recorded, never assumed weekdays. Skipping some proves that derivation works rather than accidentally agreeing with a weekday assumption.

At today's date this yields a complete prior calendar month for the claim demo plus a partial current month for the dashboard.

## 3. Participation rates

Per school, per operating day, as a share of that school's active enrolment. Vary each day by a few percent so the data does not look synthetic.

| School | Breakfast | Lunch |
|---|---|---|
| Early Childhood Education Center | 55% | 85% |
| Phillis Wheatley Elementary | 50% | 82% |
| Woodbridge Middle | 35% | 70% |
| Woodbridge High | 25% | 55% |
| S.C.O.P.E. North / South | 50% | 80% |

Which students eat on a given day is randomised per day — not the same cohort every day.

## 4. Money

**Meal events create no ledger entries.** CEP is enabled, so breakfast and lunch resolve to `priceCents: 0` for every tier. A month of meal history must not move any money.

À-la-carte history is seeded separately and modestly — roughly 40 snack purchases spread across the period — and it **does** create ledger entries as normal.

**Do not alter the balances of:** Ella, Marcus, or the reserved Wheatley POS students (100003–100007). Their balances are demo fixtures that other screens and the demo script depend on. Snack history may only touch the other students.

## 5. Preserve existing fixtures exactly

All of these already exist and must survive unchanged:

- Ella's and Marcus's current-day meal state.
- Marcus's deliberate "no lunch on 3 of the last 5 school days" pattern.
- The seeded completed correction case.
- The two uncorrected cookie charges used by the correction demo.
- Existing negative balances (~5% of students).
- Classroom assignments at the Early Childhood Center and Wheatley.

If a new fixture below conflicts with one of these, the existing fixture wins.

## 6. Planted anomalies

### 6.1 Edit-check breach — exactly one

One day at **Woodbridge Middle** where recorded lunches exceed the ceiling.

The ceiling is `floor(active enrolment × 0.938)` (D-14). Because the database already prevents more than one live meal per student per day, a breach is only possible as a genuinely high-participation day — so seed that day at roughly **97% lunch participation**, which lands a few meals above the ceiling.

Do not plant more than one. A report with a single clear exception demonstrates the feature; several look like the system is broken.

### 6.2 Students who stopped eating — exactly 7

Seven students who ate lunch regularly through the earlier weeks and have recorded nothing in the **last five operating days**.

- Spread across at least three schools.
- **Must not include Marcus** — his 3-of-5 pattern is a different, guardian-facing fixture and mixing them makes both harder to explain.
- These students still have breakfast records in the earlier period, so the pattern is a genuine change rather than a student who never participated.

### 6.3 Graduating students with leftover balances

Every **grade 12** student at Woodbridge High gets a positive snack balance between $3 and $40. Note the resulting count and total in a comment — the leaving-students feature will surface both.

### 6.4 Stale student list

Set the most recent `ImportRun` to **9 days ago**, so the roster-freshness alert has a real age to report.

### 6.5 Reversed and override events

Seed, in the historical period:

- **3 reversed meal events** (`reversedAt` and `reversedByUserId` set, `overrideSeq = 0`).
- **1 administrator override** (`overrideSeq = 1`, with `overrideReason` and its audit entry).

These exist specifically so the claim report can be shown excluding them. Comment them as such. They must not appear in headline counts (D-10).

## 7. Correctness requirements

- All service dates go through the existing district time helpers (`districtToday` / `districtDateOnly`). Never build dates from host-local getters.
- The seed must pass `npm run test:tz` (`TZ=Asia/Kolkata`). A date that shifts under a non-US timezone is a real bug, not a test artefact.
- Respect the live-uniqueness partial index: one live normal meal per student, service date, and meal type.
- Add assertions at the end of the seed that verify the planted fixtures actually exist — the breach day exceeds its ceiling, exactly 7 students match the stopped-eating pattern, the reversed and override counts are right. A fixture that silently fails to generate is worse than no fixture, because the feature built on top of it will look broken for the wrong reason.

## 8. Report what was generated

Print a summary at the end of the seed: operating days, total breakfasts and lunches by school, the breach day and by how much, the stopped-eating count, graduating-student count and total held. This is what a human checks after a reset.
