/**
 * Generates the phase-6 import fixtures from the seeded roster, so `clean.csv`
 * is the FULL current roster (a clean import is a genuine no-op) and the broken
 * files are minimal variants of it. Run: `npx tsx fixtures/generate.ts`.
 *
 * The three policy-dropped columns are populated with SYNTHETIC values — the
 * importer drops them at parse; they never reach the database. Synthetic data
 * only (CLAUDE.md).
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();
const DIR = join(process.cwd(), "fixtures");
const HEADERS = "student.studentNumber,student.firstName,student.lastName,student.middleName,function.SchoolCode,student.grade,student.birthdate,student.raceEthnicityFed,student.gender";

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

interface Row {
  num: string; first: string; last: string; middle: string; code: string; grade: string;
  birthdate: string; race: string; gender: string;
}

function line(r: Row): string {
  return [r.num, r.first, r.last, r.middle, r.code, r.grade, r.birthdate, r.race, r.gender].map(cell).join(",");
}
function file(rows: Row[], headerLine = HEADERS): string {
  return [headerLine, ...rows.map(line)].join("\n") + "\n";
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const students = await prisma.student.findMany({
    where: { enrollmentStatus: "ACTIVE" },
    include: { school: { select: { code: true } } },
    orderBy: { studentNumber: "asc" },
  });

  // Synthetic values for the dropped columns (dropped at parse, never stored).
  const rows: Row[] = students.map((s, i) => ({
    num: s.studentNumber,
    first: s.firstName,
    last: s.lastName,
    middle: s.middleName ?? "",
    code: s.school.code,
    grade: s.grade,
    birthdate: `20${String(10 + (i % 8)).padStart(2, "0")}-0${(i % 9) + 1}-1${i % 9}`,
    race: String((i % 7) + 1),
    gender: i % 2 === 0 ? "M" : "F",
  }));

  const write = (name: string, content: string) => {
    writeFileSync(join(DIR, name), content);
    console.log(`  ${name} (${Math.round(Buffer.byteLength(content) / 1024)} KB)`);
  };

  console.log(`Writing fixtures from ${rows.length} active students:`);
  write("clean.csv", file(rows));
  write("missing-header.csv", file(rows, HEADERS.replace(",student.grade", "")));
  write("unknown-school.csv", file(rows.map((r, i) => (i === 0 ? { ...r, code: "ZZZ" } : r))));
  write("duplicate-student.csv", file([...rows, { ...rows[0]! }]));
  write("malformed-row.csv", file(rows.map((r, i) => (i === 1 ? { ...r, first: "" } : r))));
  write("empty.csv", "");
  write("truncated.csv", file(rows.slice(0, Math.floor(rows.length * 0.75)))); // drops 25% → trips the guard

  // Oversized: repeat the roster until it exceeds the 100 KB cap.
  let big = rows;
  while (Buffer.byteLength(file(big)) < 110 * 1024) big = [...big, ...rows];
  write("oversized.csv", file(big));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
