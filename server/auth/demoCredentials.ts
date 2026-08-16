import { prisma } from "@/server/db/client";
import { currentTotpToken } from "@/server/auth/totp";

/**
 * Sign-in hints for the four seeded evaluator accounts, shown on the sign-in
 * page so a nutrition director can try the product without installing an
 * authenticator app.
 *
 * The second factor is NOT removed. Staff sign-in still requires a valid TOTP
 * code and `verifyTotp` still runs — this only displays the code that is valid
 * right now for accounts that exist purely to be demonstrated. That is a
 * deliberately better demo than switching MFA off: the evaluator can see that
 * privileged accounts are protected, instead of discovering later that they
 * were not.
 *
 * Three independent guards, each sufficient on its own:
 *
 *  1. OFF unless `PROTOTYPE_SHOW_DEMO_CODES` is exactly "true". Fail-safe by
 *     default, so forgetting to remove it is not the failure mode — forgetting
 *     to ADD it is, and that fails visibly rather than silently.
 *  2. A hard-coded allowlist of the four seeded demo addresses. A real staff
 *     account created through the admin console can never appear here, however
 *     the function is called.
 *  3. No parameters. Nothing about this can be steered by a request, so it
 *     cannot be turned into an oracle for "what is the code for <email>".
 *
 * The stored secret is never returned — only the six digits valid this moment.
 */

const DEMO_EMAILS = [
  "guardian@woodbridge.demo",
  "cashier@woodbridge.demo",
  "districtadmin@woodbridge.demo",
  "superadmin@woodbridge.demo",
] as const;

const DEMO_LABELS: Record<string, string> = {
  "guardian@woodbridge.demo": "Guardian",
  "cashier@woodbridge.demo": "Cashier",
  "districtadmin@woodbridge.demo": "District admin",
  "superadmin@woodbridge.demo": "Super admin",
};

export interface DemoSignInHint {
  label: string;
  email: string;
  /** Six digits valid right now, or null for single-factor guardians. */
  code: string | null;
}

export function demoCodesEnabled(): boolean {
  return process.env.PROTOTYPE_SHOW_DEMO_CODES === "true";
}

export async function demoSignInHints(): Promise<DemoSignInHint[]> {
  if (!demoCodesEnabled()) return [];

  const staff = await prisma.user.findMany({
    where: {
      email: { in: [...DEMO_EMAILS] },
      disabledAt: null,
    },
    select: { email: true, totpSecret: true },
  });

  const guardian = await prisma.guardian.findUnique({
    where: { email: "guardian@woodbridge.demo" },
    select: { email: true },
  });

  const hints: DemoSignInHint[] = [];

  if (guardian) {
    hints.push({
      label: DEMO_LABELS[guardian.email] ?? "Guardian",
      email: guardian.email,
      code: null,
    });
  }

  for (const email of DEMO_EMAILS) {
    const user = staff.find((s) => s.email === email);
    if (!user?.totpSecret) continue;
    hints.push({
      label: DEMO_LABELS[email] ?? "Staff",
      email,
      code: currentTotpToken(user.totpSecret),
    });
  }

  return hints;
}
