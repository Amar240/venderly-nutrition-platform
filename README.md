# Woodbridge Nutrition Platform — pilot

Demo-ready pilot of a school nutrition platform for Venderly to present to Woodbridge School District. Synthetic data only.

**PROTOTYPE — SYNTHETIC DATA. Not connected to Infinite Campus, PCS, or live payment processing.**

## Start here
1. `CLAUDE.md` — frozen conventions. Read before writing any code.
2. `docs/runbook-phase-1.md` — the manual setup steps (Postgres, env, tooling).
3. `docs/phase-1-foundation.md` — first phase to implement.

## Documents

| File | What it is |
|---|---|
| `CLAUDE.md` | Stack, repo layout, 13 non-negotiable domain rules, working agreement |
| `docs/Woodbridge_Nutrition_PRD.pdf` | The authoritative requirements |
| `docs/design-system.md` | Tokens, density rule, component specs, accessibility rules — binding |
| `docs/aws-architecture.md` | Pilot topology to build, production topology to defer |
| `docs/integration-endpoints.md` | What connects at go-live: Stripe, GoHighLevel, Infinite Campus |
| `docs/open-decisions.md` | Unresolved questions for the district — hand this to the client |
| `docs/phase-1..8-*.md` | One spec per phase, each ending in acceptance criteria |
| `docs/runbook-phase-1.md` | Manual steps owned by Amar, not by Claude Code |

## Phases
1. Foundation — schema, auth with staff MFA, RBAC, design tokens, seed data
2. Guardian portal — balances, deposits, sibling transfers
3. Ledger — append-only integrity, idempotency, corrections, tests
4. Cafeteria POS — fast meal entry, duplicate guard, eligibility never shown
5. Admin — search, corrections, config screens, notifications, reports, audit
6. Import — Infinite Campus CSV simulation with data minimization
7. Demo hardening — accessibility, empty states, demo script
8. AWS deploy — pilot topology, infrastructure as code

Implement one phase at a time. Meet its acceptance criteria before moving on.

## Working agreement
- Planning, specs, and decisions happen in Cowork; implementation happens in Claude Code.
- Nothing settled in `CLAUDE.md` or a phase spec gets re-decided mid-implementation. Conflicts come back for a decision.
- Amar runs the manual steps and personally verifies acceptance criteria.
