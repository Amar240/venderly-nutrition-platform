import { createHash } from "node:crypto";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/rbac";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";
import { parseImportCsv } from "./parse";
import { validateFileGate, validateRows, type ImportError } from "./validate";

/**
 * Infinite Campus roster import. Strict all-or-nothing: validate FULLY before any
 * write; if anything is wrong, nothing is committed. Upsert by (district,
 * studentNumber); students absent from the file are marked inactive (never
 * deleted). Dropped columns never enter this pipeline — the parser never read
 * them. Idempotent: re-running the same file is a no-op.
 */

/** Stop and require confirmation if a file would deactivate more than this share. */
export const MASS_DEACTIVATION_THRESHOLD = 0.1; // 10%

export interface ImportCounts {
  created: number;
  updated: number;
  inactive: number;
  skipped: number;
  failed: number;
}

export type ImportResult =
  | { status: "rejected"; ignoredColumns: number; errors: ImportError[]; importRunId: string }
  | {
      status: "needs_confirmation";
      ignoredColumns: number;
      plan: { created: number; updated: number; inactive: number; skipped: number };
      deactivateCount: number;
      activeCount: number;
      sharePct: number;
    }
  | { status: "committed"; ignoredColumns: number; counts: ImportCounts; importRunId: string; confirmed: boolean };

export async function runImport(
  session: AppSession | null | undefined,
  input: { filename: string; content: string; confirmDeactivation?: boolean },
): Promise<ImportResult> {
  requireRole(session, "SUPER_ADMIN");
  if (!session || session.principalType !== "staff") throw new AuthError("FORBIDDEN_ROLE");
  const districtId = session.districtId;

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  const operator = user?.email ?? session.userId;
  const checksum = createHash("sha256").update(input.content).digest("hex");
  const byteLength = Buffer.byteLength(input.content, "utf8");

  const parsed = parseImportCsv(input.content);
  const ignoredColumns = parsed.ignoredByPolicyCount;

  const schools = await prisma.school.findMany({ where: { districtId }, select: { id: true, code: true } });
  const codeToSchoolId = new Map(schools.map((s) => [s.code, s.id]));

  // Validate fully before any write.
  const gateErrors = validateFileGate({ filename: input.filename, byteLength, headers: parsed.headers, rowCount: parsed.rows.length });
  const rowErrors = gateErrors.length > 0 ? [] : validateRows(parsed.rows, new Set(codeToSchoolId.keys()));
  const errors = [...gateErrors, ...rowErrors];

  if (errors.length > 0) {
    const run = await prisma.importRun.create({
      data: { districtId, source: input.filename, operator, checksum, status: "rejected", failedCount: errors.length, errorsJson: errors as object[] },
    });
    return { status: "rejected", ignoredColumns, errors, importRunId: run.id };
  }

  // Plan (every row is valid here).
  const existing = await prisma.student.findMany({
    where: { districtId },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, middleName: true, grade: true, schoolId: true, enrollmentStatus: true },
  });
  const existingByNumber = new Map(existing.map((s) => [s.studentNumber, s]));
  const fileNumbers = new Set(parsed.rows.map((r) => r.studentNumber));

  const toCreate: { studentNumber: string; firstName: string; lastName: string; middleName: string; grade: string; schoolId: string }[] = [];
  const toUpdate: { id: string; firstName: string; lastName: string; middleName: string; grade: string; schoolId: string }[] = [];
  let skipped = 0;
  for (const row of parsed.rows) {
    const schoolId = codeToSchoolId.get(row.schoolCode)!;
    const ex = existingByNumber.get(row.studentNumber);
    if (!ex) {
      toCreate.push({ studentNumber: row.studentNumber, firstName: row.firstName, lastName: row.lastName, middleName: row.middleName, grade: row.grade, schoolId });
    } else {
      const changed =
        ex.firstName !== row.firstName ||
        ex.lastName !== row.lastName ||
        (ex.middleName ?? "") !== row.middleName ||
        ex.grade !== row.grade ||
        ex.schoolId !== schoolId ||
        ex.enrollmentStatus !== "ACTIVE";
      if (changed) toUpdate.push({ id: ex.id, firstName: row.firstName, lastName: row.lastName, middleName: row.middleName, grade: row.grade, schoolId });
      else skipped++;
    }
  }

  const activeStudents = existing.filter((s) => s.enrollmentStatus === "ACTIVE");
  const toDeactivate = activeStudents.filter((s) => !fileNumbers.has(s.studentNumber));
  const deactivateCount = toDeactivate.length;
  const activeCount = activeStudents.length;
  const sharePct = activeCount > 0 ? (deactivateCount / activeCount) * 100 : 0;

  // Safety control: a truncated file must not silently deactivate a district.
  const overThreshold = activeCount > 0 && deactivateCount / activeCount > MASS_DEACTIVATION_THRESHOLD;
  if (overThreshold && !input.confirmDeactivation) {
    return {
      status: "needs_confirmation",
      ignoredColumns,
      plan: { created: toCreate.length, updated: toUpdate.length, inactive: deactivateCount, skipped },
      deactivateCount,
      activeCount,
      sharePct,
    };
  }

  const confirmationJson = overThreshold
    ? { deactivateCount, activeBefore: activeCount, sharePct: Math.round(sharePct * 10) / 10, confirmedBy: operator, confirmedAt: new Date().toISOString() }
    : undefined;

  const run = await prisma.$transaction(async (tx) => {
    for (const c of toCreate) {
      await tx.student.create({
        data: {
          districtId, schoolId: c.schoolId, studentNumber: c.studentNumber,
          firstName: c.firstName, lastName: c.lastName, middleName: c.middleName || null, grade: c.grade,
          enrollmentStatus: "ACTIVE",
          account: { create: { balanceCents: 0 } }, // NOTE: never StudentPricing (D-1)
        },
      });
    }
    for (const u of toUpdate) {
      await tx.student.update({
        where: { id: u.id },
        data: { firstName: u.firstName, lastName: u.lastName, middleName: u.middleName || null, grade: u.grade, schoolId: u.schoolId, enrollmentStatus: "ACTIVE" },
      });
    }
    if (toDeactivate.length > 0) {
      await tx.student.updateMany({ where: { id: { in: toDeactivate.map((s) => s.id) } }, data: { enrollmentStatus: "INACTIVE" } });
    }

    return tx.importRun.create({
      data: {
        districtId, source: input.filename, operator, checksum, status: "committed",
        createdCount: toCreate.length, updatedCount: toUpdate.length, inactiveCount: deactivateCount, skippedCount: skipped, failedCount: 0,
        confirmationJson,
      },
    });
  });

  return {
    status: "committed",
    ignoredColumns,
    counts: { created: toCreate.length, updated: toUpdate.length, inactive: deactivateCount, skipped, failed: 0 },
    importRunId: run.id,
    confirmed: overThreshold,
  };
}
