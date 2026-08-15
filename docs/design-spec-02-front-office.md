# Design specification — 2. Front office and nutrition director

Audience: the nutrition director, front-office staff, school secretaries. Often the same one or two people doing everything. Competent, busy, not technical, and — where money is concerned — cautious, because a mistake is embarrassing and hard to explain.

---

## 2.1 The daily dashboard opens on work, not numbers

Most district software opens on a wall of metrics nobody acts on. This opens on a short list of things that need a person today, each written as a fact plus a next action. The numbers sit underneath, where they belong.

**The header states the whole situation in one line:** "4 things need you · everything else is running normally." On a good day it reads "Nothing needs you today", which is a feature, not an empty state.

### The four kinds of item

**1. Edit check exception.** "Lunch counts look high at Woodbridge High. Tuesday recorded 689 lunches. The most you'd expect for that day is 661."

This is the federally required monthly check, done automatically and in advance rather than in a spreadsheet at claim time. Never show the phrase "attendance factor" — show the ceiling as a plain number. Actions: look at the day, or mark reviewed (which records who reviewed it and when, because that is exactly what a state administrative review asks for).

**2. Students who have stopped eating.** The welfare signal, and the most sensitive thing in the product. See §2.2 for the rules governing it.

**3. Roster staleness.** "The student list is 9 days old. New students since then won't be able to buy snacks." States the consequence, not the fact. Links straight to upload.

**4. Money that will be lost.** "$1,284 sitting with students who leave in June." Under CEP this is pure family money, and it is the thing families are angriest about when it vanishes. Offering to email those families is a service the district can be seen to provide.

### The numbers below

Four only: meals served, participation rate, snack money added, corrections made. Participation rate is the one a nutrition director is measured on and rarely has to hand.

---

## 2.2 Rules for the welfare signal

A list of children who have stopped eating is not an ordinary report. It is a safeguarding-adjacent inference produced by software, and it must be designed with that in mind.

Binding rules:

1. **It is a prompt to a human, never a conclusion.** The wording says "This may be nothing."
2. **Names are not on the dashboard.** The dashboard shows a count. Names appear only after a deliberate action, to a role that should see them.
3. **Route it to the right person.** The default action is "Send to counsellor", not "View list". The nutrition director does not need the names to do their job.
4. **Access is audited.** Viewing this list is a logged event with actor and time.
5. **It is never shown to a cashier, never in the guardian portal, and never exported in a general transaction file.**
6. **The rule is stated plainly in the UI**: ate regularly last month, hasn't this week, and is marked present at school. No hidden scoring.
7. **Dismissal is honoured.** "Not now" suppresses that student for a defined period rather than resurfacing daily.

If the district's counsel or student services team wants this off, it must be switchable off without affecting anything else.

---

## 2.3 Student search and record

**Search** takes a name or a number in one field and requires no choice about which. Results show name, grade, school. Nothing else — a search results list is not a place for balances.

**The record** is arranged as a story, not a database view:
- Who they are, where they are, how much snack money they have
- What they ate recently, with the same "did they eat" framing families see
- Money in and out, most recent first, with corrections shown beside the thing they corrected
- Who their guardians are
- What staff have done to this record, and why

No pricing tier appears anywhere on this page, for any role.

---

## 2.4 The correction flow

This is where a non-technical person touches money, and where the interface has to remove fear.

**It starts with what happened, not what to do.** "Charged twice for a snack" / "Wrong student charged" / "Snack was returned" / "Something else". The staff member picks the situation in their own words; the system decides whether that is a refund, an adjustment, or a reallocation. They never choose between those three words, because those are our words, not theirs.

**It shows the actual charges** so they select the real transaction rather than typing an amount. Typing an amount is how errors get made.

**The reason field is pre-filled with context and labelled honestly** — "Saved with your name". People write better reasons when they know the reason is kept.

**"Here's what will happen"** shows the balance before and after, in a sentence, before anything is committed. The button then names the outcome: "Give back $1.25", never "Submit".

**The fear is addressed directly**: "Nothing gets erased. The original charge stays where it is, and your correction sits next to it with your name and the reason. Marcus's family will see both."

That last clause is deliberate. Telling staff the family will see the correction changes behaviour for the better, and it is true.

---

## 2.5 Uploading the student list

Called "student list", never "roster import" or "CSV ingestion".

Three steps, each on its own screen: choose the file → read what will change → confirm.

The middle step is the whole design. Before anything is written it says, in plain words: how many students are new, how many changed school or grade, how many are no longer in the file and will be marked as left, and how many rows could not be read and why — with the row number and the specific problem, not an error code.

**The safety stop.** If more than a tenth of active students would be marked as left, the screen stops and says so: "This file would remove 214 of your 2,681 students. That usually means the file is incomplete." Continuing requires a deliberate second action, and that confirmation is recorded.

**The closing line of the result** is the data-minimization promise made visible: "3 columns were ignored: date of birth, race, and gender. This system doesn't store them."

---

## 2.6 Language rules for this surface

| Never | Always |
|---|---|
| Ledger, entry, transaction | Money in and out, charge, payment |
| Reconciliation | Checking the totals |
| Adjustment / refund / reallocation | Fix a mistake, give money back, move money |
| Import, ingest, CSV | Upload the student list |
| Insufficient balance | Not enough snack money |
| Eligibility, tier, category | (never appears) |
| Deactivate | Mark as left |
| Idempotency, audit trail | Kept with your name and the reason |

Every error says what happened and what to do next, in that order, in one sentence, with no error code visible.

---

## Open questions for the district

1. Who should receive the "stopped eating" list — counsellor, nurse, principal, or nobody?
2. Who currently performs the edit check, and would they trust it being done automatically?
3. What does the district do today with leftover balances at graduation?
4. Who is allowed to fix a mistake — front office, or only the director?
