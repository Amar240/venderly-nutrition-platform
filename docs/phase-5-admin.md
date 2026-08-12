# Phase 5 — Admin operations

## Goal
District staff find any student in scope, explain any balance, correct mistakes with a paper trail, and export reports.

## In scope
- Student search by number or name, scoped to the session's district/schools.
- Student detail: current balance, full ledger history, meal events, item sales, linked guardians, audit history for that student.
- Correction workflows (district admin+): reallocation between accounts, refund, adjustment — each requires a typed reason, creates offsetting/new ledger entries, links related records, writes AuditLog.
- Documented duplicate-meal override (creates audited override record).
- Reports: daily meal counts per school (by meal type, service date, status); monthly deposits per school (deposits, transfers, refunds/adjustments, totals).
- Transaction export: filtered CSV download; every export writes an audit event (who, filters, when).
- Audit log viewer (super admin): actor, action, subject, time, source, reason, before/after.
- District dashboard: meal counts, deposits, adjustments, low-balance trend, open exceptions by school.
- **Super admin configuration screens** (the schema exists from phase 1, this builds the UI):
  - Item catalog: create, edit, deactivate a-la-carte items and prices. Editing a price never rewrites past sales — `ItemSale` keeps price at time of purchase.
  - Pricing config per district/school: CEP toggle, breakfast/lunch prices for free, reduced, and paid tiers, low-balance threshold.
  - School management and staff user management with role and school assignment.
  - Every configuration change writes an AuditLog entry with before/after values.
- **Notifications (in-app only for the pilot):**
  - A notification is generated on low balance crossing the threshold, deposit completion, and transfer completion.
  - Guardians see them in a bell/inbox on the portal; nothing is emailed or texted.
  - Every notification is written through `NotificationPort` so production can swap in GoHighLevel delivery without touching domain code.
  - Admin can view a delivery log — the evidence trail for "did the parent get told?"

## Rules that bite here
- School staff role: read-only. District admin: corrections within assigned schools. Super admin: config + audit visibility.
- Reports never expose eligibility categories.
- All report math derives from the ledger, not cached balances.

## Acceptance criteria (from PRD)
- An administrator finds a student, reviews the full ledger, makes an audited adjustment with a reason, and exports a report.
- The export appears in the audit log.
- History clearly shows both original and corrective activity.

## Human verification
Make a deliberate wrong deposit as guardian, correct it as admin, then read the child's history and audit log and confirm the story is fully reconstructible.
