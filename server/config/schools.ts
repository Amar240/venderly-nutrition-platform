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

export interface SchoolConfigInput {
  name: string;
  code: string;
  breakfastServiceEndMinutes?: number | null;
  lunchServiceEndMinutes?: number | null;
}

function schoolFields(s: SchoolConfigInput | School) {
  return {
    name: s.name,
    code: s.code,
    breakfastServiceEndMinutes: s.breakfastServiceEndMinutes ?? null,
    lunchServiceEndMinutes: s.lunchServiceEndMinutes ?? null,
  };
}

function assertSchoolInput(input: SchoolConfigInput) {
  if (!input.name.trim() || !input.code.trim()) throw new ConfigError("INVALID");
  for (const minutes of [input.breakfastServiceEndMinutes, input.lunchServiceEndMinutes]) {
    if (minutes === null || minutes === undefined) continue;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) throw new ConfigError("INVALID");
  }
}

export async function createSchool(
  session: AppSession | null | undefined,
  input: SchoolConfigInput,
): Promise<School> {
  const staff = assertSuperAdmin(session);
  assertSchoolInput(input);
  let school: School;
  try {
    school = await prisma.school.create({
      data: {
        districtId: staff.districtId,
        name: input.name.trim(),
        code: input.code.trim(),
        breakfastServiceEndMinutes: input.breakfastServiceEndMinutes ?? null,
        lunchServiceEndMinutes: input.lunchServiceEndMinutes ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConfigError("INVALID");
    throw err;
  }
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_SCHOOL_CREATE",
    subjectType: "school", subjectId: school.id, districtId: staff.districtId, schoolId: school.id,
    before: null, after: schoolFields(school),
  });
  return school;
}

export async function updateSchool(
  session: AppSession | null | undefined,
  schoolId: string,
  input: SchoolConfigInput,
): Promise<School> {
  const staff = assertSuperAdmin(session);
  assertSchoolInput(input);
  const before = await prisma.school.findFirst({ where: { id: schoolId, districtId: staff.districtId } });
  if (!before) throw new ConfigError("NOT_FOUND");
  let after: School;
  try {
    after = await prisma.school.update({
      where: { id: schoolId },
      data: {
        name: input.name.trim(),
        code: input.code.trim(),
        breakfastServiceEndMinutes: input.breakfastServiceEndMinutes ?? null,
        lunchServiceEndMinutes: input.lunchServiceEndMinutes ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConfigError("INVALID");
    throw err;
  }
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_SCHOOL_UPDATE",
    subjectType: "school", subjectId: schoolId, districtId: staff.districtId, schoolId,
    before: schoolFields(before), after: schoolFields(after),
  });
  return after;
}
