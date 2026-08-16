/**
 * Prints the four evaluator demo logins and a live 6-digit code for staff.
 * Run: `npm run logins`. Codes rotate every 30s, so re-run if one expires.
 * Synthetic data only. Local development convenience — refuses to run when
 * NODE_ENV=production so it can never print a live code against a deployed
 * environment.
 */
import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1";

const GUARDIAN_LOGIN = {
  label: "Guardian",
  email: "guardian@woodbridge.demo",
  surface: "Guardian portal  (/guardian)",
} as const;

const STAFF_LOGINS = [
  {
    label: "Cashier",
    email: "cashier@woodbridge.demo",
    surface: "Cafeteria POS    (/pos)",
  },
  {
    label: "Staff",
    email: "districtadmin@woodbridge.demo",
    surface: "Admin console    (/admin)",
  },
  {
    label: "Super admin",
    email: "superadmin@woodbridge.demo",
    surface: "Admin console    (/admin, full config)",
  },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Refusing to run: NODE_ENV=production. This script prints live TOTP codes and is a local development convenience only.",
    );
    process.exit(1);
  }

  const guardian = await prisma.guardian.findUnique({
    where: { email: GUARDIAN_LOGIN.email },
    select: { email: true, firstName: true, lastName: true },
  });
  const staff = await prisma.user.findMany({
    where: {
      email: { in: STAFF_LOGINS.map((login) => login.email) },
      disabledAt: null,
    },
    select: { email: true, totpSecret: true },
  });
  const staffByEmail = new Map(staff.map((s) => [s.email, s]));

  console.log("\n=============== WOODBRIDGE DEMO LOGINS ===============");
  console.log("App:      http://localhost:3001");
  console.log(`Password: ${PASSWORD}   (same for every account)\n`);

  if (guardian) {
    console.log(`${GUARDIAN_LOGIN.label.toUpperCase()} — no authenticator code needed`);
    console.log(`  ${GUARDIAN_LOGIN.surface}`);
    console.log(`  ${guardian.email}  (${guardian.firstName} ${guardian.lastName})\n`);
  }

  console.log("STAFF — enter the 6-digit code below in the 'Authenticator code' field");
  for (const login of STAFF_LOGINS) {
    const s = staffByEmail.get(login.email);
    if (!s) throw new Error(`Missing active evaluator login: ${login.email}`);
    const code = s.totpSecret ? authenticator.generate(s.totpSecret) : "—";
    console.log(`  ${login.label} — ${login.surface}`);
    console.log(`  ${s.email.padEnd(30)} code: ${code}\n`);
  }
  console.log("=====================================================\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
