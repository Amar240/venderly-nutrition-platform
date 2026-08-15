import { Prisma, type Classroom } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession, StaffPrincipal } from "@/server/auth/types";

const classroomInput = z.object({
  schoolId: z.string().min(1),
  teacherName: z.string().trim().min(1).max(100),
  grade: z.string().trim().max(20).optional().nullable(),
});

export class ClassroomError extends Error {
  constructor(public readonly code: "INVALID" | "NOT_FOUND" | "DUPLICATE") {
    super(code);
  }
}

function requireClassroomManager(session: AppSession | null | undefined): StaffPrincipal {
  requireRole(session, "SCHOOL_STAFF", "DISTRICT_ADMIN", "SUPER_ADMIN");
  if (!session || session.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  return session;
}

function canManageSchool(staff: StaffPrincipal, schoolId: string): boolean {
  return staff.role === "DISTRICT_ADMIN" ||
    staff.role === "SUPER_ADMIN" ||
    staff.schoolIds.includes(schoolId);
}

async function requireSchool(staff: StaffPrincipal, schoolId: string) {
  if (!canManageSchool(staff, schoolId)) throw new AuthError("FORBIDDEN_SCOPE");
  const school = await prisma.school.findFirst({
    where: { id: schoolId, districtId: staff.districtId },
    select: { id: true, name: true },
  });
  if (!school) throw new ClassroomError("NOT_FOUND");
  return school;
}

export interface ClassroomSchoolOption {
  id: string;
  name: string;
}

export async function listClassroomSchools(
  session: AppSession | null | undefined,
): Promise<ClassroomSchoolOption[]> {
  const staff = requireClassroomManager(session);
  return prisma.school.findMany({
    where: {
      districtId: staff.districtId,
      ...(staff.role === "SCHOOL_STAFF" ? { id: { in: staff.schoolIds } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface ClassroomAdminRow {
  id: string;
  teacherName: string;
  grade: string | null;
  active: boolean;
  studentCount: number;
}

export interface ClassroomStudentRow {
  id: string;
  studentNumber: string;
  name: string;
  grade: string;
  classroomId: string | null;
  classroomTeacherName: string | null;
  needsAssignment: boolean;
}

export interface ClassroomManagementView {
  school: ClassroomSchoolOption;
  classrooms: ClassroomAdminRow[];
  students: ClassroomStudentRow[];
}

export async function getClassroomManagement(
  session: AppSession | null | undefined,
  schoolId: string,
): Promise<ClassroomManagementView> {
  const staff = requireClassroomManager(session);
  const school = await requireSchool(staff, schoolId);
  const [classrooms, students] = await Promise.all([
    prisma.classroom.findMany({
      where: { schoolId },
      include: {
        _count: {
          select: { students: { where: { enrollmentStatus: "ACTIVE" } } },
        },
      },
      orderBy: [{ active: "desc" }, { teacherName: "asc" }],
    }),
    prisma.student.findMany({
      where: { schoolId, enrollmentStatus: "ACTIVE" },
      select: {
        id: true,
        studentNumber: true,
        firstName: true,
        lastName: true,
        grade: true,
        classroomId: true,
        classroom: { select: { teacherName: true, active: true } },
      },
      orderBy: [{ grade: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return {
    school,
    classrooms: classrooms.map((classroom) => ({
      id: classroom.id,
      teacherName: classroom.teacherName,
      grade: classroom.grade,
      active: classroom.active,
      studentCount: classroom._count.students,
    })),
    students: students.map((student) => ({
      id: student.id,
      studentNumber: student.studentNumber,
      name: `${student.firstName} ${student.lastName}`,
      grade: student.grade,
      classroomId: student.classroomId,
      classroomTeacherName: student.classroom?.teacherName ?? null,
      needsAssignment: !student.classroomId || !student.classroom?.active,
    })),
  };
}

export async function createClassroom(
  session: AppSession | null | undefined,
  input: { schoolId: string; teacherName: string; grade?: string | null },
): Promise<Classroom> {
  const staff = requireClassroomManager(session);
  const parsed = classroomInput.safeParse(input);
  if (!parsed.success) throw new ClassroomError("INVALID");
  await requireSchool(staff, parsed.data.schoolId);

  try {
    return await prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.create({
        data: {
          schoolId: parsed.data.schoolId,
          teacherName: parsed.data.teacherName,
          grade: parsed.data.grade || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "USER",
          actorId: staff.userId,
          action: "CLASSROOM_CREATED",
          subjectType: "classroom",
          subjectId: classroom.id,
          districtId: staff.districtId,
          schoolId: classroom.schoolId,
          afterJson: {
            teacherName: classroom.teacherName,
            grade: classroom.grade,
            active: classroom.active,
          },
        },
      });
      return classroom;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ClassroomError("DUPLICATE");
    }
    throw error;
  }
}

export async function setClassroomActive(
  session: AppSession | null | undefined,
  classroomId: string,
  active: boolean,
): Promise<Classroom> {
  const staff = requireClassroomManager(session);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Classroom" WHERE id = ${classroomId} FOR UPDATE`;
    const before = await tx.classroom.findUnique({
      where: { id: classroomId },
      include: { school: { select: { districtId: true } } },
    });
    if (!before || before.school.districtId !== staff.districtId) throw new ClassroomError("NOT_FOUND");
    if (!canManageSchool(staff, before.schoolId)) throw new AuthError("FORBIDDEN_SCOPE");
    if (before.active === active) return before;
    const after = await tx.classroom.update({ where: { id: classroomId }, data: { active } });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: staff.userId,
        action: active ? "CLASSROOM_REACTIVATED" : "CLASSROOM_DEACTIVATED",
        subjectType: "classroom",
        subjectId: classroomId,
        districtId: staff.districtId,
        schoolId: before.schoolId,
        beforeJson: { active: before.active, teacherName: before.teacherName },
        afterJson: { active: after.active, teacherName: after.teacherName },
      },
    });
    return after;
  });
}

export async function assignStudentClassroom(
  session: AppSession | null | undefined,
  input: { studentId: string; classroomId: string | null },
): Promise<void> {
  const staff = requireClassroomManager(session);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${input.studentId} FOR UPDATE`;
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        districtId: true,
        schoolId: true,
        classroomId: true,
        classroom: { select: { id: true, teacherName: true } },
      },
    });
    if (!student || student.districtId !== staff.districtId) throw new ClassroomError("NOT_FOUND");
    if (!canManageSchool(staff, student.schoolId)) throw new AuthError("FORBIDDEN_SCOPE");

    const nextClassroom = input.classroomId
      ? await tx.classroom.findFirst({
          where: { id: input.classroomId, schoolId: student.schoolId, active: true },
          select: { id: true, teacherName: true },
        })
      : null;
    if (input.classroomId && !nextClassroom) throw new ClassroomError("INVALID");
    if (student.classroomId === (nextClassroom?.id ?? null)) return;

    const action = !student.classroomId
      ? "STUDENT_CLASSROOM_ASSIGNED"
      : nextClassroom
        ? "STUDENT_CLASSROOM_REASSIGNED"
        : "STUDENT_CLASSROOM_UNASSIGNED";

    await tx.student.update({
      where: { id: student.id },
      data: { classroomId: nextClassroom?.id ?? null },
    });
    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: staff.userId,
        action,
        subjectType: "student",
        subjectId: student.id,
        districtId: staff.districtId,
        schoolId: student.schoolId,
        reason: "Classroom assignment changed",
        beforeJson: student.classroom
          ? { classroomId: student.classroom.id, teacherName: student.classroom.teacherName }
          : { classroomId: null },
        afterJson: nextClassroom
          ? { classroomId: nextClassroom.id, teacherName: nextClassroom.teacherName }
          : { classroomId: null },
      },
    });
  });
}
