# Phase 8 — AWS deploy

## Goal
The demo runs from a URL the district can visit, on infrastructure that looks like the real thing.

Do this only after phase 7 passes locally. Deploying an unfinished app wastes time twice.

## In scope (pilot topology from `aws-architecture.md`)
- Containerize the app; build image in CI, push to ECR.
- App Runner service (or ECS Fargate behind an ALB if you want the enterprise-looking diagram for the pitch).
- RDS PostgreSQL in a private subnet, automated backups on, not publicly accessible.
- SSM Parameter Store SecureString for `DATABASE_URL`, `AUTH_SECRET`, `PAYMENT_SIM_SECRET`.
- S3 bucket for roster imports: SSE-KMS, versioned, block public access, 30-day lifecycle deletion.
- CloudFront in front of the app, with AWS WAF providing the rate-limit rule for sign-in and student-number entry.
- CloudWatch log group with 30-day retention and a log filter that fails the build if a student identifier appears in logs.
- Migrations and seed run as a one-off task, not on container boot.
- A documented one-command reset so the demo can be restored to a clean state.

## Explicitly out of scope
Multi-account separation, Multi-AZ, Transfer Family SFTP, CloudTrail-to-audit-account, GuardDuty. Those belong to production, after the district's security review. Do not build them for a synthetic-data demo.

## Rules
- Synthetic data only. The prototype banner stays on. No real roster ever touches this environment.
- Infrastructure defined as code (CDK or Terraform), committed to the repo — clicking through the console leaves no record and cannot be rebuilt.
- No long-lived AWS access keys in the app; use task roles.
- Nothing in `server/` learns that it is on AWS. If a domain module imports an AWS SDK, the port boundary has been broken.

## Acceptance criteria
- The full demo script runs end to end against the deployed URL.
- The database is unreachable from the public internet (verify, don't assume).
- Tearing down and rebuilding from the IaC produces a working environment.
- Rough monthly cost is known and written down before anyone quotes a number to Venderly.

## Human verification
Run the demo script from a different network on the hardware you will present with. Then reset and run it again.
