# Runbook — local Docker stack

Run the whole pilot (Postgres + the app, migrated and seeded) with one command.
For local testing only — the secrets in `docker-compose.yml` are demo values.

## Prerequisites
- Docker Desktop (or Docker Engine + Compose v2).
- Ports **3001** (app) and **5432** (Postgres) free. If you previously ran an
  ad-hoc `woodbridge-db` container, stop it first: `docker stop woodbridge-db`.

## Start everything
```bash
docker compose up --build
```
On first start the app container:
1. applies all Prisma migrations,
2. seeds synthetic data **only if the database is empty** (6 schools, 200
   students, 126 guardians),
3. starts Next on http://localhost:3001.

Add `-d` to run in the background: `docker compose up --build -d`.

## Get demo logins (live TOTP codes)
```bash
docker compose exec app npm run logins
```
Password for every account: `Demo!Pass1`. Guardians sign in with no code;
staff need the printed 6-digit authenticator code.

The evaluator set has four logins:

| Label | Email | Surface |
|---|---|---|
| Guardian | `guardian@nutrition.demo` | Family portal |
| Cashier | `cashier@nutrition.demo` | Cafeteria POS |
| Staff | `districtadmin@nutrition.demo` | Admin console with district-wide staff access |
| Super admin | `superadmin@nutrition.demo` | Admin console with configuration access |

For presentation environments, prefer stable authenticator entries instead of
printing fresh secrets during the demo. Set these environment variables before
seeding, enroll each secret once in the authenticator app, and then reuse those
entries for the AWS demo:

```bash
SEED_TOTP_CASHIER=...
SEED_TOTP_DISTRICT_ADMIN=...
SEED_TOTP_SUPER_ADMIN=...
```

Do not put the secret values in docs or slides.

## Common commands
```bash
docker compose logs -f app     # follow app logs (migration + seed output)
docker compose exec app npm run seed    # reset + reseed synthetic data
docker compose exec app npm run demo:reset  # reset, reseed, regenerate import fixtures
docker compose exec db psql -U postgres -d woodbridge   # open a psql shell
docker compose down            # stop; database is KEPT in the named volume
docker compose down -v         # stop AND wipe the database volume (fresh next up)
```

## Local Phase 7 checks
```bash
docker compose exec app npm test
docker compose exec app npm run typecheck
docker compose exec app npm run lint
docker compose exec app npm run build
npm run playwright:install
npm run test:e2e
```

`npm run test:e2e` resets and reseeds the configured database before starting
the browser flow. Run it against local data only, not the AWS presentation
environment.

## Notes
- Data persists in the `woodbridge-pgdata` named volume across restarts — the
  seed runs again only when that volume is empty (or after `down -v`).
- Override secrets by exporting them before `up`, e.g.
  `AUTH_SECRET=… PAYMENT_SIM_SECRET=… docker compose up`.
- Tests still run on the host (`npm test`) against the same database.
- This image is for local testing, not production. Production hardening
  (multi-stage/standalone image, non-root user, real secrets, revoking
  UPDATE/DELETE on `LedgerEntry` per D-9) is phase 8.
