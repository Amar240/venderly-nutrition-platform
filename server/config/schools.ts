import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { assertSuperAdmin } from "./guard";
import { ConfigError } from "./items";
import type { AppSession } from "@/server/auth/types";
import type { School } from "@prisma/client";

/** School management config (super admin). Every change is audited. */
export function listSchools(session: AppSession | null | undefined): Promise<School[]> {
  const staff = assertSuperAdmin(session);
  return prisma.school.findMany({ where: { districtId: staff.districtId }, orderBy: { name: "asc" } });
}

export async function createSchool(
  session: AppSession | null | undefined,
  input: { name: string; code: string },
): Promise<School> {
  const staff = assertSuperAdmin(session);
  if (!input.name.trim() || !input.code.trim()) throw new ConfigError("INVALID");
  let school: School;
  try {
    school = await prisma.school.create({ data: { districtId: staff.districtId, name: input.name.trim(), code: input.code.trim() } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConfigError("INVALID");
    throw err;
  }
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_SCHOOL_CREATE",
    subjectType: "school", subjectId: school.id, districtId: staff.districtId, schoolId: school.id,
    before: null, after: { name: school.name, code: school.code },
  });
  return school;
}

export async function updateSchool(
  session: AppSession | null | undefined,
  schoolId: string,
  input: { name: string; code: string },
): Promise<School> {
  const staff = assertSuperAdmin(session);
  if (!input.name.trim() || !input.code.trim()) throw new ConfigError("INVALID");
  const before = await prisma.school.findFirst({ where: { id: schoolId, districtId: staff.districtId } });
  if (!before) throw new ConfigError("NOT_FOUND");
  let after: School;
  try {
    after = await prisma.school.update({ where: { id: schoolId }, data: { name: input.name.trim(), code: input.code.trim() } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConfigError("INVALID");
    throw err;
  }
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_SCHOOL_UPDATE",
    subjectType: "school", subjectId: schoolId, districtId: staff.districtId, schoolId,
    before: { name: before.name, code: before.code }, after: { name: after.name, code: after.code },
  });
  return after;
}
