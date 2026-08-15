# Design specification — 4. Business office and super admin

Audience: the person who reconciles the money and answers to an auditor, plus whoever configures the district. Detail-oriented, accountable, and usually the least tolerant of software that cannot explain itself.

---

## 4.1 The money history is written as sentences, not rows

This is the differentiator, and it is a writing problem more than a layout problem.

Every ledger entry renders as a sentence naming the actor, the action, and the context:

- "Drew Garcia gave back $1.25 for a cookie charged twice"
- "Dana Whitfield moved money from Ella"
- "Bought a cookie at Woodbridge Middle · rung up by Casey Nguyen"
- "Dana Whitfield added money online · confirmed by the payment provider"

**A correction is visibly tied to what it corrected.** The correction carries an indented line — "Corrects: Cookie, today 12:04pm, −$1.25 — still in the history below" — and the original stays in the list, dimmed and labelled "corrected above". Both are present. Nothing is hidden, nothing is removed, and a reader can follow the whole story without knowing what a ledger is.

**The reason is shown in quotes, verbatim.** That is what an auditor asks for, and it is why the reason field is worth insisting on at the moment of correction.

Design rules:
- Newest first.
- Money in is success-coloured with a plus; money out is plain with a minus. Never red for ordinary spending — a child buying a cookie is not an error.
- Transfers name the other child and state that the pair appears on both histories.
- Deposits name the payment as provider-confirmed, which is the visible form of "we never trusted the browser".
- Two actions at the foot: download this history, fix a mistake.

---

## 4.2 Meal prices and the free-meals-for-all switch

The configuration screen that also happens to be the strongest ninety seconds of the demo.

**The CEP switch is expressed in the district's language**, not the acronym: "Free meals for all students is on. Breakfast and lunch cost nothing for every student, whatever their category. Snacks are still charged. This is how Woodbridge runs today."

**The six tier prices are always visible**, even when the switch is on, labelled "Prices if free meals for all is turned off" and explained: "Kept ready so nothing has to be rebuilt if the district's status changes."

That framing does two jobs. It tells Woodbridge you understand CEP is renewed against a threshold and could end. And it tells Venderly the same product sells to a district that charges, without a rebuild.

**Each row shows how many students it affects** — free 1,768, reduced 218, full price 734. A price change is abstract until you see who it lands on.

**Low balance is configured in meals, not dollars**: "Warn families when they have fewer than 5 meals left."

**Prices carry an effective date**, and the screen states the guarantee plainly: "Meals already served keep the price they were charged at. Changing these numbers never changes anything in the past."

**The demo flip.** Turning the switch off re-renders every guardian and admin screen with real prices, depleting balances, low-balance warnings, and arrears — same students, same code. Rehearse this; it is the moment that proves the product is not a single-district prototype.

---

## 4.3 Month-end

One screen that answers "can I close the month?", as a checklist rather than a report:

- Meals recorded per school per day, with any edit-check exceptions still unreviewed shown at the top
- Money in: payments, transfers, refunds, adjustments, with a total
- Corrections made this month, each with actor and reason
- Anything unresolved — unreviewed exceptions, imports that failed, arrears above the district's threshold

Every figure is derived from the ledger. Nothing on this screen reads a cached balance.

Closing the month is an explicit action that records who closed it and when. It does not lock anything — corrections after close are still permitted, and appear as post-close corrections, which is what an auditor expects to see rather than a period that silently changed.

---

## 4.4 Exports

- Choose what, choose which schools, choose dates. No query builder.
- The screen states what will be included and how many rows before the download.
- Every export writes an audit entry: who, which filters, when, how many rows. That entry is visible in the audit viewer immediately.
- No pricing tier column, in any export, ever.
- CSV cells are escaped and formula-injection guarded — these files are opened in Excel by finance staff.

---

## 4.5 Configuration, in plain language

**Items and prices.** Name and price. Deactivating an item hides it from the register and keeps every past sale intact at the price charged. The screen says so.

**Schools.** Name and code. Codes match the roster file so imports resolve.

**Staff accounts.** Create a person, choose what they can do — described by capability, not role name:
- "Works a register" (cashier)
- "Looks up students at their school" (school staff)
- "Fixes mistakes and runs reports" (district admin)
- "Manages everything, including staff" (super admin)

Staff are **turned off, never deleted**, because the audit trail points at them. A deleted user orphans years of history. Turning someone off is immediate, reversible, and audited.

The second factor is set up once and shown once, with the warning that it cannot be shown again.

---

## 4.6 The audit viewer

For the super admin, and for the day a state reviewer sits down beside them.

- Filter by person, by kind of action, by date, by student.
- Every row is a sentence, same voice as §4.1.
- Sensitive views are themselves audited — including opening the list of students who stopped eating.
- Exportable, and the export is audited.

**What must be in the audit trail**, non-negotiable: sign-ins, every money correction with reason, transfers, meal overrides, exports, imports and their confirmations, configuration and price changes with before and after, staff account changes, and access to any welfare list.

---

## 4.7 Language rules for this surface

| Never | Always |
|---|---|
| Ledger entry, transaction record | Money in and out |
| Reconcile | Check the totals |
| Void, reverse | Give back, fix |
| Deactivate user | Turn off this person's access |
| CEP | Free meals for all students |
| Effective date | These prices start on |
| Immutable, append-only | Nothing in the past ever changes |

---

## Open questions for the district

1. Who closes the month today, and what do they check before they do?
2. What does the business office need in an export that their current system doesn't give them?
3. Does a state reviewer sit with the software during an administrative review, or with printouts?
4. At what arrears level does a different process begin?
