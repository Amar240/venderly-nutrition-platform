# Agent instructions

This file exists so any coding agent — Codex, Claude Code, or another — works to the same rules. It is a pointer, not a second source of truth.

## Read these first, in order

1. `CLAUDE.md` — stack, repo layout, and the thirteen non-negotiable domain rules.
2. `docs/decisions.md` — eleven settled cross-cutting decisions. **Do not re-open any of them mid-implementation.** If a spec appears to conflict with a decision, stop and ask rather than choosing.
3. `docs/design-spec-00-overview.md` — the redesign, its five governing ideas, and the build order.
4. The specific spec for whatever you are building.

## How to work

- Implement one item from the build order at a time. Propose a plan and wait for approval before writing code.
- Meet the acceptance criteria before moving on. A human runs the manual steps and verifies personally.
- Write tests for anything touching money, authorisation, or the pricing tier. Those are the demo's trust story.
- When a requirement is ambiguous or contradicts a settled decision, stop and ask. Four times during phases 1–5 this prevented a real defect. It is the most valuable thing an agent does on this project.

## Decide these yourself — do not ask

Ask about genuine conflicts and missing external facts. Do not ask about anything answerable from the rules below. Apply the default, note it in your summary, and continue.

| Question | Default |
|---|---|
| RBAC for a new admin screen | Match the nearest existing screen. District-level config → `DISTRICT_ADMIN` and above (D-19). Same-day operational work → `SCHOOL_STAFF` and above, school-scoped (D-13). `SUPER_ADMIN`-only is for platform provisioning only (D-11). |
| Should this action be audited | If it moves money, changes config, or touches a student record: yes, with actor, reason, before/after. |
| Rounding a compliance ceiling or threshold | Round down. A ceiling that rounds up lets breaches pass undetected (D-14). |
| Where a new non-Student field lives | Its own table if it has an independent lifecycle (D-1, D-13); a `District` field if it is district-wide external config (D-14). |
| Naming something on screen | Never after how it was built. Use `design-spec-06` §6.1; add to `lib/presentation-labels.ts` rather than inlining copy. |
| A student pronoun | There isn't one. Gender is never stored. Use the child's name, or "your child". |
| Why a meal is missing | Never assert a reason. "No lunch recorded" only (D-12). |
| A new count of meals | Filter `overrideSeq = 0` and `reversedAt IS NULL`, reusing the existing shared query (D-10). |
| A balance check before a debit | Reuse `lockAccountsForUpdate` + `assertCanDebit` (D-7). Never reimplement, never skip. |
| Whether a meal can be denied for low balance | No. Meals are always served. Only à-la-carte denies (rule 11). |
| An empty state or error message | Situation, then what to do, in one sentence. No error codes. `design-spec-06` §6.1 has the table. |
| A demo fixture's exact value | Pick a plausible one, comment what it demonstrates, and report it in your summary. |

**Still worth asking about:** a real conflict between two settled decisions, an external fact we cannot derive (a state agency's published figure, a district policy), or a requirement that would require changing something already settled.

## Non-negotiable, restated

- Money is integer cents. The ledger is append-only — no UPDATE, no DELETE, ever. Corrections are new offsetting entries linked to the original.
- Authorisation is enforced in `server/`, never in the UI. Guardian queries always join through the verified guardian-student relationship.
- The pricing tier has exactly two authorised readers: meal pricing logic in `server/meals`, and the guardian's own household query. It must never appear in a POS payload, page source, client bundle, log line, export, or report.
- One live normal meal event per student, service date, and meal type. Cashier-reversed rows remain as history but never count; admin overrides are separate rows and are never summed into headline meal counts.
- The roster importer drops date of birth, race, and gender at parse time. They must never reach the database.
- Every sensitive action is audited with actor, reason, and before/after context.
- Nothing on screen is named after how the system was built. See `docs/design-spec-06-language-and-accessibility.md`.
- Synthetic data only. The prototype banner appears on every surface, including printed and exported output.

## Commands

- `npm run dev` — start the app
- `npx prisma migrate dev` — apply migrations
- `npm run seed` — reset and load synthetic data
- `npm test` — run tests
