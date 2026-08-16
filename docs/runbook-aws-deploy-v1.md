# Runbook — first AWS deployment (v1)

Get what exists today running on AWS, reachable over HTTPS, with real logins. Everything else is next version.

**Deliberately deferred to v1.1:** custom domain and TLS certificate (App Runner provides an HTTPS URL), CloudFront, WAF, SES, Multi-AZ, separate accounts, revoked ledger privileges (D-9).

**Target shape:** App Runner (the app) → VPC connector → RDS PostgreSQL (private). Roughly $25–40/month; verify current pricing yourself before quoting it to anyone.

**Boundary that still holds:** synthetic data, prototype banner on. See `runbook-aws-live.md`.

---

## Before you start

- Docker installed and working locally.
- AWS CLI installed: `aws --version`. If missing, install "AWS CLI v2".
- Everything committed and pushed.
- Work in **us-east-1** throughout. Mixing regions causes resources that cannot see each other.

---

## Stage 1 — account foundation

1. Create the AWS account at aws.amazon.com. Use a Venderly email, not personal.
2. Root user → **Security credentials** → assign an MFA device. Then stop using root.
3. Root menu → **Account** → "IAM user and role access to Billing Information" → **Edit** → enable. Do this while still root or you will not see billing later.
4. **IAM** → Users → Create user `amar-admin` → enable console access → attach `AdministratorAccess` → create. Then open the user → Security credentials → assign MFA.
5. Sign out. Sign back in at `https://<account-id>.signin.aws.amazon.com/console` as `amar-admin`. Bookmark it.
6. **Billing alarm, before creating anything else.** Region must be **us-east-1** (billing metrics exist only there). CloudWatch → Alarms → Create alarm → Select metric → **Billing** → Total Estimated Charge → USD → threshold **20** → create SNS topic with your email → create. **Check your email and click the confirmation link** — an unconfirmed subscription means the alarm fires into nothing. Repeat at **50**.
7. Local CLI access: IAM → your user → Security credentials → Create access key → "Command Line Interface" → then run `aws configure` and enter the key, secret, `us-east-1`, `json`.

**Done when:** `aws sts get-caller-identity` returns your account, and the billing confirmation email is clicked.

---

## Stage 2 — the database

1. **RDS** → Create database → **Standard create** → **PostgreSQL**.
2. Templates → **Free tier** if eligible, otherwise **Dev/Test**.
3. Settings:
   - DB instance identifier: `woodbridge-nutrition`
   - Master username: `postgres`
   - Master password: generate a strong one and **save it now** — you cannot read it back.
4. Instance configuration: **db.t4g.micro** (Burstable). Storage: 20 GiB gp3. **Disable storage autoscaling** so a runaway cannot grow your bill.
5. Connectivity:
   - **Do not connect to an EC2 compute resource**
   - Public access: **No**
   - VPC: default. Note the VPC and subnets — you need them in Stage 4.
   - Create a new security group named `woodbridge-db-sg`
6. Additional configuration → Initial database name: **`woodbridge`**. This matters; without it you get a `postgres` database and your connection string will be wrong.
7. Backups: 7 days retention. Leave encryption on.
8. Create. It takes 5–10 minutes.

**Save these:** endpoint (`woodbridge-nutrition.xxxx.us-east-1.rds.amazonaws.com`), port 5432, username, password, db name `woodbridge`.

Your `DATABASE_URL` will be:
```
postgresql://postgres:<password>@<endpoint>:5432/woodbridge
```
If the password contains `@ : / ?` or `#`, URL-encode those characters or the string will parse wrongly.

---

## Stage 3 — build and push the image

1. **ECR** → Repositories → Create repository → private → name `woodbridge-nutrition` → create. Copy the URI.
2. From the repo root, replacing `<account-id>`:

```bash
cd ~/Documents/NutrientProject

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Apple Silicon: the platform flag is required. App Runner runs x86_64.
docker build --platform linux/amd64 -t woodbridge-nutrition .

docker tag woodbridge-nutrition:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/woodbridge-nutrition:latest

docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/woodbridge-nutrition:latest
```

The `--platform linux/amd64` flag is not optional on an M-series Mac. Without it the image builds fine, pushes fine, and fails at runtime with an exec format error.

**Done when:** the image appears in ECR with a `latest` tag.

---

## Stage 4 — let the app reach the database

App Runner runs outside your VPC by default, so it cannot see a private RDS instance. A VPC connector bridges that.

1. **VPC** → Security groups → Create security group
   - Name: `woodbridge-app-sg`
   - VPC: the same default VPC as RDS
   - No inbound rules. Leave outbound as-is.
2. Open `woodbridge-db-sg` (the RDS one) → Inbound rules → Edit → Add rule:
   - Type: **PostgreSQL** (port 5432)
   - Source: **Custom** → select `woodbridge-app-sg`
   - Save. This is what allows the app in and keeps everything else out.
3. **App Runner** → Networking → VPC connectors → Create:
   - Name: `woodbridge-vpc-connector`
   - VPC: default
   - Subnets: select at least two
   - Security group: `woodbridge-app-sg`

