/**
 * Infinite Campus CSV parsing. The district's real export has exactly these
 * headers. The three POLICY-DROPPED columns are recognized by header so we can
 * report how many were ignored, but their VALUES are never copied into a parsed
 * row — they cannot reach the database, a log, an error, or the report.
 */

export const HEADER = {
  studentNumber: "student.studentNumber",
  firstName: "student.firstName",
  lastName: "student.lastName",
  middleName: "student.middleName",
  schoolCode: "function.SchoolCode",
  grade: "student.grade",
} as const;

/** Columns dropped at parse time — values NEVER read (rule 9). */
export const DROPPED_HEADERS = [
  "student.birthdate",
  "student.raceEthnicityFed",
  "student.gender",
] as const;

/** Headers that must be present for the file to be processable. */
export const REQUIRED_HEADERS = [
  HEADER.studentNumber,
  HEADER.firstName,
  HEADER.lastName,
  HEADER.schoolCode,
  HEADER.grade,
] as const;

export interface ParsedRow {
  rowNumber: number; // 1-based data row (excludes the header line)
  studentNumber: string;
  firstName: string;
  lastName: string;
  middleName: string;
  schoolCode: string;
  grade: string;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  /** How many of the three policy-dropped columns were present in the header. */
  ignoredByPolicyCount: number;
}

/** RFC-4180-ish CSV tokenizer: quoted fields, embedded commas/newlines, "" escapes. */
export function parseCsvCells(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // strip UTF-8 BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  // Flush trailing field/row unless the input ended exactly on a newline.
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  return rows;
}

/**
 * Parse into typed rows. The dropped columns are located by header but their
 * cell values are deliberately never referenced.
 */
export function parseImportCsv(content: string): ParseResult {
  const cells = parseCsvCells(content);
  if (cells.length === 0) return { headers: [], rows: [], ignoredByPolicyCount: 0 };

  const headers = (cells[0] ?? []).map((h) => h.trim());
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const ignoredByPolicyCount = DROPPED_HEADERS.filter((h) => h in idx).length;

  const at = (cols: string[], header: string): string => {
    const i = idx[header];
    return i === undefined ? "" : (cols[i] ?? "").trim();
  };

  const rows: ParsedRow[] = [];
  for (let r = 1; r < cells.length; r++) {
    const cols = cells[r] ?? [];
    // Only the KEPT columns are ever read. Dropped columns are not touched.
    rows.push({
      rowNumber: r,
      studentNumber: at(cols, HEADER.studentNumber),
      firstName: at(cols, HEADER.firstName),
      lastName: at(cols, HEADER.lastName),
      middleName: at(cols, HEADER.middleName),
      schoolCode: at(cols, HEADER.schoolCode),
      grade: at(cols, HEADER.grade),
    });
  }
  return { headers, rows, ignoredByPolicyCount };
}
