# Demo script

Read this aloud while driving the app. The production-style URL below is a placeholder for the AWS demo host; use the real hosted URL when presenting.

## Preflight

1. Reset the demo data once.
   - Local Docker: `docker compose exec app npm run demo:reset`
   - AWS: run the documented manual reset/reseed command for the hosted app, then do not reset again between run A and run B.
2. Confirm the authenticator app already has stable entries for:
   - `cashier@woodbridge.demo`
   - `superadmin@woodbridge.demo`
3. Open three Chrome profiles or windows and pre-sign in:
   - POS: `https://<aws-demo-host>/signin`, `cashier@woodbridge.demo`, password `Woodbridge!Demo1`, authenticator code from the cashier entry.
   - Guardian: `https://<aws-demo-host>/signin`, `guardian@woodbridge.demo`, password `Woodbridge!Demo1`, leave authenticator code blank.
   - Admin: `https://<aws-demo-host>/signin`, `superadmin@woodbridge.demo`, password `Woodbridge!Demo1`, authenticator code from the super-admin entry.

Say: "This is a prototype using only synthetic data. It is not connected to Infinite Campus, PCS, or live payment processing."

## 1. POS first

Open `https://<aws-demo-host>/pos`.

Say: "We start where the line starts: the cafeteria serving screen. The POS does not show eligibility, pricing tier, household details, or anything a cashier does not need."

Choose `Lunch`.

Run A:
- Student number: `100001`
- Expected student: Ella Whitfield

Run B, without another reset:
- Student number: `100003`
- Expected student: Nora Bell

Say: "The result is operational only: recorded, duplicate, not active here, or an error. It never exposes why a meal is free or what category the student is in."

## 2. Guardian deposit and sibling transfer

Open `https://<aws-demo-host>/guardian`.

Say: "Now the household view. Dana Whitfield sees two linked children with different surnames, which is common in real households."

Point out:
- Ella Whitfield, student `100001`, starting balance `$42.00`
- Marcus Okafor, student `100002`, starting balance `$9.00`, visibly low against the `$10.00` threshold

Choose `Add money`.

Enter:
- Marcus Okafor: `$10.00`

Say: "Payment processing is simulated in the prototype. In production this would hand off to the district payment processor, but the ledger behavior is the same after settlement."

Return to the guardian home, then choose `Transfer`.

Enter:
- From: Ella Whitfield
- To: Marcus Okafor
- Amount: `$5.00`

Say: "The transfer is written as linked ledger entries, not as a balance overwrite. That gives the family and the district a readable history."

Second-run note: Marcus and Ella's displayed balances will include the first run's deposit and transfer. The same `$10.00` deposit and `$5.00` transfer remain valid without another reset.

## 3. Admin ledger, correction, and reports

Open `https://<aws-demo-host>/admin/students`.

Search:
- `100001`

Open Ella Whitfield.

Say: "Admin sees the ledger history and correction history together. This seeded example includes an incorrect synthetic cash deposit and a linked offsetting correction, so the history has depth before I touch anything."

In `Adjust balance`, enter:
- Direction: `Add funds`
- Amount: `$1.00`
- Reason: `Verified cash deposit correction`

Submit `Apply adjustment`.

Say: "Every money-moving correction requires a reason and creates a new ledger row plus audit evidence. The original entry is not edited."

Open `Audit log` and, if useful, filter by:
- Action: `LEDGER_ADJUSTMENT`

Say: "This audit view is super-admin-only. Restricted admin pages are concealed rather than partially exposed."

Open `Reports`, then `Transaction export`.

Download the CSV.

Say: "The CSV begins with the prototype notice before the normal header, and the export still excludes eligibility and tier data."

## 4. Close on import and data minimization

Open `https://<aws-demo-host>/admin/import`.

Upload:
- `fixtures/clean.csv`

Say: "The Infinite Campus roster import validates the full file before writing. Columns for birthdate, race or ethnicity, and gender are intentionally ignored at parse and never stored."

After the result appears, read the ignored-columns line aloud:

Say: "Three columns ignored by policy: birthdate, race or ethnicity, and gender. That is the data-minimization promise: we only keep the fields needed for nutrition operations."

Second-run note: importing `fixtures/clean.csv` remains valid. If prior demo steps changed balances or ledger entries, the roster import does not overwrite those financial records.
