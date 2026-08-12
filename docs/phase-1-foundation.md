# Phase 1 — Foundation

## Goal
Runnable app skeleton with the full schema, auth, roles, navigation shells, and synthetic seed data. Nothing fancy on screen yet — correctness of boundaries is the deliverable.

## In scope
- Prisma schema for ALL entities (so later phases never migrate destructively):
  District, School, Student, Guardian, GuardianStudent, User (staff), Account, LedgerEntry, MealEvent, Item, ItemSale, AuditLog, ImportRun, PricingConfig.
  - Unique: studentNumber per district; MealEvent (studentId, serviceDate, mealType); LedgerEntry.idempotencyKey.
  - All money columns integer cents.
- Auth.js credentials sign-in with seeded users for each role; session carries role + districtId + schoolIds.
- RBAC guard helpers in `server/auth/` (e.g., `requireRole`, `scopeToSchools`, `requireGuardianOf(studentId)`) — used by every server module from now on.
- Route group shells: `(guardian)`, `(pos)`, `(admin)` with role-gated layouts and the prototype banner.
- Seed script: 4 schools, ~200 students, realistic multi-child households with differing surnames, guardians linked via GuardianStudent, accounts with varied starting balances, one user per role.
- Prototype banner component rendered on every layout.
- **Multi-factor authentication for staff roles** (cashier, school staff, district admin, super admin): TOTP enrolment and challenge on sign-in. Guardians are single-factor. This is a named security requirement and a visible trust signal in the demo — seed each staff user with a pre-enrolled TOTP secret so the demo can show it without setup friction.
- **Sign-in protection:** rate limiting and progressive lockout on failed attempts, applied per account and per IP.
- **Design system foundation** built from `docs/design-system.md`: tokens as CSS variables, the `data-density` mechanism on each route group layout, and the base components (button, money display, prototype banner). No hardcoded colours or sizes anywhere after this phase.

## Out of scope
Deposits, transfers, POS logic, reports, import (later phases).

## Acceptance criteria (from PRD)
- Each role signs in and sees only its permitted surface and sample data.
- Staff sign-in requires a second factor; guardian sign-in does not.
- Repeated failed sign-ins are throttled and eventually locked.
- A guardian session cannot fetch another household's student by any API route (write a test).
- A cashier session cannot reach admin or guardian routes.
- `npm run seed` is idempotent (reset + reload).

## Human verification
Sign in as each of the five roles; attempt one out-of-scope URL per role and confirm denial.
