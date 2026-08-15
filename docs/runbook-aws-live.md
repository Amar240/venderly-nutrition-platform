# Runbook — hosting the evaluation environment on AWS

District staff log in themselves and explore. Real hosting, real domain, real accounts, real uptime.

## The boundary that must hold

**The data stays synthetic and the prototype banner stays on** until the district's data agreement, privacy review, and security review are complete. A hosted environment where officials log in and explore is a normal part of procurement. A system holding real student records is a different thing with different obligations.

If anyone asks what is in the database, the answer is: invented students, invented families, invented money, modelled on their real schools.

---

## Stage 1 — account foundation (do now, one hour)

Nothing here depends on the code.

- [ ] Create the AWS account. Enable MFA on the root user, then stop using root.
- [ ] Create an IAM admin user with MFA. Work from that.
- [ ] **Set a billing alarm before creating any resource.** $20 and $50 thresholds to your email. An unmonitored account is how surprise bills happen.
- [ ] Set the region to `us-east-1` and use it consistently.
- [ ] Decide infrastructure-as-code tool. CDK keeps you in TypeScript with the rest of the project. Whichever you pick, it lives in the repo — no console-clicking, because console changes leave no record and can't be rebuilt.

## Stage 2 — lead-time items (start now, they take days)

- [ ] Buy the domain. Something plain: `woodbridge-nutrition.venderly.com` or a standalone domain.
- [ ] Request the TLS certificate in AWS Certificate Manager and complete DNS validation. This is the item that bites people the morning of a presentation.
- [ ] *Optional, only if you ever want password resets or emailed notifications:* request SES production access. It goes through a review and takes days. Not needed for the simple login approach below.

## Stage 3 — infrastructure (after the redesign settles)

Do not build this while Stage A–E of the redesign is still churning the app. From `docs/aws-architecture.md`, pilot topology:

- [ ] Containerise; build image in CI; push to ECR
- [ ] App Runner service (simplest) or ECS Fargate behind an ALB
- [ ] RDS PostgreSQL, private subnet, not publicly accessible, automated backups on
- [ ] SSM Parameter Store SecureString for `DATABASE_URL`, `AUTH_SECRET`, `PAYMENT_SIM_SECRET`
- [ ] S3 bucket for roster uploads — SSE-KMS, versioned, block public access, 30-day lifecycle
- [ ] CloudFront in front, AWS WAF providing the rate-limit rule
- [ ] CloudWatch logs, 30-day retention, with a filter that fails the build if a student identifier appears
- [ ] Migrations and seed run as a one-off task, never on container boot

---

## Logins — the simple approach

No email, no invites, no self-service reset. We create the accounts and hand over the credentials.

**Named accounts, one per evaluator.** Not a shared `superadmin@`. When the technology director changes a price and then finds his own name in the audit viewer, the audit feature demonstrates itself. A shared login cannot do that, and it also tells you who actually explored what.

Suggested set:

| Login | Role | For |
|---|---|---|
| `firstname.lastname@venderly.com` | Super admin | The technology director or whoever evaluates configuration |
| `firstname.lastname@venderly.com` | District admin | The nutrition director |
| `observer@venderly.com` | School staff (read-only) | Anyone who just wants to look around |
| `cashier.demo@venderly.com` | Cashier | Seeing the register view |
| `parent.demo@venderly.com` | Guardian | Seeing the family view |

**MFA:** the capability stays in the product and stays demonstrable, but it is **not enforced in the evaluation environment** — a single environment setting, not a code change. If a superintendent cannot get past a TOTP setup screen you have lost him before he has seen anything. Keep one account with MFA enabled so you can show it works when a technical person asks.

**Passwords:** we set them, they are handed over on a printed card or in person, and they are distinct per account. Not emailed in plain text.

**Account expiry:** set an end date for the evaluation and turn the accounts off afterwards, so this does not quietly become a permanent unmanaged system.

### The welcome card

One page handed over with the credentials:

- The URL
- Their login and password
- Five things worth trying, in order — record a lunch, look at a family, move money between siblings, fix a mistake, upload the student list
- The line that sets expectations: synthetic data, not connected to Infinite Campus or PCS
- A name and number to call

### "Start here" inside the product

A small panel on first login for evaluation accounts only, listing those same five things as links. An evaluator dropped into an admin console with no guidance clicks three things and leaves. This is cheap and it is the difference between them finding the sibling transfer and never seeing it.

---

## Running it once people are using it

- [ ] **Reset command.** Someone will make a mess. One documented command restores clean synthetic data. Run it between evaluation sessions.
- [ ] **Uptime check.** If it is down when the superintendent tries it, that is the impression. A simple health check with an alert to you is enough.
- [ ] **Backups on**, and restore tested once. A backup you have never restored is a hypothesis.
- [ ] **Watch the logs** for anything unexpected in the first week.
- [ ] Prototype banner verified on every surface, including printed and exported output.

## Cost

Low tens of dollars a month, dominated by RDS. Verify current pricing before quoting anything to Venderly. The billing alarm from Stage 1 is what stops this being a surprise.

## Before real student data — not before this

Everything above is the evaluation environment. Production with real records additionally requires: the district's signed data agreement, privacy and security review, account separation, Multi-AZ, CloudTrail to a restricted account, revoking UPDATE and DELETE on `LedgerEntry` from the application role (D-9), retention and deletion controls, and an incident procedure. See `docs/aws-architecture.md` and `docs/open-decisions.md`.
