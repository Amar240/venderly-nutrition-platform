# Design specification — 5. Claims and compliance

The part of the job that decides whether the nutrition department gets paid. Everything else in this product is convenience; this is revenue and audit exposure.

---

## 5.1 How the money actually flows

1. Each school day, each site records how many **reimbursable** breakfasts and lunches it served.
2. Those daily counts are checked against a ceiling — enrolment × the state attendance factor. Anything above it must be investigated and documented before the claim goes out (the **edit check**).
3. At month end the daily counts are totalled per site.
4. The district submits a claim to the state agency — for Woodbridge, Delaware DOE — in the state's own system.
5. The state pays a federal rate per meal.
6. Records are retained and examined in the **administrative review**, which arrives every three to five years and asks to see the daily counts behind a claim from a year or two ago.

À-la-carte sales are not reimbursable and never enter the claim. They are revenue, and they belong in the financial report, not this one.

---

## 5.2 What changes under CEP

A non-CEP district counts meals **by student category** — this many free, this many reduced, this many paid — because each rate differs.

A CEP district does not track individual eligibility at all. It counts **total reimbursable meals**, and the split is set by formula for a four-year cycle:

```
free-rate share  = ISP × 1.6, capped at 100%
paid-rate share  = 100% − free-rate share
```

For Woodbridge: **54.82% × 1.6 = 87.7% at the free rate, 12.3% at the paid rate.** Fixed for the cycle, regardless of who actually eats.

The consequence for us is simple and important: **under CEP the district needs one number per school per day — reimbursable meals served — which is exactly what the POS already produces.** No new data collection. It has to be presented as the thing it feeds.

If CEP ends, the same daily counts must break down by tier instead. Because every meal event already stores the tier-derived price at the time of service, that breakdown is derivable without a data migration. Worth saying out loud — it is the payoff for pricing per student from the start.

---

## 5.3 The screen

**Header states the month and district.** Exceptions surface first, before any totals — an unreviewed edit-check exception is the one thing that must not be missed, so it sits above the numbers with a direct action.

**Per-school table**: breakfasts, lunches, and a checked/needs-attention marker per site. District total at the foot.

**The split, shown as arithmetic rather than asserted**: "54.82% × 1.6 = 87.7% at the free rate", with the resulting meal counts. A nutrition director can check our maths in their head, and being able to is the point.

**The boundary, stated on screen**: "These are your figures to check and submit. This system doesn't file claims and isn't your official counting record — PCS still is, unless the district decides otherwise."

That sentence protects the district, protects Venderly, and is consistent with the PRD. It also disarms the single most dangerous question in the room — *are you telling us to claim off this?* — before it is asked.

**Print the claim pack** produces one document a reviewer can be handed: daily counts by site and meal type, the edit-check ceiling and any exceptions with who reviewed them and when, the claiming percentage calculation, corrections made in the period with reasons and actors, and the prototype label.

---

## 5.4 What goes wrong, and what the design does about it

| What happens | How often | What the design does |
|---|---|---|
| Meals recorded under the wrong meal type | Common | Meal type is always visible at the register; shift-end screen shows counts by type |
| Register down, counts reconstructed later | Common | A documented offline/manual entry path with a reason, flagged in the claim pack rather than hidden |
| Edit-check exception never documented | Common, and a review finding | Exceptions surface on the dashboard and block a clean month-end until reviewed |
| Double-counted student | Occasional | Duplicate guard at the register; overrides counted on a separate line (D-10) |
| Over-claiming | Rare, expensive | Counts derive from meal events only; à-la-carte can never enter the claim |
| Reviewer asks for a day from two years ago | Every review | Append-only history and retained import records make it retrievable |

---

## 5.5 Non-negotiables

- Only meal events count. À-la-carte never enters a claim figure.
- Override meals (`overrideSeq > 0`) are reported on their own line and never silently summed (D-10).
- Every figure derives from the ledger and meal events, never a cached value.
- The claim pack is exportable and the export is audited.
- Retention: daily counts, import records, and corrections must survive at least three years plus the current year.
- The prototype label appears on every printed and exported artefact.

---

## 5.6 What we deliberately do not do

- We do not file claims. No state system integration.
- We do not calculate reimbursement dollars — rates change annually and getting them wrong would be worse than not showing them.
- We do not replace PCS as the official counting record unless the district formally authorises it in writing.

---

## Open questions for the district

1. Who prepares the claim today, in what tool, and how long does it take?
2. What did the last administrative review flag?
3. What is the process when a register is down mid-service?
4. Where is the attendance factor for Delaware published, and who tracks it?
5. If Venderly's counts and PCS's counts disagree, which wins, and who investigates?
