# Phase 7 — Demo hardening

## Goal
Everything runs end-to-end, looks finished, and the demo can't be embarrassed by an edge case.

## In scope
- Responsive pass: guardian portal on phone-width, POS on tablet-width, admin on laptop.
- Accessibility pass: keyboard-only walkthrough of all three surfaces, visible focus, WCAG AA contrast check, labels, no color-only states. (Run the ui-ux-pro-max skill's review here if useful — accessibility findings outrank style suggestions.)
- Empty/error states everywhere: no data, network failure, denied action — calm, written in plain language.
- Prototype labels verified on every surface, including print/export outputs.
- Demo data polish: household names that read naturally, balances that make the low-balance state visible, one pre-seeded correction so history has depth.
- Seed reset command so the demo can be re-run identically.
- `docs/demo-script.md` following the PRD sequence:
  1. POS: choose Lunch, enter student number, fast neutral confirmation.
  2. Guardian: two children, test deposit, sibling transfer.
  3. Admin: linked ledger entries, audited correction, reports.
  4. Close: import view + data-minimization promise (show the dropped columns line).
- Optional showcase: a pitch landing page for the Venderly presentation — this is the ONE place 21st.dev components are welcome.

## Acceptance criteria (from PRD)
- All workflows run end-to-end with synthetic data and prototype labels.
- The scripted demo runs start to finish twice in a row after one seed reset, with no dead ends.

## Human verification
Perform the full demo script yourself, on the actual hardware you'll present with, at least twice.