---

## Stage 5 — create the App Runner service

1. **App Runner** → Create service.
2. Source: **Container registry** → **Amazon ECR** → Browse → your image → tag `latest`.
3. Deployment: **Manual**. (Automatic redeploys on every push; manual is calmer while you are still building.)
4. ECR access role: **Create new service role**.
5. Service settings:
   - Name: `woodbridge-nutrition`
   - Virtual CPU: **1 vCPU**, Memory: **2 GB**
   - **Port: 3001** — this must match the Dockerfile
6. Environment variables (plain text for now; Stage 8 moves the secrets):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the string from Stage 2 |
   | `AUTH_SECRET` | run `openssl rand -base64 32` |
   | `PAYMENT_SIM_SECRET` | run `openssl rand -base64 32` again — a different value |
   | `NODE_ENV` | `production` |
   | `AUTH_TRUST_HOST` | `true` |

7. Auto scaling → Add new configuration:
   - Max size: **1**
   - Min size: **1**

   **Max size 1 is not a cost decision, it is a correctness one.** The container runs `prisma migrate deploy` at startup. Two containers starting together would race on the same migration.

8. Health check: leave **TCP** on the default settings. An HTTP check against `/` will fail once the app redirects unauthenticated users to sign-in.
9. Networking → Outgoing traffic → **Custom VPC** → select `woodbridge-vpc-connector`.
10. Create & deploy. First deploy takes 5–10 minutes.

**Done when:** status is Running and you have a URL like `https://xxxx.us-east-1.awsapprunner.com`.

---

## Stage 6 — the callback URL step everyone hits

Auth.js needs to know its own public address, and you could not know it until Stage 5 finished.

1. Copy the App Runner URL.
2. App Runner → your service → Configuration → Edit → add:

   | Key | Value |
   |---|---|
   | `AUTH_URL` | `https://xxxx.us-east-1.awsapprunner.com` |

   No trailing slash.
3. Save and deploy. Wait for Running.

Skipping this produces a sign-in page that appears to work and then fails or loops on submit.

---

## Stage 7 — verify

Open the URL and check, in order:

- [ ] Prototype banner visible on every page
- [ ] Sign in as each of the four logins (`npm run logins` locally shows them)
- [ ] Guardian home shows children and meals remaining
- [ ] Register records a meal; undo works within 90 seconds
- [ ] Roster mode loads a class at the Early Childhood Center
- [ ] Admin dashboard, arrears report, edit-check report, claim figures all load
- [ ] Claim figures show the seeded Woodbridge Middle breach

If the app will not start: App Runner → Logs → **Application logs**. Almost every first-deploy failure is `DATABASE_URL` (wrong password encoding, wrong db name) or a missing security group rule from Stage 4.

---

## Stage 8 — move the secrets out of plain text

Environment variables are visible to anyone with console access. Before handing the URL to the district:

1. **Systems Manager** → Parameter Store → Create parameter, three times:
   - `/woodbridge/DATABASE_URL` — type **SecureString**
   - `/woodbridge/AUTH_SECRET` — SecureString
   - `/woodbridge/PAYMENT_SIM_SECRET` — SecureString
2. App Runner → Configuration → Edit → for each of those three, switch the source from plain text to the Parameter Store path.
3. IAM → find the App Runner **instance** role (not the ECR access role) → attach a policy allowing `ssm:GetParameters` and `kms:Decrypt` on those parameters.
4. Deploy and re-verify sign-in.

---

## Stage 9 — hand it over

From `runbook-aws-live.md`:

- [ ] Named account per evaluator, not a shared login — so the audit viewer demonstrates itself
- [ ] MFA available but not enforced for evaluators
- [ ] Welcome card: URL, credentials, five things to try, the synthetic-data line, a name and number
- [ ] An end date for the evaluation, with accounts turned off afterwards

---

## Running it

**Redeploy after a code change:**
```bash
docker build --platform linux/amd64 -t woodbridge-nutrition .
docker tag woodbridge-nutrition:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/woodbridge-nutrition:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/woodbridge-nutrition:latest
```
Then App Runner → your service → **Deploy**.

**Reset the demo data:** the entrypoint only seeds an empty database, so a restart will not reset it. To reset deliberately, connect to RDS and drop the data, or add a one-off task later. Do this between evaluation sessions.

**Pause the cost:** App Runner services can be **Paused** from the console and RDS instances **Stopped** (up to 7 days). Both between demos, if the evaluation window is intermittent.

---

## Known deviations from the target architecture

Recorded honestly so they are chosen, not forgotten:

- **Migrations run at container boot**, not as a one-off task. Safe only because max instances is 1. Fix before any multi-instance deployment.
- **The Dockerfile is single-stage** and installs dev dependencies. It works; it is larger and broader than a production image should be.
- **No CloudFront, no WAF**, so no rate limiting in front of the app.
- **Single AZ, no read replica.** Correct for an evaluation environment.
- **D-9 not yet applied** — the application role still holds UPDATE and DELETE on `LedgerEntry`. Required before real student data, not before this.
