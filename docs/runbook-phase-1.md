# Runbook — Phase 1 (your manual steps)

Everything here is yours to do by hand. Claude Code's work starts at step 6.

## 1. Machine setup (once)
- [ ] Node 20+ (`node -v`)
- [ ] Docker Desktop running
- [ ] Postgres via Docker:
  `docker run --name woodbridge-db -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=woodbridge -p 5432:5432 -d postgres:16`
- [ ] Claude Code installed and signed in

## 2. Create the repo
```
mkdir woodbridge-nutrition && cd woodbridge-nutrition
git init
```

## 3. Drop in this seed kit
Copy `CLAUDE.md` to the repo root and the `docs/` folder alongside it. Add the PRD pdf into `docs/` too. Commit:
```
git add . && git commit -m "seed: conventions and phase specs"
```

## 4. Install the design tooling (once)
- [ ] Skill: `git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git` then copy it into `.claude/skills/ui-ux-pro-max` inside the repo (or follow the repo README's CLI install).
- [ ] 21st.dev MCP: open https://21st.dev/mcp → Claude tab → run their `claude mcp add` command → create an API key in their settings when prompted.
- [ ] Verify in a Claude Code session: `/mcp` shows 21st; the skill appears in available skills.

## 5. Environment
Create `.env`:
```
DATABASE_URL=postgresql://postgres:devpass@localhost:5432/woodbridge
AUTH_SECRET=<run: openssl rand -base64 32>
PAYMENT_SIM_SECRET=<run: openssl rand -base64 32>
```
Never commit `.env` (Claude Code will add it to .gitignore, but check).

## 6. First Claude Code prompt
```
Read CLAUDE.md and docs/phase-1-foundation.md. Propose your implementation plan
for phase 1 before writing code. Then implement it, including the seed script
and the RBAC tests listed in the spec.
```
Review the plan before approving — that's your learning checkpoint. Ask it to explain anything you don't follow.

## 7. Your verification (phase 1 acceptance)
- [ ] `npx prisma migrate dev` + `npm run seed` + `npm run dev` all succeed
- [ ] Sign in as each role (credentials printed by the seed script)
- [ ] Guardian: try to open another household's child URL → denied
- [ ] Cashier: try `/admin` → denied
- [ ] `npm test` green
- [ ] Prototype banner visible on every surface
- [ ] Commit: `git commit -m "phase 1: foundation"`

## 8. Report back
Return to Cowork with anything that surprised you or any spec conflict Claude Code raised — we adjust the specs, not the habit of following them.
