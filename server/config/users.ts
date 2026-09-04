import { Prisma } from "@prisma/client";
import { authenticator } from "otplib";
import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { hashPassword } from "@/server/auth/password";
import { assertSuperAdmin } from "./guard";
import { ConfigError } from "./items";
import type { AppSession, StaffRole } from "@/server/auth/types";

/**
 * Staff user management (super admin). Users are created inside the admin's OWN
 * district (districtId comes from the session, never the form). Staff are
 * DEACTIVATED, never deleted, because AuditLog.actorId references them. A
 * created user's TOTP secret is returned ONCE and never retrievable again.
 *
 * PILOT SHORTCUT (see docs/decisions notes): creation sets a shared demo
 * password + a generated TOTP. Production needs an email invite with a
 * set-password link and self-enrolled TOTP — not a shared password.
 */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo!Pass1";
const STAFF_ROLES: StaffRole[] = ["CASHIER", "SCHOOL_STAFF", "DISTRICT_ADMIN", "SUPER_ADMIN"];

export interface StaffUserRow {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  schoolIds: string[];
  disabled: boolean;
}

export async function listStaffUsers(session: AppSession | null | undefined): Promise<StaffUserRow[]> {
  const staff = assertSuperAdmin(session);
  const users = await prisma.user.findMany({
    where: { districtId: staff.districtId },
    include: { schools: { select: { schoolId: true } } },
    orderBy: [{ disabledAt: "asc" }, { lastName: "asc" }],
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: `${u.firstName} ${u.lastName}`,
    role: u.role as StaffRole,
    schoolIds: u.schools.map((s) => s.schoolId),
    disabled: u.disabledAt !== null,
  }));
}

async function assertSchoolsInDistrict(districtId: string, schoolIds: string[]) {
  if (schoolIds.length === 0) return;
  const count = await prisma.school.count({ where: { districtId, id: { in: schoolIds } } });
  if (count !== new Set(schoolIds).size) throw new ConfigError("INVALID");
}

export async function createStaffUser(
  session: AppSession | null | undefined,
  input: { email: string; firstName: string; lastName: string; role: StaffRole; schoolIds: string[] },
): Promise<{ userId: string; totpSecret: string }> {
  const staff = assertSuperAdmin(session);
  const email = input.email.trim().toLowerCase();
  if (!email || !input.firstName.trim() || !input.lastName.trim() || !STAFF_ROLES.includes(input.role)) {
    throw new ConfigError("INVALID");
  }
  await assertSchoolsInDistrict(staff.districtId, input.schoolIds);

  const totpSecret = authenticator.generateSecret();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: input.role,
        districtId: staff.districtId, // from session, never the form
        passwordHash,
        totpSecret,
        totpEnrolledAt: new Date(),
        schools: { create: input.schoolIds.map((schoolId) => ({ schoolId })) },
      },
    });
    userId = user.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConfigError("INVALID");
    throw err;
  }

  // The audit records who/what — NEVER the password or TOTP secret.
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_USER_CREATE",
    subjectType: "user", subjectId: userId, districtId: staff.districtId,
    before: null, after: { email, role: input.role, schoolIds: input.schoolIds },
  });
  return { userId, totpSecret };
}

export async function updateStaffUser(
  session: AppSession | null | undefined,
  userId: string,
  input: { role: StaffRole; schoolIds: string[] },
): Promise<void> {
  const staff = assertSuperAdmin(session);
  if (!STAFF_ROLES.includes(input.role)) throw new ConfigError("INVALID");
  const before = await prisma.user.findFirst({
    where: { id: userId, districtId: staff.districtId },
    include: { schools: { select: { schoolId: true } } },
  });
  if (!before) throw new ConfigError("NOT_FOUND");
  await assertSchoolsInDistrict(staff.districtId, input.schoolIds);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: input.role } });
    await tx.userSchool.deleteMany({ where: { userId } });
    if (input.schoolIds.length > 0) {
      await tx.userSchool.createMany({ data: input.schoolIds.map((schoolId) => ({ userId, schoolId })) });
    }
  });

  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_USER_UPDATE",
    subjectType: "user", subjectId: userId, districtId: staff.districtId,
    before: { role: before.role, schoolIds: before.schools.map((s) => s.schoolId) },
    after: { role: input.role, schoolIds: input.schoolIds },
  });
}

export async function setUserDisabled(
  session: AppSession | null | undefined,
  userId: string,
  disabled: boolean,
): Promise<void> {
  const staff = assertSuperAdmin(session);
  if (userId === staff.userId) throw new ConfigError("INVALID"); // can't disable yourself
  const before = await prisma.user.findFirst({ where: { id: userId, districtId: staff.districtId } });
  if (!before) throw new ConfigError("NOT_FOUND");
  const after = await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: disabled ? new Date() : null },
  });
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: disabled ? "CONFIG_USER_DEACTIVATE" : "CONFIG_USER_REACTIVATE",
    subjectType: "user", subjectId: userId, districtId: staff.districtId,
    before: { disabled: before.disabledAt !== null }, after: { disabled: after.disabledAt !== null },
  });
}
