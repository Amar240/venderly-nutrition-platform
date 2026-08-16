import type { MealType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession, StaffPrincipal } from "@/server/auth/types";
import { districtToday } from "@/server/time/district";
import { notifyIfLowBalanceCrossed } from "@/server/notifications/service";
import { triggerAutomaticTopUpsForDebit } from "@/server/household/autoTopUp";
import { findLiveServedStudentIds } from "./mealCounts";
import {
  lockCashierAndChooseRecordedAt,
  MealStudentWriteError,
  writeMealsAtomic,
} from "./recordMealsAtomic";

const batchSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH"]),
  groupKey: z.string().min(1).max(200),
  studentIds: z.array(z.string().min(1)).min(1).max(200)
    .refine((ids) => new Set(ids).size === ids.length),
});

type RosterGroupRef =
  | { kind: "classroom"; classroomId: string }
  | { kind: "needs_assignment"; schoolId: string };

function requireCashier(session: AppSession | null | undefined): StaffPrincipal {
  requireRole(session, "CASHIER");
  if (!session || session.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  return session;
}

function parseGroupKey(groupKey: string): RosterGroupRef | null {
  const separator = groupKey.indexOf(":");
  if (separator < 1) return null;
  const kind = groupKey.slice(0, separator);
  const id = groupKey.slice(separator + 1);
  if (!id) return null;
  if (kind === "classroom") return { kind, classroomId: id };
  if (kind === "needs") return { kind: "needs_assignment", schoolId: id };
  return null;
}

function canServeAt(staff: StaffPrincipal, schoolId: string): boolean {
  return staff.schoolIds.includes(schoolId);
}

function lastInitial(lastName: string): string {
  const initial = Array.from(lastName.trim())[0];
  return initial ? `${initial.toLocaleUpperCase()}.` : "";
}

function shortName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${lastInitial(student.lastName)}`.trim();
}

export interface RosterClassOption {
  groupKey: string;
  teacherName: string;
  grade: string | null;
  schoolName: string;
  studentCount: number;
  needsAssignment: boolean;
}

/** A class chooser, scoped to the cashier and containing no student details. */
export async function listRosterClasses(
  session: AppSession | null | undefined,
): Promise<RosterClassOption[]> {
  const staff = requireCashier(session);
  if (staff.schoolIds.length === 0) return [];
  const schools = await prisma.school.findMany({
    where: {
      districtId: staff.districtId,
      id: { in: staff.schoolIds },
      classrooms: { some: {} },
    },
    select: {
      id: true,
      name: true,
      classrooms: {
        where: { active: true },
        select: {
          id: true,
          teacherName: true,
          grade: true,
          _count: {
            select: { students: { where: { enrollmentStatus: "ACTIVE" } } },
          },
        },
        orderBy: { teacherName: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const options: RosterClassOption[] = [];
  for (const school of schools) {
    for (const classroom of school.classrooms) {
      options.push({
        groupKey: `classroom:${classroom.id}`,
        teacherName: classroom.teacherName,
        grade: classroom.grade,
        schoolName: school.name,
        studentCount: classroom._count.students,
        needsAssignment: false,
      });
    }
    const needsAssignment = await prisma.student.count({
      where: {
        schoolId: school.id,
        enrollmentStatus: "ACTIVE",
        OR: [
          { classroomId: null },
          { classroom: { is: { active: false } } },
        ],
      },
    });
    if (needsAssignment > 0) {
      options.push({
        groupKey: `needs:${school.id}`,
        teacherName: "Needs class assignment",
        grade: null,
        schoolName: school.name,
        studentCount: needsAssignment,
        needsAssignment: true,
      });
    }
  }
  return options;
}

export interface RosterStudentTile {
  id: string;
  firstName: string;
  lastInitial: string;
  alreadyRecorded: boolean;
}

export interface RosterGroupView {
  groupKey: string;
  teacherName: string;
  grade: string | null;
  schoolName: string;
  students: RosterStudentTile[];
}

async function resolveGroup(
  staff: StaffPrincipal,
  groupKey: string,
  db: Pick<Prisma.TransactionClient, "classroom" | "school"> = prisma,
): Promise<{
  ref: RosterGroupRef;
  schoolId: string;
  schoolName: string;
  teacherName: string;
  grade: string | null;
} | null> {
  const ref = parseGroupKey(groupKey);
  if (!ref) return null;
  if (ref.kind === "classroom") {
    const classroom = await db.classroom.findFirst({
      where: {
        id: ref.classroomId,
        active: true,
        school: { districtId: staff.districtId },
      },
      select: {
        schoolId: true,
        teacherName: true,
        grade: true,
        school: { select: { name: true } },
      },
    });
    if (!classroom || !canServeAt(staff, classroom.schoolId)) return null;
    return {
      ref,
      schoolId: classroom.schoolId,
      schoolName: classroom.school.name,
      teacherName: classroom.teacherName,
      grade: classroom.grade,
    };
  }

  if (!canServeAt(staff, ref.schoolId)) return null;
  const school = await db.school.findFirst({
    where: {
      id: ref.schoolId,
      districtId: staff.districtId,
      classrooms: { some: {} },
    },
    select: { id: true, name: true },
  });
  if (!school) return null;
  return {
    ref,
    schoolId: school.id,
    schoolName: school.name,
    teacherName: "Needs class assignment",
    grade: null,
  };
}

function groupStudentWhere(group: Awaited<ReturnType<typeof resolveGroup>>) {
  if (!group) return { id: "__missing__" };
  if (group.ref.kind === "classroom") return { classroomId: group.ref.classroomId };
  return {
    OR: [
      { classroomId: null },
      { classroom: { is: { active: false } } },
    ],
  };
}

/** Minimal roster payload: no number, surname, money, price, or pricing tier. */
export async function getRosterGroup(
  session: AppSession | null | undefined,
  input: { mealType: MealType; groupKey: string },
): Promise<RosterGroupView | null> {
  const staff = requireCashier(session);
  const group = await resolveGroup(staff, input.groupKey);
  if (!group) return null;
  const students = await prisma.student.findMany({
    where: {
      schoolId: group.schoolId,
      enrollmentStatus: "ACTIVE",
      ...groupStudentWhere(group),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const serviceDate = await districtToday(staff.districtId);
  const recordedIds = await findLiveServedStudentIds({
    studentIds: students.map((student) => student.id),
    schoolId: group.schoolId,
    serviceDate,
    mealType: input.mealType,
  });

  return {
    groupKey: input.groupKey,
    teacherName: group.teacherName,
    grade: group.grade,
    schoolName: group.schoolName,
    students: students.map((student) => ({
      id: student.id,
      firstName: student.firstName,
      lastInitial: lastInitial(student.lastName),
      alreadyRecorded: recordedIds.has(student.id),
    })),
  };
}

export type RosterBatchResult =
  | {
      status: "recorded";
      recordedCount: number;
      undo: { batchId: string; expiresAt: string };
    }
  | { status: "student_failed"; studentName: string; reason: "already_recorded" | "class_changed" | "could_not_record"; message: string }
  | { status: "unavailable"; message: string };

class RosterStudentFailure extends Error {
  constructor(
    public readonly studentName: string,
    public readonly reason: "already_recorded" | "class_changed" | "could_not_record",
  ) {
    super(reason);
  }
}

class RosterUnavailable extends Error {}

function failureMessage(error: RosterStudentFailure): string {
  if (error.reason === "already_recorded") {
    return `${error.studentName} was already recorded, so refresh the class and try again.`;
  }
  if (error.reason === "class_changed") {
    return `${error.studentName} is no longer available in this class, so refresh the class and try again.`;
  }
  return `${error.studentName} could not be recorded, so nothing changed and you can try again.`;
}

export async function recordRosterBatch(
  input: {
    mealType: MealType;
    groupKey: string;
    studentIds: string[];
    session: AppSession | null | undefined;
  },
): Promise<RosterBatchResult> {
  const staff = requireCashier(input.session);
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return { status: "unavailable", message: "Choose at least one student and try again." };
  const serviceDate = await districtToday(staff.districtId);
  const batchId = crypto.randomUUID();

  try {
    const committed = await prisma.$transaction(async (tx) => {
      const recordedAt = await lockCashierAndChooseRecordedAt(tx, staff.userId);
      // Re-resolve the class after taking the cashier lock so a stale screen can
      // never write students under an old or deactivated classroom.
      const group = await resolveGroup(staff, parsed.data.groupKey, tx);
      if (!group) throw new RosterUnavailable();

      const students = await tx.student.findMany({
        where: { id: { in: parsed.data.studentIds } },
        select: {
          id: true,
          districtId: true,
          schoolId: true,
          firstName: true,
          lastName: true,
          enrollmentStatus: true,
          classroomId: true,
          classroom: { select: { active: true } },
          account: { select: { id: true, balanceCents: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      if (students.length !== parsed.data.studentIds.length) throw new RosterUnavailable();

      for (const student of students) {
        const isInGroup = group.ref.kind === "classroom"
          ? student.classroomId === group.ref.classroomId && student.classroom?.active === true
          : !student.classroomId || student.classroom?.active === false;
        if (
          student.districtId !== staff.districtId ||
          student.schoolId !== group.schoolId ||
          student.enrollmentStatus !== "ACTIVE" ||
          !isInGroup
        ) {
          throw new RosterStudentFailure(shortName(student), "class_changed");
        }
      }

      const live = await findLiveServedStudentIds({
        studentIds: students.map((student) => student.id),
        schoolId: group.schoolId,
        serviceDate,
        mealType: parsed.data.mealType,
      }, tx);
      const duplicate = students.find((student) => live.has(student.id));
      if (duplicate) throw new RosterStudentFailure(shortName(duplicate), "already_recorded");

      try {
        const notifications = await writeMealsAtomic(tx, {
          students,
          mealType: parsed.data.mealType,
          serviceDate,
          cashierId: staff.userId,
          batchId,
          recordedAt,
        });
        return { recordedAt, notifications };
      } catch (error) {
        if (error instanceof MealStudentWriteError) {
          const student = students.find((candidate) => candidate.id === error.studentId);
          if (!student) throw new RosterUnavailable();
          throw new RosterStudentFailure(
            shortName(student),
            error.code === "DUPLICATE" ? "already_recorded" : "could_not_record",
          );
        }
        throw error;
      }
    });

    for (const notification of committed.notifications) {
      try {
        await notifyIfLowBalanceCrossed(
          notification.studentId,
          notification.debitCents,
          notification.thresholdCents,
        );
        await triggerAutomaticTopUpsForDebit({
          studentId: notification.studentId,
          debitCents: notification.debitCents,
          triggeringLedgerEntryId: notification.ledgerEntryId,
        });
      } catch (error) {
        console.error("[meal] low-money notification failed after roster recording", error);
      }
    }

    return {
      status: "recorded",
      recordedCount: parsed.data.studentIds.length,
      undo: {
        batchId,
        expiresAt: new Date(committed.recordedAt.getTime() + 90_000).toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof RosterStudentFailure) {
      return {
        status: "student_failed",
        studentName: error.studentName,
        reason: error.reason,
        message: failureMessage(error),
      };
    }
    if (error instanceof RosterUnavailable) {
      return { status: "unavailable", message: "This class changed, so refresh the class and try again." };
    }
    throw error;
  }
}
