# Design specification — 7. Insights

"Show us things we can't see today." Every insight here must pass three tests: it uses data we already hold, it names an action, and it survives being wrong.

An insight that is occasionally wrong and always actionable is useful. An insight that is usually right and implies nothing is decoration.

---

## 7.1 The rules

1. **Every insight is a sentence plus an action.** Never a number alone, never a chart alone.
2. **State the rule in the UI.** "Ate regularly last month, hasn't this week, and is marked present." No hidden scoring, no unexplained model.
3. **Say when it may be nothing.** Hedging is honest and it protects the person acting on it.
4. **Dismissal is honoured.** "Not now" suppresses for a defined period; it does not resurface tomorrow.
5. **Nothing about an individual child appears on a dashboard.** Counts on the dashboard; names only behind a deliberate, audited action, to a role that should see them.
6. **No insight ever exposes a pricing tier.**

---

## 7.2 The insights worth building

### Operational — for the nutrition director

**Edit-check exception.** Counts above the ceiling for a school and day. Action: review the day, or mark reviewed with a note. Rule shown as a plain number, never "attendance factor".

**Participation rate.** Meals served against enrolment, by school, over time. This is the number a director is measured on and rarely has to hand. Action: compare schools, or compare to last year.

**Participation drop after a change.** "Lunch numbers at the Middle School are down 14% since the menu changed on the 8th." Action: look at that period.

**Line speed.** Median seconds per student, by school and service. Action: see which line and when. Cheap to compute — we already timestamp every meal — and it is the number a cafeteria manager cares about most.

**Roster staleness.** "The student list is 9 days old. New students can't buy snacks." Action: upload.

### Financial — for the business office

**Money leaving with graduates.** Total sitting with students in their final year, with a count. Action: see the list, or email those families. Under CEP this is the largest single source of family complaint.

**Arrears building.** How many students owe money, how much in total, and whether the trend is up. Action: contact those families, or review the charge policy. Only meaningful when not CEP.

**Auto top-up coverage.** What share of paying families have it on. Action: prompt the rest. This is the cheapest intervention against arrears.

**À-la-carte revenue by item and school.** What sells, what doesn't. Action: change the catalogue.

**Correction volume by cashier or school.** Not to police anyone — a spike usually means a broken register or a person who needs ten minutes of training. Frame it that way in the copy.

### Welfare — the sensitive one

**Students who have stopped eating.** Ate regularly last month, haven't this week.

Note the limitation honestly: we have no attendance data (D-12), so the rule cannot exclude children who were simply off school. That makes it weaker and more prone to false positives than it should be, which is exactly why the copy says "This may be nothing" and why the action routes to a person rather than triggering anything. **Attendance is worth asking the district for** — it would materially improve this signal, and it is a good reason to open that conversation.

This one carries the full set of guardrails from spec 2 §2.2: a count on the dashboard and never names; the default action routes to a counsellor rather than opening a list; viewing names is audited; never visible to a cashier, never in the guardian portal, never in a general export; the rule stated plainly; dismissal honoured; and the whole feature switchable off if the district's student services team wants it off.

**Why it is worth the care.** Under CEP the meal is free, so a child who stops eating produces no financial signal anywhere. The only system in the district that can notice is this one. That is a genuine reason to build it and a genuine reason to handle it carefully.

---

## 7.3 What we will not infer

Stated so it is a decision, not an oversight.

- **No individual risk scoring of children.** No "at risk" label attached to a student record.
- **No inference about a family's circumstances** from payment behaviour.
- **No sharing of welfare signals with anyone outside the district**, ever, including Venderly.
- **No use of eating patterns for engagement, marketing, or gamification.**
- **No comparison of one child to another**, anywhere a parent can see.
- **No prediction of eligibility.** Tier comes from the district's process, never from our data.

---

## 7.4 How insights are delivered

- **Dashboard** — the four or five that need a person today, newest and most consequential first.
- **Weekly digest** — an optional email to the director summarising the week, so the dashboard doesn't have to be visited daily.
- **Never a notification to a guardian about anything other than their own children.**

Each insight records when it fired, who saw it, what they did. That history is itself useful: "we flagged 34 edit-check exceptions last year and reviewed all of them" is exactly what a state reviewer wants to hear.

---

## Open questions for the district

1. Who should receive the welfare signal, and does student services want it to exist at all?
2. Is line speed something they'd act on, or is it a vanity metric here?
3. Do they track participation rate today, and against what target?
4. Would a weekly digest be read, or ignored?
