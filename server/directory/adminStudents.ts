import { prisma } from "@/server/db/client";
import { requireStaff, scopeToSchools, canAccessSchool } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";
import { getBalanceCents } from "@/server/ledger/ledger";
import { getMoneyHistoryForAccount, type MoneyHistoryItem } from "@/server/ledger/moneyHistory";
import type { MealEvent, AuditLog } from "@prisma/client";

/**
 * Admin student search + detail. Every query is scoped to the session's schools
 * and NONE of them read StudentPricing — a detail view or report must never
 * expose a pricing tier (D-1). Balance is derived from the ledger, not the cache.
 */

export interface StudentSearchResult {
  id: string;
  studentNumber: string;
  name: string;
  grade: string;
  schoolName: string;
}

/** Assert a staff session may act on this student (district + school scope). */
export function assertStudentInScope(
  session: AppSession | null | undefined,
  student: { districtId: string; schoolId: string },
): void {
  const staff = requireStaff(session);
  if (student.districtId !== staff.districtId) throw new AuthError("FORBIDDEN_SCOPE");
  if (!canAccessSchool(session, student.schoolId)) throw new AuthError("FORBIDDEN_SCOPE");
}

/** Search by exact student number or name (contains), scoped to the session. */
export async function searchStudents(
  session: AppSession | null | undefined,
  query: string,
): Promise<StudentSearchResult[]> {
  requireStaff(session);
  const scope = scopeToSchools(session);
  const q = query.trim();
  if (!q) return [];

  const students = await prisma.student.findMany({
    where: {
      districtId: scope.districtId,
      ...(scope.schoolId ? { schoolId: scope.schoolId } : {}),
      OR: [
        { studentNumber: q },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      studentNumber: true,
      firstName: true,
      lastName: true,
      grade: true,
      school: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 50,
  });

  return students.map((s) => ({
    id: s.id,
    studentNumber: s.studentNumber,
    name: `${s.firstName} ${s.lastName}`,
    grade: s.grade,
    schoolName: s.school.name,
  }));
}

export interface AdminGuardian {
  name: string;
  email: string;
  relationship: string | null;
}

export interface StudentAdminDetail {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  grade: string;
  schoolId: string;
  schoolName: string;
  enrollmentStatus: string;
  accountId: string | null;
  balanceCents: number;
  history: MoneyHistoryItem[];
  mealEvents: (MealEvent & {
    reversedByUser: { firstName: string; lastName: string } | null;
  })[];
  itemSales: (ItemSaleView)[];
  guardians: AdminGuardian[];
  audit: AuditLog[];
  /** True when the viewer may run corrections (district admin+). */
  canCorrect: boolean;
}

export interface ItemSaleView {
  id: string;
  itemName: string;
  priceCentsAtSale: number;
  createdAt: Date;
}

export async function getStudentAdminDetail(
  session: AppSession | null | undefined,
  studentId: string,
): Promise<StudentAdminDetail | null> {
  const staff = requireStaff(session);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      account: true,
      guardianLinks: { include: { guardian: true } },
    },
  });
  if (!student) return null;
  assertStudentInScope(session, student);

  const accountId = student.account?.id ?? null;
  const auditIds = [studentId, accountId].filter((v): v is string => Boolean(v));

  const [balanceCents, history, mealEvents, itemSales, audit] = await Promise.all([
    accountId ? getBalanceCents(accountId) : Promise.resolve(0),
    accountId
      ? getMoneyHistoryForAccount(accountId, {
          visibleSchoolIds: staff.role === "SUPER_ADMIN" ? undefined : staff.schoolIds,
        })
      : Promise.resolve([] as MoneyHistoryItem[]),
    prisma.mealEvent.findMany({
      where: { studentId },
      include: { reversedByUser: { select: { firstName: true, lastName: true } } },
      orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }, { overrideSeq: "asc" }],
    }),
    prisma.itemSale.findMany({
      where: { studentId },
      include: { item: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: {
        subjectId: { in: auditIds },
        // Never surface tier-change events in a student detail view (D-1).
        action: { not: "STUDENT_PRICE_TIER_CHANGED" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    id: student.id,
    studentNumber: student.studentNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    grade: student.grade,
    schoolId: student.schoolId,
    schoolName: student.school.name,
    enrollmentStatus: student.enrollmentStatus,
    accountId,
    balanceCents,
    history,
    mealEvents,
    itemSales: itemSales.map((s) => ({
      id: s.id,
      itemName: s.item.name,
      priceCentsAtSale: s.priceCentsAtSale,
      createdAt: s.createdAt,
    })),
    guardians: student.guardianLinks.map((l) => ({
      name: `${l.guardian.firstName} ${l.guardian.lastName}`,
      email: l.guardian.email,
      relationship: l.relationship,
    })),
    audit,
    canCorrect: staff.role === "DISTRICT_ADMIN" || staff.role === "SUPER_ADMIN",
  };
}
