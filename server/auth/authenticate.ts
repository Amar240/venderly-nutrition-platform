import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { verifyPassword } from "./password";
import { verifyTotp } from "./totp";
import { computeLockedUntil, ipRateLimited, isLocked } from "./rateLimit";
import type { AppSession } from "./types";

/**
 * The one place credentials are checked. Auth.js authorize() is a thin wrapper
 * over this. Handles per-IP rate limiting, per-account progressive lockout,
 * password verification, staff TOTP (guardians are single-factor), and audit.
 */

export interface Credentials {
  email: string;
  password: string;
  totp?: string;
  ip?: string;
}

export type AuthFailureReason =
  | "invalid"
  | "locked"
  | "rate_limited"
  | "totp_required"
  | "totp_invalid";

export type AuthResult =
  | { ok: true; session: AppSession }
  | { ok: false; reason: AuthFailureReason };

export async function authenticate(creds: Credentials): Promise<AuthResult> {
  const email = creds.email.trim().toLowerCase();
  const ip = creds.ip ?? "unknown";

  if (ipRateLimited(ip)) {
    await writeAudit({
      actorType: "SYSTEM",
      action: "LOGIN_RATE_LIMITED",
      subjectType: "email",
      subjectId: email,
      ip,
    });
    return { ok: false, reason: "rate_limited" };
  }

  // Resolve principal: staff first, then guardian.
  const user = await prisma.user.findUnique({
    where: { email },
    include: { schools: { select: { schoolId: true } } },
  });
  if (user) {
    return authenticateStaff(user, creds, ip);
  }

  const guardian = await prisma.guardian.findUnique({ where: { email } });
  if (guardian) {
    return authenticateGuardian(guardian, creds, ip);
  }

  await writeAudit({
    actorType: "SYSTEM",
    action: "LOGIN_FAILED",
    subjectType: "email",
    subjectId: email,
    reason: "unknown_account",
    ip,
  });
  return { ok: false, reason: "invalid" };
}

type UserWithSchools = NonNullable<
  Awaited<ReturnType<typeof loadUser>>
>;
async function loadUser(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { schools: { select: { schoolId: true } } },
  });
}

async function authenticateStaff(
  user: UserWithSchools,
  creds: Credentials,
  ip: string,
): Promise<AuthResult> {
  if (isLocked(user.lockedUntil)) {
    await writeAudit({
      actorType: "USER",
      actorId: user.id,
      action: "LOGIN_LOCKED",
      districtId: user.districtId,
      ip,
    });
    return { ok: false, reason: "locked" };
  }

  const passwordOk = await verifyPassword(creds.password, user.passwordHash);
  if (!passwordOk) {
    await registerFailure("user", user.id, user.failedLoginCount, user.districtId, ip);
    return { ok: false, reason: "invalid" };
  }

  // Staff second factor (guardians never reach here).
  if (!user.totpSecret) {
    // Misconfigured staff account with no enrolled secret — deny, don't bypass.
    return { ok: false, reason: "totp_required" };
  }
  if (!creds.totp || creds.totp.trim() === "") {
    return { ok: false, reason: "totp_required" };
  }
  if (!verifyTotp(creds.totp, user.totpSecret)) {
    await registerFailure("user", user.id, user.failedLoginCount, user.districtId, ip);
    await writeAudit({
      actorType: "USER",
      actorId: user.id,
      action: "LOGIN_TOTP_INVALID",
      districtId: user.districtId,
      ip,
    });
    return { ok: false, reason: "totp_invalid" };
  }

  await resetFailures("user", user.id);
  await writeAudit({
    actorType: "USER",
    actorId: user.id,
    action: "LOGIN_SUCCESS",
    districtId: user.districtId,
    ip,
  });

  if (user.role === "GUARDIAN") {
    // Defensive: a staff table row must never carry the GUARDIAN role.
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    session: {
      principalType: "staff",
      userId: user.id,
      role: user.role,
      districtId: user.districtId,
      schoolIds: user.schools.map((s) => s.schoolId),
    },
  };
}

type GuardianRow = NonNullable<
  Awaited<ReturnType<typeof prisma.guardian.findUnique>>
>;

async function authenticateGuardian(
  guardian: GuardianRow,
  creds: Credentials,
  ip: string,
): Promise<AuthResult> {
  if (isLocked(guardian.lockedUntil)) {
    await writeAudit({
      actorType: "GUARDIAN",
      actorId: guardian.id,
      action: "LOGIN_LOCKED",
      ip,
    });
    return { ok: false, reason: "locked" };
  }

  const passwordOk = await verifyPassword(creds.password, guardian.passwordHash);
  if (!passwordOk) {
    await registerFailure("guardian", guardian.id, guardian.failedLoginCount, null, ip);
    return { ok: false, reason: "invalid" };
  }

  await resetFailures("guardian", guardian.id);
  await writeAudit({
    actorType: "GUARDIAN",
    actorId: guardian.id,
    action: "LOGIN_SUCCESS",
    ip,
  });

  return {
    ok: true,
    session: {
      principalType: "guardian",
      guardianId: guardian.id,
      role: "GUARDIAN",
    },
  };
}

async function registerFailure(
  kind: "user" | "guardian",
  id: string,
  currentCount: number,
  districtId: string | null,
  ip: string,
) {
  const failedLoginCount = currentCount + 1;
  const lockedUntil = computeLockedUntil(failedLoginCount);
  if (kind === "user") {
    await prisma.user.update({
      where: { id },
      data: { failedLoginCount, lockedUntil },
    });
  } else {
    await prisma.guardian.update({
      where: { id },
      data: { failedLoginCount, lockedUntil },
    });
  }
  await writeAudit({
    actorType: kind === "user" ? "USER" : "GUARDIAN",
    actorId: id,
    action: lockedUntil ? "LOGIN_LOCKED_OUT" : "LOGIN_FAILED",
    districtId,
    ip,
  });
}

async function resetFailures(kind: "user" | "guardian", id: string) {
  if (kind === "user") {
    await prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  } else {
    await prisma.guardian.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
