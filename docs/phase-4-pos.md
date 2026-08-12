# Phase 4 — Cafeteria POS

## Goal
A cashier moves students through the line fast, never seeing eligibility.

## In scope
- Home screen: two large actions — Breakfast, Lunch. Touch-friendly (≥48px targets), fully keyboard-operable.
- Student number entry: physical keyboard and on-screen numeric keypad.
- Meal recording endpoint: server validates enrollment + school assignment (cashier's assigned school from session), duplicate guard (student+date+mealType), applies PricingConfig (default CEP: $0.00), creates MealEvent (+ ledger debit only if priced), returns ONLY an operational result:
  `recorded` / `duplicate` / `not_active_at_school` / `insufficient_balance` (a-la-carte only).
- Confirmation view: student name, school/grade if needed, neutral "Meal recorded". Auto-reset to entry in ~2s.
- A-la-carte tiles: seeded items with prices; deduct from balance; deny below-zero with a calm, non-judgmental message; sale stores price at time of purchase.
- Rate limiting on student-number attempts.

## Hard rules
- No eligibility category in any response payload, page source, client state, or log line — grep for it in the build output as a check.
- Cashier session has no route or API access to browse students, view balances beyond the a-la-carte decision, or adjust money.
- POS validation target: under 1 second end-to-end on local hardware.

## Acceptance criteria (from PRD)
- Cashier records breakfast/lunch from a student number with a clear confirmation and no visible eligibility category.
- Entering the same student twice for the same meal/date returns the duplicate message and records nothing.
- An a-la-carte purchase exceeding the balance is denied.

## Human verification
Serve 10 seeded students by keyboard only and time it; try a duplicate; try a wrong-school student number; view page source and network tab for eligibility leakage.
