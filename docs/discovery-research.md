# Discovery research — what Woodbridge actually needs, and what will impress them

Desk research, August 2026. Sources are public: Delaware DOE publications, district RFPs, USDA/state agency guidance. Nothing here is from a Woodbridge staff interview — every inference is marked as such and should be validated in the walkthrough.

---

## 1. The finding that changes the pitch

**Woodbridge School District is confirmed CEP, district-wide, for 2026.**

From the Delaware Department of Education's own CEP annual notification:

| Field | Value |
|---|---|
| LEA | Woodbridge — 9535000070 |
| Identified Student Percentage | **54.82%** |
| Eligible to participate | Yes |
| **Currently participating** | **Yes — district-wide (all schools)** |
| Schools | 6 |
| Enrollment | 2,720 |

School by school:

| School | ISP |
|---|---|
| Woodbridge Early Childhood Education Center | 58.00% |
| Phillis Wheatley Elementary School | 54.32% |
| Woodbridge Middle School | 54.31% |
| Woodbridge High School | 51.96% |
| S.C.O.P.E. North | 51.61% |
| S.C.O.P.E. South | 70.59% |

This settles open decision #1. Do not ask them whether they are CEP — tell them you know, cite the state publication, and show that the product was configured for it before the conversation started. That single move reframes you from vendor to someone who did the homework.

**What it means for the product.** Under CEP, breakfast and lunch are free for every student, so there is no lunch money. All family money in this system is à-la-carte only. That is not a smaller product — it is a *different* one, and the pitch has to change accordingly:

- The platform is a **meal counting and operations system** (still federally required — see §4), plus
- a **family à-la-carte balance system**, plus
- an **audit and reporting system** for the business office.

Sibling transfer becomes *more* important under CEP, not less. Leftover balances are pure family money paid in for snacks — nobody accepts losing that when a child graduates. Lead with it.

**The risk to name out loud.** ISP is 54.82% today; CEP requires 25% to stay eligible. Woodbridge has comfortable headroom, but ISP moves, and districts do exit CEP. That is exactly why the platform keeps free/reduced/paid pricing configurable rather than hard-coding $0. Say this — it shows you designed for their next four years, not their current year.

---

## 2. The real district (use these names in the demo)

Our seed currently has 4 invented schools and 200 students. Change it to the real six schools with proportional enrollment (~2,720 total, scaled down if needed for demo speed).

When a nutrition director sees *Phillis Wheatley Elementary*, *S.C.O.P.E. North*, and *Woodbridge Early Childhood Education Center* in the school dropdown, the demo stops being a generic product tour. Cost: an afternoon of seed work. Value: disproportionate.

Note the grade span: an Early Childhood Education Center plus an elementary school means a meaningful share of students are 3–8 years old.

---

## 3. Stakeholders and what each one is actually hiring the product to do

| Who | Their job to be done | What makes them say no |
|---|---|---|
| Nutrition director | Serve every child, claim correctly, survive the state administrative review | Anything that puts the claim or the review at risk |
| Cafeteria manager | Get 400 kids through in 25 minutes without a queue backing into the hall | Slow lookups, fragile hardware, anything needing a decision at the register |
| Cashier | Not be the reason a child is embarrassed; not make mistakes | Screens that show things they shouldn't see; ambiguous errors |
| District IT / SIS admin | One reliable roster feed, no student data sprawl, no new attack surface | Vendors wanting broad Infinite Campus access or holding student data loosely |
| Business office | Explain every dollar; reconcile; survive audit | Balances that can be edited; missing trails |
| Parent | Know the balance, top up in under a minute, move money between siblings | Fees, another password, a portal that doesn't show all their children |

Inference to validate: at Woodbridge's size, the nutrition director and business office are likely the same one or two people, and IT is a small team. That favours a product that reduces work over one with more features.

---

## 4. The obligation nobody mentioned — meal count edit checks

CEP removes household applications. **It does not remove edit checks.**

USDA requires sponsors to perform daily meal count edit checks before filing a monthly claim: compare each day's counts against enrolled students multiplied by an annual attendance factor (a state-published percentage, typically 91–94%). Counts exceeding that ceiling are flagged for investigation. This is a standard item in a state administrative review.

**We do not do this today.** It is the single highest-value thing we could add, for three reasons:

1. It is a real, recurring, federally-mandated task the nutrition director does now — probably in a spreadsheet.
2. We already hold every input: daily counts by school and meal type, and enrollment.
3. Knowing it exists is itself the credential. Most vendors pitching a "school lunch app" have never heard the phrase *edit check*.

