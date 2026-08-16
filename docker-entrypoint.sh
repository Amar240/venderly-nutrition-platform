#!/bin/sh
# App container startup: apply migrations, seed ONCE (only when the roster is
# DEFINITIVELY empty, so restarts never wipe data), then start Next on :3001.
set -e

echo "[entrypoint] Applying database migrations…"
npx prisma migrate deploy

echo "[entrypoint] Checking whether the roster is already seeded…"
# The answer travels as an exit code, so a query FAILURE can never be mistaken
# for an empty database:
#   0 = definitively empty -> seed
#   1 = rows present       -> skip
#   2 = query failed       -> abort
# This distinction matters: `npm run seed` RESETS the database as its first
# action. The previous version treated any error as "empty", so a transient
# connection blip between `migrate deploy` and this check — a Multi-AZ failover
# mid-deploy, say — would have silently wiped live evaluator data.
set +e
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.student.count()
  .then(async (n) => {
    await p.\$disconnect();
    process.exit(n > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('[entrypoint] Roster check failed:', err.message);
    try { await p.\$disconnect(); } catch (_) {}
    process.exit(2);
  });
"
ROSTER_STATE=$?
set -e

case "$ROSTER_STATE" in
  0)
    echo "[entrypoint] Empty database — loading synthetic seed data…"
    npm run seed
    ;;
  1)
    echo "[entrypoint] Roster already present — skipping seed."
    ;;
  *)
    echo "[entrypoint] ERROR: could not determine whether the roster is seeded."
    echo "[entrypoint] Refusing to seed on a guess — 'npm run seed' RESETS the database."
    exit 1
    ;;
esac

echo "[entrypoint] Starting the app on http://0.0.0.0:3001 …"
exec npm run start
