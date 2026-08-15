#!/bin/sh
# App container startup: apply migrations, seed ONCE (only when the roster is
# empty, so restarts never wipe data), then start Next on :3001.
set -e

echo "[entrypoint] Applying database migrations…"
npx prisma migrate deploy

echo "[entrypoint] Checking whether the roster is already seeded…"
NEED_SEED=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.student.count().then(n=>{process.stdout.write(n>0?'no':'yes');return p.\$disconnect();}).catch(()=>{process.stdout.write('yes');});")

if [ "$NEED_SEED" = "yes" ]; then
  echo "[entrypoint] Empty database — loading synthetic seed data…"
  npm run seed
else
  echo "[entrypoint] Roster already present — skipping seed."
fi

echo "[entrypoint] Starting the app on http://localhost:3001 …"
exec npm run start
