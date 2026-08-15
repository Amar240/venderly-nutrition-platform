import { PrismaClient } from "@prisma/client";
import { describe, it, expect, afterAll } from "vitest";
import { runImport, MASS_DEACTIVATION_THRESHOLD } from "./importStudents";
import { AuthError } from "@/server/auth/errors";
import type { AppSession } from "@/server/auth/types";

/**
 * Phase 6 — Infinite Campus import. Column-drop proof, full validation gate,
 * strict all-or-nothing, upsert + deactivate-missing, idempotency, and the
 * mass-deactivation safety control.
 */
const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[import.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.importRun.deleteMany({ where: { districtId: id } });
    await prisma.account.deleteMany({ where: { student: { districtId: id } } });
    await prisma.student.deleteMany({ where: { districtId: id } });
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

const HEADERS = "student.studentNumber,student.firstName,student.lastName,student.middleName,function.SchoolCode,student.grade,student.birthdate,student.raceEthnicityFed,student.gender";
function cell(v: string) { return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
interface Row { num: string; first: string; last: string; middle?: string; code: string; grade: string; birthdate?: string; race?: string; gender?: string }
function csv(rows: Row[], headerLine = HEADERS): string {
  const lines = [headerLine];
  for (const r of rows) {
    lines.push([r.num, r.first, r.last, r.middle ?? "", r.code, r.grade, r.birthdate ?? "2010-01-01", r.race ?? "SYNTH-RACE", r.gender ?? "SYNTH-GENDER"].map(cell).join(","));
  }
  return lines.join("\r\n");
}

interface Fixture { districtId: string; wes: string; rms: string; superAdmin: AppSession; nonSuper: AppSession; rows: Row[] }

async function fresh(): Promise<Fixture> {
  const district = await prisma.district.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  districtIds.push(district.id);
  await prisma.school.create({ data: { districtId: district.id, name: "Woodbridge Elementary", code: "WES" } });
  await prisma.school.create({ data: { districtId: district.id, name: "Riverside Middle", code: "RMS" } });
  const wes = "WES", rms = "RMS";

  // 12 existing active students so a single missing row is under the 10% guard.
  const rows: Row[] = [];
  for (let i = 1; i <= 12; i++) {
    const code = i <= 8 ? wes : rms;
    const grade = i <= 8 ? "3" : "6";
    const r: Row = { num: `10${String(i).padStart(2, "0")}`, first: `First${i}`, last: `Last${i}`, code, grade };
    rows.push(r);
    await prisma.student.create({
      data: { districtId: district.id, schoolId: (await prisma.school.findFirstOrThrow({ where: { districtId: district.id, code } })).id, studentNumber: r.num, firstName: r.first, lastName: r.last, grade: r.grade, enrollmentStatus: "ACTIVE" },
    });
  }
  return {
    districtId: district.id, wes, rms, rows,
    superAdmin: { principalType: "staff", userId: `super-${crypto.randomUUID()}`, role: "SUPER_ADMIN", districtId: district.id, schoolIds: [] },
    nonSuper: { principalType: "staff", userId: "x", role: "DISTRICT_ADMIN", districtId: district.id, schoolIds: [] },
  };
}

describe.skipIf(!dbUp)("dropped-columns policy (the closing argument)", () => {
  it("birthdate / race / gender never reach the DB, the ImportRun, or the result", async () => {
    const f = await fresh();
    const SENTINELS = ["2009-09-09", "SENTINEL_RACE_XYZ", "SENTINEL_GENDER_XYZ"];
    // A file whose dropped columns are populated with distinct sentinels.
    const rows = f.rows.map((r) => ({ ...r, birthdate: SENTINELS[0], race: SENTINELS[1], gender: SENTINELS[2] }));
    const result = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(rows) });
    expect(result.status).toBe("committed");
    if (result.status === "committed") expect(result.ignoredColumns).toBe(3);

    // Nowhere in the students table.
    const students = await prisma.student.findMany({ where: { districtId: f.districtId } });
    const studentsBlob = JSON.stringify(students);
    // In the ImportRun record.
    const runs = await prisma.importRun.findMany({ where: { districtId: f.districtId } });
    const runsBlob = JSON.stringify(runs);
    // In the returned result.
    const resultBlob = JSON.stringify(result);

    for (const s of SENTINELS) {
      expect(studentsBlob).not.toContain(s);
      expect(runsBlob).not.toContain(s);
      expect(resultBlob).not.toContain(s);
    }
    // And the students table has no such columns at all.
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      "SELECT column_name FROM information_schema.columns WHERE table_name='Student'",
    );
    const names = cols.map((c) => c.column_name.toLowerCase());
    expect(names).not.toContain("birthdate");
    expect(names).not.toContain("raceethnicityfed");
    expect(names).not.toContain("gender");
  });
});

