import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";
import {
  assignStudentClassroom,
  createClassroom,
  getClassroomManagement,
  listClassroomSchools,
  setClassroomActive,
} from "./classrooms";

const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[classrooms.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const districtId of districtIds) {
    await prisma.auditLog.deleteMany({ where: { districtId } });
    await prisma.student.deleteMany({ where: { districtId } });
    await prisma.classroom.deleteMany({ where: { school: { districtId } } });
    await prisma.userSchool.deleteMany({ where: { user: { districtId } } });
    await prisma.user.deleteMany({ where: { districtId } });
    await prisma.school.deleteMany({ where: { districtId } });
    await prisma.district.deleteMany({ where: { id: districtId } });
  }
  await prisma.$disconnect();
});

async function fixture() {
  const district = await prisma.district.create({ data: { name: `CLASS-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  const [schoolA, schoolB] = await Promise.all([
    prisma.school.create({ data: { districtId: district.id, name: "School A", code: `A${crypto.randomUUID()}` } }),
    prisma.school.create({ data: { districtId: district.id, name: "School B", code: `B${crypto.randomUUID()}` } }),
  ]);
  const users = await Promise.all([
    prisma.user.create({ data: { email: `staff-${crypto.randomUUID()}@test.invalid`, passwordHash: "x", firstName: "School", lastName: "Staff", role: "SCHOOL_STAFF", districtId: district.id, schools: { create: { schoolId: schoolA.id } } } }),
    prisma.user.create({ data: { email: `district-${crypto.randomUUID()}@test.invalid`, passwordHash: "x", firstName: "District", lastName: "Admin", role: "DISTRICT_ADMIN", districtId: district.id } }),
    prisma.user.create({ data: { email: `super-${crypto.randomUUID()}@test.invalid`, passwordHash: "x", firstName: "System", lastName: "Admin", role: "SUPER_ADMIN", districtId: district.id } }),
    prisma.user.create({ data: { email: `cashier-${crypto.randomUUID()}@test.invalid`, passwordHash: "x", firstName: "Casey", lastName: "Cashier", role: "CASHIER", districtId: district.id, schools: { create: { schoolId: schoolA.id } } } }),
  ]);
  const [staff, districtAdmin, superAdmin, cashier] = users;
  const sessions = {
    staff: { principalType: "staff", userId: staff.id, role: "SCHOOL_STAFF", districtId: district.id, schoolIds: [schoolA.id] } as AppSession,
    district: { principalType: "staff", userId: districtAdmin.id, role: "DISTRICT_ADMIN", districtId: district.id, schoolIds: [] } as AppSession,
    super: { principalType: "staff", userId: superAdmin.id, role: "SUPER_ADMIN", districtId: district.id, schoolIds: [] } as AppSession,
    cashier: { principalType: "staff", userId: cashier.id, role: "CASHIER", districtId: district.id, schoolIds: [schoolA.id] } as AppSession,
    guardian: { principalType: "guardian", guardianId: "guardian", role: "GUARDIAN" } as AppSession,
  };
  const [studentA, studentB] = await Promise.all([
    prisma.student.create({ data: { districtId: district.id, schoolId: schoolA.id, studentNumber: `A-${crypto.randomUUID()}`, firstName: "Ari", lastName: "Anders", grade: "3" } }),
    prisma.student.create({ data: { districtId: district.id, schoolId: schoolB.id, studentNumber: `B-${crypto.randomUUID()}`, firstName: "Bea", lastName: "Brooks", grade: "4" } }),
  ]);
  return { district, schoolA, schoolB, sessions, studentA, studentB };
}

describe.skipIf(!dbUp)("classroom administration", () => {
  it("enforces role hierarchy and ordinary school scope in server code", async () => {
    const f = await fixture();
    expect((await listClassroomSchools(f.sessions.staff)).map((school) => school.id)).toEqual([f.schoolA.id]);
    expect(new Set((await listClassroomSchools(f.sessions.district)).map((school) => school.id))).toEqual(new Set([f.schoolA.id, f.schoolB.id]));
    await expect(createClassroom(f.sessions.staff, { schoolId: f.schoolB.id, teacherName: "Wrong Scope" })).rejects.toBeInstanceOf(AuthError);
    await expect(createClassroom(f.sessions.cashier, { schoolId: f.schoolA.id, teacherName: "Cashier" })).rejects.toBeInstanceOf(AuthError);
    await expect(createClassroom(f.sessions.guardian, { schoolId: f.schoolA.id, teacherName: "Guardian" })).rejects.toBeInstanceOf(AuthError);
    await expect(createClassroom(f.sessions.district, { schoolId: f.schoolB.id, teacherName: "Drew Garcia" })).resolves.toMatchObject({ schoolId: f.schoolB.id });
    await expect(createClassroom(f.sessions.super, { schoolId: f.schoolA.id, teacherName: "Robin Osei" })).resolves.toMatchObject({ schoolId: f.schoolA.id });
  });

  it("creates, assigns, reassigns, unassigns, and deactivates with atomic audit evidence", async () => {
    const f = await fixture();
    const first = await createClassroom(f.sessions.staff, { schoolId: f.schoolA.id, teacherName: "Priya Shah", grade: "3" });
    const second = await createClassroom(f.sessions.staff, { schoolId: f.schoolA.id, teacherName: "Daniel Carter", grade: "3" });
    await assignStudentClassroom(f.sessions.staff, { studentId: f.studentA.id, classroomId: first.id });
    await assignStudentClassroom(f.sessions.staff, { studentId: f.studentA.id, classroomId: second.id });
    await assignStudentClassroom(f.sessions.staff, { studentId: f.studentA.id, classroomId: null });
    await assignStudentClassroom(f.sessions.staff, { studentId: f.studentA.id, classroomId: first.id });
    await setClassroomActive(f.sessions.staff, first.id, false);

    const student = await prisma.student.findUniqueOrThrow({ where: { id: f.studentA.id } });
    expect(student.classroomId).toBe(first.id);
    const view = await getClassroomManagement(f.sessions.staff, f.schoolA.id);
    expect(view.students.find((row) => row.id === f.studentA.id)?.needsAssignment).toBe(true);
    expect(await prisma.auditLog.findMany({
      where: { districtId: f.district.id },
      select: { action: true, beforeJson: true, afterJson: true },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "CLASSROOM_CREATED" }),
      expect.objectContaining({ action: "STUDENT_CLASSROOM_ASSIGNED", afterJson: expect.objectContaining({ teacherName: "Priya Shah" }) }),
      expect.objectContaining({ action: "STUDENT_CLASSROOM_REASSIGNED", beforeJson: expect.objectContaining({ teacherName: "Priya Shah" }), afterJson: expect.objectContaining({ teacherName: "Daniel Carter" }) }),
      expect.objectContaining({ action: "STUDENT_CLASSROOM_UNASSIGNED" }),
      expect.objectContaining({ action: "CLASSROOM_DEACTIVATED" }),
    ]));
  });

  it("rejects ambiguous case-insensitive teacher names and cross-school assignments", async () => {
    const f = await fixture();
    const classroom = await createClassroom(f.sessions.staff, { schoolId: f.schoolA.id, teacherName: "Priya Shah" });
    await expect(createClassroom(f.sessions.staff, { schoolId: f.schoolA.id, teacherName: "  priya shah  " })).rejects.toEqual(expect.objectContaining({ code: "DUPLICATE" }));
    await expect(assignStudentClassroom(f.sessions.district, { studentId: f.studentB.id, classroomId: classroom.id })).rejects.toEqual(expect.objectContaining({ code: "INVALID" }));
    await expect(prisma.student.update({ where: { id: f.studentB.id }, data: { classroomId: classroom.id } })).rejects.toThrow();
  });

  it("rolls back an assignment when its audit write fails", async () => {
    const f = await fixture();
    const classroom = await createClassroom(f.sessions.staff, { schoolId: f.schoolA.id, teacherName: "Audit Teacher" });
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const fn = `reject_classroom_audit_${suffix}`;
    const trigger = `reject_classroom_audit_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN IF NEW."districtId" = '${f.district.id}' AND NEW.action = 'STUDENT_CLASSROOM_ASSIGNED' THEN RAISE EXCEPTION 'forced classroom audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
    try {
      await expect(assignStudentClassroom(f.sessions.staff, { studentId: f.studentA.id, classroomId: classroom.id })).rejects.toThrow();
      expect((await prisma.student.findUniqueOrThrow({ where: { id: f.studentA.id } })).classroomId).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });
});
