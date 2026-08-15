# Design specification — 3. Guardian

Audience: parents, grandparents, foster carers, guardians sharing custody. Wide range of confidence with technology. Mostly on a phone, standing up, for under a minute.

---

## 3.0 The pricing model this design assumes

**Three tiers are the general case. CEP is a configuration of it, not the design.**

Every student carries a price tier — free, reduced, or paid — and every meal is priced per student per meal type from district or school configuration. A CEP district is simply one where all three tiers resolve to $0.00 for breakfast and lunch while à-la-carte still charges.

This matters because:
- Most districts are not CEP. Paying for meals is the primary flow almost everywhere.
- Woodbridge is CEP today (Delaware DOE, ISP 54.82%, district-wide) but CEP is renewed against a threshold, and districts do exit it.
- Venderly will sell this beyond Woodbridge.

Demo data therefore holds a realistic mix — roughly 65% free, 8% reduced, 27% paid for a district of this profile — so that flipping the CEP setting off produces a working non-CEP district using the same students, screens, and code. That flip is the strongest thing in the demo.

### Amendment to decision D-1

D-1 restricted `StudentPricing` to `server/meals` so a tier could never reach a cashier. A parent, however, must be able to see what their own child's lunch costs. The household view is therefore a **second authorised reader**, scoped through the verified guardian-student relationship.

Confidentiality was always about the cashier, other families, and general reports — never about the child's own parent. Cashier-facing code, POS payloads, exports and logs remain tier-free. See the updated D-1 in `decisions.md`.

---

## 3.1 Home

One card per child, in this order:

1. Did they eat today
2. How many meals the balance covers, and what a meal costs
3. Any warning
4. Actions

**Balance is expressed in meals first, money second.** "About 21 more lunches" then "$8.40 · lunch costs $0.40". Dollars alone are meaningless across tiers — $10 is a fortnight for a reduced-price child and three days for a paid one. Meals remaining is the number a parent is actually computing in their head.

**Low balance is a meals threshold, not a dollar threshold.** Default: fewer than 5 meals remaining. A single dollar threshold would fire constantly for paid families and never for reduced ones.

**The reassurance line is mandatory on any low or negative state**: "He'll still be served if it runs out." Federal rules and most state policies mean a child is fed regardless. Saying it prevents the panic that makes parents call the school, and it is the single most humane sentence on the screen.

Under CEP the same card renders with meals free and only à-la-carte money shown — no separate design, no separate code path.

---

## 3.2 Adding money

The highest-traffic screen in a non-CEP district.

**Suggested amounts are shown in meals, not round numbers**: "$13.75 · 5 lunches", "$55 · 20 lunches", "$110 · 40 lunches". Round dollar amounts are a bank's framing; meals are the parent's.

**Splitting across children is the same screen**, with each child's price and current meals-remaining shown beside their input, and a running total. Never a separate "split deposit" flow.

**Automatic top-up** is offered at the point of payment, phrased as a rule in plain words: "When Marcus drops below 5 lunches, add $55 again. You can stop this any time." This is what paid families actually want, and it is the most effective prevention for meal charge debt.

Rules for auto top-up: an explicit opt-in, a visible list of active rules, one-tap cancellation, a notification every time it fires, and a hard monthly ceiling the family sets. It must never be able to run away.

---

## 3.3 When the money runs out

Unavoidable in any non-CEP district, and one of the most common sources of complaint in school nutrition.

**The child is always served.** The system never denies a reimbursable meal for lack of funds — only à-la-carte extras are denied.

**The balance goes negative and is shown honestly**, framed as owed rather than as failure: "Marcus's lunches have cost $8.25 more than the money on his account."

**The district's unpaid meal charge policy is surfaced, not hidden.** Every district must have a written one. The guardian screen links to it in the district's own words.

**Debt is communicated privately** — never at the register, never in front of other students, never to the child. This is the difference between a system that respects families and one that shames them.

**Admin needs a matching view**: who is in arrears, by how much, for how long, with a way to contact those families as a group and a way to write off a balance with a reason and an audit entry.

---

## 3.4 A child's week

Days across, breakfast and lunch down, with a plain summary above: "He's had breakfast every day and lunch twice."

- Today and past days only; future days are dashes.
- Weekends and closure days absent, not shown as missed.
- Purchases listed separately with dates and prices.
- One persistent line explains the model for that child: either "Breakfast and lunch are free for every student at Woodbridge" under CEP, or "Lunch costs $0.40 for Ella" otherwise.
- "Tell me when he doesn't eat" turns on the notification at the moment the intent forms.

**Deliberately absent**: what the child ate, portions, nutrition. We record a meal event, not a menu selection, and inventing detail we don't hold would destroy trust the moment a parent noticed.

---

## 3.5 Moving money between children

- Proactive prompt in a child's final year: "Ella finishes at Woodbridge in June. Any money left after her last day can't be used."
- From and to shown as whole children with current amounts, not dropdowns.
- "All of it" and "Half" shortcuts.
- Confirmation as a sentence, with both resulting balances and both resulting meal counts.
- "Both children's activity will show this, so you can always see where it went."
- Button names the action and amount. Instant, never pending.

---

## 3.6 Notifications the family controls

Plain-language toggles; low balance on by default, everything else off:

- When my child doesn't eat lunch
- When their meals are running low
- When money is added, moved, or topped up automatically
- When they owe money
- A weekly summary on Sunday evening
- End-of-year reminder about leftover money

Family chooses the channel. Every notification links to the screen that explains it. No marketing. One obvious way to turn everything off. In-app only for the pilot (D-5); production delivery swaps in behind `NotificationPort`.

---

## 3.7 Households that aren't simple

- **Two guardians, separate homes.** Both see the same children and who added money — attribution prevents "I already paid for that".
- **Different surnames.** Already in the seed; worth showing because most systems get it wrong.
- **Children at different schools**, with different prices and different service times.
- **A child who leaves mid-year.** Status is clear and the money remains movable or refundable.
- **Removing a guardian's access.** Immediate and total. A safeguarding matter, not a settings change.

---

## 3.8 Free and reduced applications — named future module

Not designed here, but the product must show it knows this exists and where it plugs in. In a non-CEP district this is how a student gets a tier at all:

1. Family applies online, or is **directly certified** through a SNAP/TANF data match without applying.
2. District reviews and approves, assigning free, reduced, or paid.
3. Family is notified in writing of the outcome and their appeal rights.
4. The district **verifies a sample** of approved applications annually.
5. Tier changes flow into `StudentPricing` with effective dates, so historical charges stay correct.

Sensitivity: application data is materially more sensitive than roster data. Nothing from it reaches the POS, exports, or any report — only the derived tier crosses the boundary, exactly as it does today.

---

## 3.9 What we deliberately do not build

- Menus and nutrition information — data we don't hold.
- Allergy or dietary flags — clinical, belongs to the health office, higher duty of care.
- Anything comparing one child to another.
- Any use of eating patterns for marketing or engagement.

---

## Open questions for the district

1. What is Woodbridge's written unpaid meal charge policy, and how do they want it worded to families?
2. Should both guardians in separate households see each other's payments?
3. Is there a cap on how negative a balance may go before a different process starts?
4. Who authorises removing a guardian's access, and how quickly must it take effect?
5. If CEP were to end, where would tiers come from — FRAM, or a district-supplied list?