describe.skipIf(!dbUp)("upsert + idempotency", () => {
  it("clean import of the current roster is a no-op (all skipped)", async () => {
    const f = await fresh();
    const first = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(f.rows) });
    expect(first.status).toBe("committed");
    if (first.status === "committed") expect(first.counts.skipped).toBe(12);

    const again = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(f.rows) });
    if (again.status === "committed") {
      expect(again.counts).toMatchObject({ created: 0, updated: 0, inactive: 0, skipped: 12 });
    }
  });

  it("creates new, updates changed, and moves a student's school", async () => {
    const f = await fresh();
    const rows = f.rows.map((r) => ({ ...r }));
    rows[0]!.grade = "4"; // update
    rows[8]!.code = f.wes; // was RMS → move to WES (schoolId change)
    rows.push({ num: "9999", first: "New", last: "Kid", code: f.wes, grade: "3" }); // create
    const result = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(rows) });
    expect(result.status).toBe("committed");
    if (result.status === "committed") {
      expect(result.counts.created).toBe(1);
      expect(result.counts.updated).toBe(2);
    }
    const moved = await prisma.student.findFirstOrThrow({ where: { districtId: f.districtId, studentNumber: "1009" }, include: { school: true } });
    expect(moved.school.code).toBe("WES");
  });
});

