# AWS architecture — pilot now, production later

Cloud platform: AWS. Two topologies below. Build the first; document the second; do not build the second during phases 1–7.

## Rule
The pilot holds only synthetic data, so it can be deployed publicly without a data agreement. The moment real student data is in scope, the production topology and the district's security review both apply.

---

## A. Pilot topology (what to actually deploy)

Keep it small. Ops time spent here is time not spent on the demo.

| Concern | Service | Notes |
|---|---|---|
| App hosting | App Runner (or ECS Fargate behind an ALB) | Containerized Next.js. App Runner if you want least ops; Fargate if you want the diagram to look enterprise for the pitch. |
| Database | RDS PostgreSQL, single-AZ, private subnet | Never publicly accessible. Automated backups on. |
| Secrets | SSM Parameter Store (SecureString) | `DATABASE_URL`, `AUTH_SECRET`, `PAYMENT_SIM_SECRET`. Cheaper than Secrets Manager at pilot scale. |
| Import files | S3 bucket, SSE-KMS, versioned, block public access | Synthetic CSVs only. Lifecycle rule deletes after 30 days. |
| Import trigger | S3 event → EventBridge → job | Same wiring the production SFTP path will use. |
| Logs | CloudWatch Logs, 30-day retention | Scrub student identifiers from logs from day one. |
| Edge | CloudFront + AWS WAF | WAF rate-limit rule protects sign-in and student-number entry (an NFR, not optional). |
| Network | One VPC, public subnets for the app, private for RDS | No DB in a public subnet, ever. |

Local development stays on Docker Postgres — AWS is for the demo deploy, not for daily work.

Rough cost at pilot scale is tens of dollars a month, dominated by RDS. Verify current pricing before quoting anything to Venderly.

## B. Production topology (target, after approvals)

Everything above, plus:

- **Account separation** via AWS Organizations: dev / staging / prod. Student data never lands in a non-prod account.
- **RDS Multi-AZ**, deletion protection, point-in-time recovery, encrypted with a customer-managed KMS key.
- **Roster intake:** AWS Transfer Family (SFTP) as the district's drop point, writing into the encrypted S3 bucket, with EventBridge triggering the validated import pipeline. This replaces the pilot's manual upload without changing the pipeline behind it.
- **VPC endpoints** for S3, Secrets Manager, and KMS so that traffic stays off the public internet.
- **Secrets Manager** with rotation, replacing Parameter Store.
- **CloudTrail** organization-wide, logging to a separate, restricted account — this is the evidence trail a district security review asks for.
- **GuardDuty and Security Hub** enabled.
- **Backups:** AWS Backup with tested restores. A backup you have never restored is a hypothesis.
- **Monitoring:** CloudWatch alarms → SNS for failed imports, failed payment events, ledger reconciliation drift, and error-rate spikes.
- **Least-privilege IAM task roles** per service; no long-lived access keys.
- **Retention and deletion automation** matching whatever the district's data agreement specifies.

## Compliance posture to prepare for
Student records make this a FERPA conversation, and many districts add state-level student-privacy requirements on top. AWS publishes guidance on building FERPA-aligned workloads, but alignment is a property of how the system is configured and operated, not of the cloud provider. Expect the district to ask for: data location, encryption at rest and in transit, access logging, subprocessor list, breach notification terms, and deletion guarantees. Have answers before the pitch, and get the data agreement reviewed by counsel — not engineering.

## What this means for the code
Nothing in `server/` should know it is on AWS. File access goes through `RosterImportPort`; secrets come from environment variables loaded at boot. Swapping local Docker for RDS, or manual upload for SFTP, must be a configuration change.
