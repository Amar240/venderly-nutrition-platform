# Woodbridge Nutrition Platform — Pilot

## What this is
A demo-ready pilot of a school nutrition platform for Venderly to present to Woodbridge School District. Synthetic data only. Not production. Every screen must show a persistent banner: **PROTOTYPE — SYNTHETIC DATA. Not connected to Infinite Campus, PCS, or live payment processing.**

Three surfaces in one app: guardian portal, cafeteria POS, admin console.
Five roles: guardian, cashier, school staff, district admin, super admin.

The authoritative requirements live in `docs/Woodbridge_Nutrition_PRD.pdf` and `docs/phase-*.md`. Settled cross-cutting decisions live in `docs/decisions.md` — read it before every phase. **Before implementing anything, read the phase spec for the current phase and the decisions log. Do not re-decide anything settled in this file, the specs, or the decisions log — if a conflict appears, stop and ask.**

## Stack (settled — do not change)
- Next.js (App Router) + TypeScript `strict`
- PostgreSQL + Prisma
- Auth.js (credentials provider, seeded demo users; role + district/school scope in session)
- Zod for all input validation at API boundaries
- Tailwind + shadcn/ui as the component base
- Vitest for unit tests (ledger and RBAC logic must be tested)

## Repo layout
```
app/            routes: (guardian)/, (pos)/, (admin)/, api/
server/         domain modules — the "modular monolith"
  directory/    students, schools, enrollment
  household/    guardians, guardian-student links
  ledger/       entries, balances, transfers, adjustments
  meals/        meal events, duplicate guard, pricing rules
  pos/          POS orchestration
  import/       CSV validation + upsert pipeline
  reports/      meal counts, deposits, exports
  audit/        audit log writes + queries
  auth/         session, RBAC guards
prisma/         schema, migrations, seed
docs/           phase specs, runbooks, decisions
```
All domain logic lives in `server/`; route handlers are thin. UI never computes money or eligibility.

## Non-negotiable domain rules
1. **Money is integer cents.** Never floats. Column names end in `Cents`.
2. **The ledger is append-only.** No UPDATE or DELETE on ledger entries, ever. Corrections are new offsetting entries linked to the original. Balance is derived from the ledger; any cached balance is an optimization, never the source of truth.
3. **Transfers** create a linked debit + credit sharing one `transferRef`, in a single DB transaction.
4. **Idempotency keys** on every payment and import event (unique constraint). A retried event must never double-credit.
5. **Eligibility is confidential.** Free/reduced/paid status never appears in any POS response, POS UI, client-side code, export, report, or log. The server prices the meal and returns only an operational result: recorded / duplicate / insufficient balance / not active at this school. The guardian household query may read a linked child's tier only to show that child's resolved meal cost; it never returns the tier.
6. **Meal uniqueness:** one meal event per student + service date + meal type (DB unique constraint). Override requires a documented, audited reason.
7. **RBAC is enforced in `server/`, not in the UI.** Every query is scoped by district and school from the session. Guardian queries always join through the verified guardian-student relationship — no open student search for guardians. Cashiers cannot browse students, see eligibility, or touch money.
8. **Audit everything sensitive:** logins, adjustments, transfers, overrides, exports, imports, config changes — actor, action, subject, timestamp, reason, before/after context.
9. **Data minimization:** the Student model contains ONLY studentNumber, firstName, lastName, middleName (never displayed by default), schoolId, grade, enrollmentStatus. Never add race, ethnicity, gender, or birthdate fields. The CSV importer drops `student.raceEthnicityFed`, `student.gender`, and `student.birthdate` at parse time — they must never reach the database. Pricing tier lives in a separate `StudentPricing` table, with exactly two authorised readers: `server/meals` pricing logic and the guardian's own household query scoped through `GuardianStudent` — see `docs/decisions.md` D-1. This rule is not a licence to add fields; it is the reason the tier lives elsewhere.
10. **Students are never deleted** — marked inactive.
11. **Default pricing config:** CEP-style — breakfast/lunch $0.00 for all; a-la-carte items deduct from balance and are denied if the balance would go below zero (sale stores price at time of purchase).
12. **Payments are simulated.** A fake hosted-checkout page produces a signed-style event consumed server-side with an idempotency key. Never treat a client "payment succeeded" as proof.
13. **No external system is connected in the pilot.** Stripe, GoHighLevel, Infinite Campus, and PCS are all fakes behind port interfaces in `server/ports/` (see `docs/integration-endpoints.md`). No vendor SDK may be imported outside `server/ports/`.

## Design & UI rules
- **`docs/design-system.md` is binding.** Tokens, density rule, component states, and accessibility rules come from there. After phase 1, no component may contain a hardcoded colour, font size, or spacing value.
- shadcn/ui is the base design system. One shared component set across all three surfaces, differing only by density.
- The `ui-ux-pro-max` skill may guide styling decisions, but this product must read as calm, trustworthy district software — not a startup landing page. When the skill's suggestions conflict with accessibility or restraint, restraint wins.
- 21st.dev MCP components are allowed ONLY for showcase/marketing surfaces (e.g., a pitch landing page). Never for core app components (POS keypad, ledger tables, forms).
- Accessibility is a requirement, not polish: full keyboard navigation, visible focus, WCAG AA contrast, large touch targets on POS (min 48px), labels on all inputs, no color-only state indicators.
- POS: keyboard-first, target under 1s per meal, neutral "Meal recorded" confirmation, auto-reset to entry in ~2 seconds.

## Commands
- `npm run dev` — start app
- `npx prisma migrate dev` — apply migrations
- `npm run seed` — reset + load synthetic data (6 real Woodbridge schools, 200 synthetic students, multi-child households with differing surnames)
- `npm test` — run tests
- `npm run test:tz` — run tests under `TZ=Asia/Kolkata` to catch host-time date regressions
- `npm run check` — standard pre-commit/CI gate: typecheck, lint, tests, non-US timezone tests, build, and `git diff --check`

## Working agreement
- Implement one phase at a time per `docs/phase-N.md`; meet its acceptance criteria before moving on.
- The human (Amar) runs manual steps from `docs/runbook-*.md` and verifies acceptance criteria personally.
- Write tests for ledger math, idempotency, duplicate-meal guard, and RBAC scoping — these are the demo's trust story.
