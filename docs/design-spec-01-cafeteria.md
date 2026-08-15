# Design specification — 1. Cafeteria

Part of the end-to-end redesign. Audience: cafeteria staff, often standing, often loud, sometimes new, sometimes not confident with computers. Nothing on these screens may require thought.

---

## Governing principles for this surface

1. **One decision per screen.** The cashier chooses a meal, then enters students. Nothing else is ever asked of them.
2. **The meal being served is always visible.** Cashiers forget which mode they're in and record breakfasts as lunches. It sits in the header, in colour, for the whole session.
3. **No system vocabulary.** "Already had lunch", not "duplicate meal event". "Not enough snack money", not "insufficient balance".
4. **Every result names the child.** The cashier's real job is matching a screen to a face. Name and grade, always.
5. **Nothing about eligibility, ever** — not on screen, not in a payload, not in a log.

---

## 1.1 Serving screen (student number entry)

**Layout**: meal badge and school top-left, session count top-right, large number display, 3×4 keypad, two secondary actions.

**Session count.** "147 served today" is not decoration. It gives the cashier confidence the system is working, gives the manager a number without opening a report, and is the raw input to the edit check the district must perform monthly.

**Undo last student.** New, and the single biggest usability win available here. A cashier will mis-key a number. Today that means calling an administrator to make a correction — so in practice it never gets fixed, and the count is wrong. Instead: for 90 seconds after an entry, "Undo last student" reverses it.

Implementation rules for undo:
- It does not delete the meal event. It writes a reversing record and an audit entry, consistent with append-only.
- It is limited to the last entry, within 90 seconds, by the same cashier, at the same school.
- After 90 seconds it disappears and the correction becomes an administrator's job.
- The audit entry records cashier, student, meal, and time.
- A reversal sets `reversedAt` and `reversedByUserId` on the retained event and
  appends its audit evidence in the same transaction. Live uniqueness uses a
  partial index, so entering the student again creates a normal event rather
  than an override.
- Reimbursable totals use only live normal events: `overrideSeq = 0` and
  `reversedAt IS NULL`. Reversed events never enter daily totals or claim
  figures; administrator overrides remain a separate count under D-10.

**Keypad**: minimum 62px targets. Physical keyboard works identically — digits type, Enter submits, Escape clears. Never require the mouse.

**After Enter**: the result replaces the keypad area at full width for ~2 seconds, then the screen resets to an empty number field with focus restored. The countdown is visible so the cashier knows the screen is about to clear rather than wondering if it froze.

### Result states

| State | Headline | Sub-line | Colour |
|---|---|---|---|
| Recorded | Meal recorded | Child name · grade | Success |
| Duplicate | Already had lunch | Child name · nothing recorded | Warning |
| Wrong school / unknown / inactive | Not at this school | Check the number and try again | Warning |
| À-la-carte denied | Not enough snack money | Meal is still free — snack not sold | Danger |

Two deliberate choices. Unknown numbers, inactive students, and students from another school all produce the same message, so the screen cannot be used to discover whether a student number exists. And the à-la-carte denial explicitly says the meal is still free, because under CEP a denial must never read as "this child doesn't get to eat."

---

## 1.2 Roster mode (Early Childhood Center and elementary)

Woodbridge runs an Early Childhood Education Center and Phillis Wheatley Elementary. Four-year-olds do not know their student number, and typing one per child is unworkable at that age. Roster mode is not a nice-to-have — without it the product does not work at two of their six schools.

**Flow**: choose meal → choose class (teacher name, not a code) → tap each child who ate → one action records the whole class.

**Design rules**
- Names are first name plus last initial — enough to identify, less exposed if the screen is visible to a room.
- Tiles are minimum 44px tall with a clear selected state carrying both colour and an icon.
- Children already recorded today appear dimmed and non-interactive, labelled "already recorded". They cannot be double-recorded and the cashier can see why.
- The footer states the whole picture in plain words: how many selected, how many not eating, how many already done.
- The commit button names the number: "Record 5 breakfasts". Never just "Submit".
- Recording is one transaction. If any child fails, nothing is recorded and the screen says which child and why.
- Undo applies to the whole batch for 90 seconds.

**Who uses it**: a cashier, but also potentially a teacher or aide bringing a class through. Design for the least-trained plausible operator.

---

## 1.3 À-la-carte

Reached from the serving screen, returns there when done. Item tiles show name and price in large type. Choose item → enter student → result. Prices come from configuration and are never typed at the register.

Denial wording matters: "Not enough snack money" plus "Meal is still free — snack not sold". A child is never told they cannot eat.

---

## 1.4 Shift start and end

Two screens a new cashier can follow without training.

**Start of service**: confirms who is signed in, which school, and which meal. One button: "Start serving". This exists because the most common serious error is a cashier recording an entire lunch service under breakfast.

**End of service**: shows what happened — meals recorded by type, snacks sold, anything undone — and a single "Finish" action. It is a receipt for their shift, and it is what a manager glances at.

Neither screen shows money totals to a cashier beyond snack sales, and neither shows anything about individual students beyond counts.

---

## 1.5 What the cashier can never do

Stated here because it is a design guarantee, not an oversight: browse or search students, see a balance except as an à-la-carte decision, see any eligibility information, adjust money, or view another school. These are enforced server-side and verified by test.

---

## Open questions for the district

1. How many serving lines run at once per school, and do they share one device or one each?
2. At the Early Childhood Center, does a teacher or the cafeteria staff record breakfast?
3. What happens today when the network drops during service?
4. Does anyone need to record a second meal for a child, and under whose authority?
5. Where does class/homeroom assignment actually come from, and how often does it change? Not in the confirmed Infinite Campus export (see D-13) — the pilot seeds this directly and gives admins a manual screen until we know the real source.
