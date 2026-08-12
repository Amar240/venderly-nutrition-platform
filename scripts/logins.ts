/**
 * Prints every demo login and a live 6-digit code for each staff account, so
 * you can sign into all three dashboards right now. Run: `npm run logins`.
 * Codes rotate every 30s — re-run if one expires. Synthetic data only.
 */
import { PrismaClient, type Role } from "@prisma/client";
import { authenticator } from "otplib";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1";

const SURFACE: Record<Role, string> = {
  GUARDIAN: "Guardian portal  (/guardian)",
  CASHIER: "Cafeteria POS    (/pos)",
  SCHOOL_STAFF: "Admin console    (/admin, read-only)",
  DISTRICT_ADMIN: "Admin console    (/admin)",
  SUPER_ADMIN: "Admin console    (/admin, full config)",
};

async function main() {
  const guardian = await prisma.guardian.findUnique({
    where: { email: "guardian@woodbridge.demo" },
    select: { email: true, firstName: true, lastName: true },
  });
  const staff = await prisma.user.findMany({
    select: { email: true, role: true, totpSecret: true },
    orderBy: { role: "asc" },
  });

  console.log("\n=============== WOODBRIDGE DEMO LOGINS ===============");
  console.log("App:      http://localhost:3001");
  console.log(`Password: ${PASSWORD}   (same for every account)\n`);

  if (guardian) {
    console.log("GUARDIAN — no authenticator code needed");
    console.log(`  ${SURFACE.GUARDIAN}`);
    console.log(`  ${guardian.email}  (${guardian.firstName} ${guardian.lastName})\n`);
  }

  console.log("STAFF — enter the 6-digit code below in the 'Authenticator code' field");
  for (const s of staff) {
    const code = s.totpSecret ? authenticator.generate(s.totpSecret) : "—";
    console.log(`  ${SURFACE[s.role]}`);
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
