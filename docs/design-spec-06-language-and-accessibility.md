# Design specification — 6. Language and accessibility

The two cross-cutting layers. Both exist because the people using this are not technical, are often older, are frequently standing up in a loud room, and cannot be trained.

---

## 6.1 The language rule

**If a word exists because of how we built the system, it does not appear on screen.**

Ledger, entry, transaction, idempotency, reconciliation, adjustment, reallocation, deactivate, import, ingest, CSV, tier, eligibility, boolean, validation, null, timeout, 500, session. None of these are user words. Every one of them has a plain replacement.

### The replacement table

| System word | On screen |
|---|---|
| Ledger / ledger entry | Money history · money in and out |
| Transaction | Payment, charge, refund — name the specific thing |
| Balance | Snack money (CEP) · meal account (otherwise) |
| Insufficient balance | Not enough money · shown as meals remaining |
| Adjustment / reallocation / refund | Fix a mistake · give money back · move money |
| Reconciliation | Check the totals |
| Import / ingest CSV | Upload the student list |
| Deactivate student | Mark as left |
| Deactivate user | Turn off this person's access |
| Duplicate meal event | Already had lunch |
| Not active at school | Not at this school |
| Eligibility / tier / category | (never appears; for parents: "lunch costs $0.40 for Ella") |
| CEP | Free meals for all students |
| Effective date | These prices start on |
| Append-only / immutable | Nothing in the past ever changes |
| Audit log | What staff have done, and why |
| Idempotency | (never appears) |
| Session expired | You've been signed out |
| Validation error | (name the specific problem) |

### Sentence patterns

**Errors: what happened, then what to do. One sentence. No code, ever.**

| Situation | Copy |
|---|---|
| Wrong password | "That password doesn't match. Try again, or reset it." |
| Locked out | "Too many tries. Wait 10 minutes, or ask an administrator to help." |
| Network gone | "You've lost your connection. Nothing was lost — try again when you're back online." |
| Payment failed | "Your card wasn't charged. Check the details and try again." |
| Payment pending | "Your payment went through. The money will appear here in a moment." |
| File wrong type | "That file needs to be a .csv from Infinite Campus. This one is a .xlsx." |
| File too big | "That file is larger than we can read. Ask for an export without extra columns." |
| Row unreadable | "Row 412: the school code W9 isn't one of your schools." |
| Not allowed | "You don't have access to that. Ask a district administrator if you need it." |
| Nothing found | "No students match '10047'. Check the number, or search by name." |

**Empty states: an invitation, never an apology.**

| Screen | Copy |
|---|---|
| No students yet | "Upload your student list to get started." |
| No activity | "Nothing has happened on this account yet. Money added and meals taken will show here." |
| Dashboard clear | "Nothing needs you today." |
| No notifications | "You're up to date." |
| No corrections | "No mistakes have been fixed this month." |

**Buttons name the outcome, with the amount where money is involved.** "Move $42.00", "Give back $1.25", "Record 5 breakfasts", "Upload student list". Never Submit, OK, Confirm, or Save alone.

**Numbers are translated into the unit the reader thinks in.** Meals, not just dollars. Days, not timestamps. "9 days old", not a date.

**No exclamation marks. No "please". No "successfully" — the confirmation is the success. No "simply" or "just" — they condescend.**

---

## 6.2 Accessibility, written for this audience specifically

WCAG AA is the floor, not the goal. These additions come from who is actually using it.

### Sight

- Body text 16px minimum anywhere, 18px on the guardian portal, scaled by the POS density multiplier at the register.
- The interface must remain usable at 200% browser zoom — no horizontal scrolling, nothing clipped. Many older users run their machine zoomed permanently.
- Contrast: AA minimum, and verify the warning and danger washes specifically, which are the ones that usually fail.
- Never colour alone. Every state carries an icon and a word. A red dot means nothing to a colour-blind cashier.
- No text over images. No thin light-grey type on white.

### Motor

- 48px minimum targets at the register, 44px everywhere else, with real spacing between adjacent controls — a mis-tap in a lunch queue is expensive.
- No hover-only interactions anywhere. Nothing may be discoverable only by hovering.
- No drag-and-drop as the only way to do anything.
- No time limits on forms. If a session must expire, warn first and preserve what was typed.
- Generous click targets on the things people hit repeatedly: keypad, class-list tiles, Enter.

### Cognition and confidence

- One primary action per screen, visually obvious.
- Recognition over recall: show the charges to pick from rather than asking someone to type an amount; show class names rather than codes.
- Say what will happen before it happens, in a sentence, for anything involving money.
- Destructive or money-moving actions are confirmed once — never twice, which trains people to click through.
- Undo where the action is reversible; a documented correction where it isn't.
- Consistent placement: the primary action is always bottom-left of a form, navigation always in the same place.
- No jargon, no acronyms, no abbreviations that aren't already the district's own.

### Keyboard and screen reader

- Full keyboard operation on every surface, in visual order. The POS must be fully operable without a mouse — that is a speed requirement as much as an access one.
- Visible focus everywhere; `:focus-visible` ring, never `outline: none` without a replacement.
- Real `<label>` elements. Placeholder is never the only label.
- The POS result is announced through a polite live region — a screen-reader user must hear "Meal recorded, Marcus Okafor" not just see it.
- Headings in order, landmarks present, tables with real headers.
- `prefers-reduced-motion` respected; no animation is load-bearing.

### Testing that this is true

- A keyboard-only pass of every flow, performed by a person, recorded in phase 7.
- An automated contrast check in CI on the token pairs.
- A live-region check on the POS result.
- 200% zoom pass on all three surfaces.

---

## 6.3 Trust language

Sentences that appear verbatim in the product because they carry the product's promises. These are approved copy — do not paraphrase them.

**No student pronouns, anywhere.** We do not store gender (rule 9; the importer drops it at parse), so we cannot know a child's pronouns and must never guess. Use the child's name where one is in scope, "your child" where none is, and "they'll" only as a last resort. This applies to every generated sentence about a specific student — cards, week summaries, notifications, and alerts.

**Reassurance appears only to remove a specific plausible misconception.** Use it when a parent might wrongly think a child will be denied a reimbursable meal, or when a free-meal pattern could be mistaken for a payment problem. Do not add reassurance as general decoration.

- "Nothing gets erased. The original stays where it is, and your correction sits next to it with your name and the reason."
- "{Name} will still be served if it runs out."
- "Meals already served keep the price they were charged at. Changing these numbers never changes anything in the past."
- "3 columns were ignored: date of birth, race, and gender. This system doesn't store them."
- "These are your figures to check and submit. This system doesn't file claims."
- "This may be nothing."
- "PROTOTYPE — SYNTHETIC DATA. Not connected to Infinite Campus, PCS, or live payment processing."