describe.skipIf(!dbUp)("validation gate — strict all-or-nothing", () => {
  async function expectRejected(f: Fixture, content: string, filename = "roster.csv") {
    const before = await prisma.student.count({ where: { districtId: f.districtId } });
    const result = await runImport(f.superAdmin, { filename, content });
    expect(result.status).toBe("rejected");
    expect(await prisma.student.count({ where: { districtId: f.districtId } })).toBe(before); // nothing written
    return result;
  }

  it("missing required header", async () => {
    const f = await fresh();
    const header = HEADERS.replace(",student.grade", ""); // drop a required header
    await expectRejected(f, csv(f.rows, header));
  });
  it("unknown school code", async () => {
    const f = await fresh();
    const rows = f.rows.map((r, i) => (i === 0 ? { ...r, code: "ZZZ" } : r));
    const r = await expectRejected(f, csv(rows));
    if (r.status === "rejected") expect(r.errors.some((e) => e.message.includes("ZZZ"))).toBe(true);
  });
  it("duplicate student number within the file", async () => {
    const f = await fresh();
    const rows = [...f.rows, { ...f.rows[0]! }];
    const r = await expectRejected(f, csv(rows));
    if (r.status === "rejected") expect(r.errors.some((e) => e.message.toLowerCase().includes("duplicate"))).toBe(true);
  });
  it("malformed row (missing required value)", async () => {
    const f = await fresh();
    const rows = f.rows.map((r, i) => (i === 2 ? { ...r, first: "" } : r));
    await expectRejected(f, csv(rows));
  });
  it("empty file", async () => {
    const f = await fresh();
    await expectRejected(f, "");
  });
  it("wrong file type", async () => {
    const f = await fresh();
    await expectRejected(f, csv(f.rows), "roster.txt");
  });
  it("oversized file", async () => {
    const f = await fresh();
    const big = HEADERS + "\r\n" + Array.from({ length: 4000 }, (_, i) => `Z${i},A,B,,WES,3,2010-01-01,r,g`).join("\r\n");
    expect(Buffer.byteLength(big)).toBeGreaterThan(100 * 1024);
    await expectRejected(f, big);
  });

  it("rolls back roster writes if the committed ImportRun insert fails", async () => {
    const f = await fresh();
    const source = "rollback-trigger.csv";
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_import_run_for_rollback_test()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.source = '${source}' THEN
          RAISE EXCEPTION 'forced ImportRun failure for rollback test';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS import_run_rollback_test_trigger ON "ImportRun";');
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER import_run_rollback_test_trigger
      BEFORE INSERT ON "ImportRun"
      FOR EACH ROW EXECUTE FUNCTION fail_import_run_for_rollback_test();
    `);

    try {
      const beforeStudents = await prisma.student.findMany({
        where: { districtId: f.districtId },
        select: { studentNumber: true, firstName: true, lastName: true, grade: true, schoolId: true, enrollmentStatus: true },
        orderBy: { studentNumber: "asc" },
      });
      const beforeAccounts = await prisma.account.count({ where: { student: { districtId: f.districtId } } });
      const beforeRuns = await prisma.importRun.count({ where: { districtId: f.districtId } });

      const rows = f.rows.slice(0, 11).map((r) => ({ ...r }));
      rows[0]!.first = "Changed";
      rows.push({ num: "9999", first: "New", last: "Rollback", code: f.wes, grade: "3" });

      await expect(runImport(f.superAdmin, { filename: source, content: csv(rows) })).rejects.toThrow(/forced ImportRun failure/);

      const afterStudents = await prisma.student.findMany({
        where: { districtId: f.districtId },
        select: { studentNumber: true, firstName: true, lastName: true, grade: true, schoolId: true, enrollmentStatus: true },
        orderBy: { studentNumber: "asc" },
      });
      expect(afterStudents).toEqual(beforeStudents);
      expect(await prisma.account.count({ where: { student: { districtId: f.districtId } } })).toBe(beforeAccounts);
      expect(await prisma.importRun.count({ where: { districtId: f.districtId } })).toBe(beforeRuns);
      expect(await prisma.student.findFirst({ where: { districtId: f.districtId, studentNumber: "9999" } })).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS import_run_rollback_test_trigger ON "ImportRun";');
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_import_run_for_rollback_test();");
    }
  });
});

describe.skipIf(!dbUp)("mass-deactivation safety control", () => {
  it("deactivating ≤10% proceeds without confirmation", async () => {
    const f = await fresh();
    const rows = f.rows.slice(0, 11); // drop 1 of 12 = 8.3% < 10%
    const result = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(rows) });
    expect(result.status).toBe("committed");
    if (result.status === "committed") expect(result.counts.inactive).toBe(1);
    const dropped = await prisma.student.findFirstOrThrow({ where: { districtId: f.districtId, studentNumber: "1012" } });
    expect(dropped.enrollmentStatus).toBe("INACTIVE"); // deactivated, NOT deleted
  });

  it("deactivating >10% requires confirmation and writes nothing until confirmed", async () => {
    const f = await fresh();
    const rows = f.rows.slice(0, 10); // drop 2 of 12 = 16.7% > 10%
    const blocked = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(rows) });
    expect(blocked.status).toBe("needs_confirmation");
    if (blocked.status === "needs_confirmation") {
      expect(blocked.deactivateCount).toBe(2);
      expect(blocked.sharePct).toBeGreaterThan(MASS_DEACTIVATION_THRESHOLD * 100);
    }
    // Nothing written, no ImportRun for the blocked attempt.
    expect(await prisma.student.count({ where: { districtId: f.districtId, enrollmentStatus: "INACTIVE" } })).toBe(0);
    expect(await prisma.importRun.count({ where: { districtId: f.districtId } })).toBe(0);

    const confirmed = await runImport(f.superAdmin, { filename: "roster.csv", content: csv(rows), confirmDeactivation: true });
    expect(confirmed.status).toBe("committed");
    const run = await prisma.importRun.findFirstOrThrow({ where: { districtId: f.districtId, status: "committed" } });
    expect(run.inactiveCount).toBe(2);
    expect(run.confirmationJson).toMatchObject({ deactivateCount: 2 });
  });
});

describe.skipIf(!dbUp)("ImportRun record + RBAC", () => {
  it("records source, operator, checksum, and counts", async () => {
    const f = await fresh();
    await runImport(f.superAdmin, { filename: "campus-export.csv", content: csv(f.rows) });
    const run = await prisma.importRun.findFirstOrThrow({ where: { districtId: f.districtId } });
    expect(run.source).toBe("campus-export.csv");
    expect(run.operator).toBeTruthy();
    expect(run.checksum).toHaveLength(64); // sha-256 hex
    expect(run.status).toBe("committed");
  });

  it("is super-admin only", async () => {
    const f = await fresh();
    await expect(runImport(f.nonSuper, { filename: "roster.csv", content: csv(f.rows) })).rejects.toBeInstanceOf(AuthError);
  });
});