Recommended: a report showing, per school per day, meals served, enrollment × attendance factor, and a flag when counts exceed the ceiling. Perhaps a day's work on top of the reporting we already have.

Related requirements worth knowing and being able to speak to, even if the pilot doesn't build them: production records, Offer versus Serve, Smart Snacks limits on à-la-carte items, adult meal pricing, and the district's written unpaid meal charge policy.

Also relevant under CEP: if a student declines enough components to make the meal non-reimbursable, the district may charge the items à-la-carte instead. Our POS has no concept of an incomplete meal — worth raising as a known design question rather than being caught by it.

---

## 5. What districts actually demand — the front/back of house split

District procurement documents consistently divide this software in two. Reynolds School District's RFP (which replaced PrimeroEdge with LINQ) states it plainly:

> "Front of the house" functions include all Point of Sale (POS) activities, Free and Reduced Meal benefit processing, customer account management, customer meal payments, and any communications with parents/guardians. "Back of the house" functions include site setups and maintenance, purchasing, order processing, inventory management, menu planning, production management, central warehouse for commodity tracking, claiming and financials, timekeeping and volunteers and marketing.

Map that against what we have built:

| Function | Us |
|---|---|
| Point of sale | ✅ built |
| Account management | ✅ built |
| Family payments | ✅ simulated, production-shaped |
| Parent communication | ⚠️ in-app only; GoHighLevel behind a port, unwired |
| Free/reduced benefit processing | ❌ not built (CEP makes it moot today, not forever) |
| Site setup and configuration | ✅ built |
| Claiming and financials | ❌ not built — deliberately not a claiming source |
| Inventory, purchasing, warehouse | ❌ not built |
| Menu planning, nutrient analysis | ❌ not built |
| Production records | ❌ not built |
| Timekeeping, volunteers, marketing | ❌ not built |

**We have built most of front-of-house and none of back-of-house.** Say so first, before they discover it. The honest framing is strong: *"We built the half your families and cashiers touch every day, to a standard we can defend line by line. Back-of-house is a deliberate later conversation, and we'd rather integrate than pretend."*

Note that FNS does not mandate any particular POS system — there is no certification barrier to a new vendor. The barrier is trust, which is what the ledger and audit story is for.

---

## 6. A design gap our POS has: young children

Woodbridge has an Early Childhood Education Center and an elementary school. A meaningful share of students are 3–8.

Our POS assumes a cashier types a student number. Four-year-olds do not know their student number, and typing one per child at an ECEC is slow. Districts commonly use a **roster or class-list mode** at that age: the class arrives, the cashier taps names from a list, or the teacher records the class in one action.

This is the kind of gap a cafeteria manager spots in ten seconds. Two options, both defensible:

- Build a simple roster mode for the ECEC and elementary before the demo, or
- Name it explicitly as a known requirement, with a sketch of how it would work.

Naming it unprompted is worth more than most features you could add.

---

## 7. Competitive reality

The market is consolidated and districts do switch — Reynolds moved from PrimeroEdge to LINQ. The names Woodbridge will know: **LINQ** (formerly Titan, large K-12 nutrition suite), **PrimeroEdge**, **Nutrislice** (menus), **MySchoolBucks/Heartland** (parent payments), and — critically — **Campus Food Service**, Infinite Campus's own module, marketed as natively integrated with the SIS they already run.

Expect the question: *why not just buy the module from our existing vendor?*

Do not dodge it. Honest differentiators, in order of strength:

1. **Sibling transfer as a first-class flow.** Repeatedly cited as a family pain point; rarely handled well.
2. **An explainable money trail.** Append-only ledger, corrections as new offsetting entries, a database that physically rejects updates and deletes. You can demonstrate this live in psql.
3. **Deliberate data minimization.** You import six fields and drop three, provably, and you can show the test that proves it.
4. **Eligibility confidentiality by construction.** The tier is not merely hidden — it is in a separate table the POS code cannot reach, and you can grep the shipped bundles to prove it.
5. **Line speed as a design constraint**, not a marketing claim.

What you should concede: they have back-of-house, claiming, menus, inventory, and years of state review experience. You do not.

---

## 8. Demo choreography — the sequence that lands

Roughly 20 minutes. Order matters more than content.

**Open cold on the POS (2 min).** No slides. Lunch, type a student number, "Meal recorded", auto-reset. Do it five times in fifteen seconds. Then say what did *not* happen: the cashier never saw a category, never made a decision, never touched money.

