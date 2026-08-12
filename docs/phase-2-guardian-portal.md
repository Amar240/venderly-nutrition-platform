# Phase 2 — Guardian portal

## Goal
A guardian manages their household's meal money without staff help.

## In scope
- Household dashboard: one card per linked child — name, school, grade, current balance (derived from ledger), low-balance state (configurable threshold, default $10.00).
- Child transaction history: chronological ledger view per child (deposits, purchases, transfers, adjustments) with clear signs and running context.
- Test deposit flow: choose one child or split across two or more linked children → redirect to the simulated hosted checkout page → on the verified simulated event, create ledger credit(s) → receipt/confirmation view.
- Sibling transfer: pick source child, destination child, amount ≤ available balance; clear source→destination confirmation before commit; linked debit+credit with one transferRef in one transaction.
- Balance updates visible immediately after deposit or transfer.

## Rules that bite here
- Every query goes through `requireGuardianOf` — the household boundary is enforced server-side.
- Amount inputs validated with Zod: positive, integer cents, transfer ≤ source available balance.
- Deposit credits carry the simulated event id as idempotency key (replaying the event must not double-credit — test this).

## Out of scope
Real payment provider, outbound email/SMS, admin views.

## Explicit deferral — guardian claim and invitation
The PRD lists a secure invitation or claim process under household management. The pilot does not build it: guardians and their links are seeded, because the authoritative source for those relationships is still an open decision (see `open-decisions.md`, item 1). This is a deliberate deferral, not an oversight. If asked in the demo, the honest answer is that household linking depends on what Infinite Campus can provide, and the design follows that answer.

## Acceptance criteria (from PRD)
- A guardian completes a deposit simulation (including a split deposit) and a sibling transfer without staff assistance.
- Guardian sees only their household; a second seeded guardian sees a different household.
- Transfer shows a linked pair in both children's histories with the same transfer reference.

## Human verification
Run the flows as the seeded two-child guardian; try to transfer more than the balance; replay the checkout callback URL and confirm no double credit.
