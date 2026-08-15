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