**The confidentiality proof (2 min).** Open the network tab and show the response payload is `{"status":"recorded"}` and nothing else. Then grep the built client bundles for the pricing tier and show zero results. This is the moment that separates you from a demo — you are proving a claim, not making one.

**Guardian, with two children with different surnames (4 min).** Household view, split a deposit, transfer a balance from the graduating child to the sibling. Then show both sides of the transfer in both histories, sharing one reference.

**The correction (4 min).** As admin, correct a mistake. Show that the original entry is untouched and the correction sits beside it with a reason and an actor. Then — if you have a terminal handy — run an `UPDATE` on a ledger row in psql and let the database refuse it. Describe it accurately: the database rejects updates and deletes, and bypassing it requires deliberately setting a flag.

**Reports and the export (3 min).** Meal counts with overrides on their own line, monthly deposits, then export a CSV and show the audit entry that export just wrote — who, which filters, when.

**Close on the import (4 min).** Upload their real export format, nine headers. Show the report: created, updated, inactive, and *three columns ignored by policy*. Say the line plainly: race, ethnicity, and date of birth are dropped before they reach the database, because a meal payment system has no business holding them. Then upload a truncated file and let the mass-deactivation guard stop you.

**The close.** "This is synthetic data, it isn't connected to Infinite Campus or PCS, and it doesn't claim reimbursement. Here's what we'd need from you to change that."

---

## 9. Questions to ask them (the walkthrough is discovery, not a pitch)

Ask these live. The answers are worth more than the demo.

**Operations**
1. What is your worst serving line, and how many minutes do you have?
2. How do you handle breakfast at the Early Childhood Center and Wheatley — does anyone type a number for a four-year-old?
3. What happens today when the network drops mid-service?
4. Who does the edit checks each month, and in what tool?

**Money**
5. Under CEP, roughly what share of families still put money in for à-la-carte?
6. What happens to a balance when a child graduates or moves out of district?
7. Who receives the money today, and who reconciles it?

**Data**
8. Can Infinite Campus give you guardian-to-student relationships, and has anyone asked?
9. Would your Infinite Campus representative enable a OneRoster connection?
10. Where does eligibility live if CEP ever ends — FRAM?

**Decision**
11. Who has to say yes: nutrition, technology, business office, board?
12. What did the last vendor evaluation get wrong?
13. Are you keeping PCS for counting, or is that in scope?

---

## 10. Recommended changes to the build, in priority order

1. **Reseed with the six real schools and realistic enrollment.** Cheap, and the highest-impact change available.
2. **Add the edit-check report.** Daily counts against enrollment × attendance factor, flagged. Demonstrates domain fluency more than any UI polish.
3. **Decide the roster-mode question** for early childhood and elementary — build a minimal version or prepare the answer.
4. **Prepare the incomplete-meal / à-la-carte-substitution answer.**
5. Keep phase 7 as planned. The accessibility pass matters: districts have accessibility obligations and will ask.

---

## Sources

- [Delaware DOE — 2026 CEP annual notification (LEA and school level)](https://education.delaware.gov/wp-content/uploads/2026/04/DE-2026-CEP-Notification-and-Publication.pdf)
- [Woodbridge School District overview](https://en.wikipedia.org/wiki/Woodbridge_School_District)
- [Reynolds School District — District-Wide Nutrition POS RFP (front/back of house scope; PrimeroEdge → LINQ)](https://www.reynolds.k12.or.us/district/rfp-district-wide-nutrition-point-sale-system)
- [Washington OSPI — School meal operations and CEP FAQ (edit checks continue under CEP; à-la-carte for non-reimbursable meals)](https://ospi.k12.wa.us/sites/default/files/2024-05/schoolmealsoperationsandcep-faq.pdf)
- [California DE — Attendance factor and required edit checks](https://www.cde.ca.gov/ls/nu/attfactorreqdchecks.asp)
- [Illinois SBE — CEP planning and implementation guidance](https://www.isbe.net/Documents/cep-plan-implement-guidance1601.pdf)
- [Congressional Research Service — CEP background and participation](https://www.congress.gov/crs-product/R46371)
- [Francis Howell School District — POS software RFP](https://resources.finalsite.net/images/v1773670504/fhsdschoolsorg/gibfk4kq2vsolvt9yayn/FHSD-Point-of-Sale-Software-Solution-RFP-March-2026.pdf)
