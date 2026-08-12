# Open decisions — before production, not before the pilot

None of these block the pilot. All of them block go-live. Keep this list in front of the district.

## 1. Guardian linking — status corrected
Some working documents mark parent-to-student linking in Infinite Campus as *confirmed*. It is not. The only export confirmed by the district is one CSV with nine headers, and none of them carry guardian data.

Ask: can Infinite Campus export guardian/household relationships, and with which fields? If not, the pilot's alternative is a claim-and-verify flow (guardian receives a school-issued code and links the child themselves), which the district must approve.

Until answered: pilot seeds synthetic households. No production household model is committed.

## 2. Eligibility source — likely FRAM, needs confirming
The free / reduced / paid pricing paths assume the platform knows a student's eligibility category. The confirmed roster export contains no eligibility field.

Infinite Campus has a Free and Reduced Meal Application module (FRAM) that processes benefit applications and feeds its own food service product. That is the probable authoritative source. It is also the most sensitive data in this entire project — meal benefit status has tighter federal handling and disclosure limits than ordinary roster data.

Ask: if CEP does not apply, will the district export eligibility from FRAM, through what mechanism, how often, and under what disclosure terms? Design position: prefer never receiving raw eligibility. If the district can send a derived price tier per student instead of a benefit category, take that — it satisfies pricing without importing benefit status.

## 2b. Infinite Campus already sells a competing product
Infinite Campus offers Campus Food Service — a food service module with its own POS, portal balances, payments, and FRAM integration, sold as natively integrated with the SIS the district already runs.

This is not a technical blocker, but Venderly will be asked, in some form: why not just buy the module from our existing vendor? Have the answer ready before the pitch. Honest differentiators from this PRD: guardian self-service with sibling transfers, the explainable append-only money trail, deliberate data minimization, and cafeteria speed. Do not pretend the incumbent option does not exist — the district's technology director already knows it does.

## 3. Merchant of record and settlement
Not confirmed. Sharpened by the Venderly/GoHighLevel setup, where the Stripe relationship typically sits inside GHL — meaning parent deposits would land in a Venderly-controlled account before reaching the district.

Options to put to the district:
- District holds its own Stripe account; Venderly integrates against it.
- Stripe Connect with the district as a connected account; Venderly is the platform.
- Venderly is merchant of record under an explicit settlement and reconciliation agreement.

Ask: who receives the funds, on what settlement schedule, who reconciles, who handles chargebacks and refunds, and what the district's finance office requires for auditability.

## 4. CEP status
Woodbridge may be CEP across all schools. Confirm for the coming school year, per school. Pricing stays configurable regardless.

## 5. PCS scope
Unclear whether Venderly replaces meal counting or runs alongside PCS. Default position: the platform records meal events for operations and demo reporting only, and is not an official meal-count or federal reimbursement claiming source, unless the district formally authorizes that change in writing.

## 6. Data exchange method — an API path probably exists
Scheduled CSV is confirmed as today's model, and it stays the pilot's design. But Infinite Campus supports a OneRoster API (OneRoster 1.1 with OAuth 2.0), which many third-party vendors use for roster sync; districts obtain credentials through their Infinite Campus representative.

This matters for two reasons: it may remove the file-drop entirely in production, and OneRoster models parent/guardian associations, which the flat CSV does not — so it may also answer decision 1.

Ask: will the district enable a OneRoster connection for Venderly, and does their implementation expose guardian associations? Note that the district, not Venderly, has to request this from Infinite Campus.

Do not redesign the pilot around this. File import stays phase 6; an API adapter is a production-time swap behind `RosterImportPort`.

## 7. What data may cross into GoHighLevel
Sending guardian contacts and any student identifier into a CRM makes that CRM a processor of student information. Decide and document exactly which fields may cross, what message bodies may contain, and how retention and deletion work there — and get it into the district data agreement. This needs district counsel and IT, not an engineering decision.

## 8. Offline operation
Recognized need, undefined rules. Gather cafeteria outage, device management, and reconciliation requirements before committing a design.

---

Approval checkpoint: before production development starts, Venderly and the district should approve product scope, meal-counting responsibility, data exchange method, household identity model, payment ownership, privacy and security obligations, and offline expectations.
