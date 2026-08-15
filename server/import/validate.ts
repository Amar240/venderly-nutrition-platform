import { REQUIRED_HEADERS, HEADER, type ParsedRow } from "./parse";

/**
 * Import validation. Error messages reference only KEPT fields (student number,
 * names, grade, school code) — never a dropped column, which the parser never
 * read in the first place.
 */
export const MAX_IMPORT_BYTES = 100 * 1024; // pilot cap; a synthetic roster is ~15 KB

export interface ImportError {
  row?: number; // 1-based data row; absent for file-level errors
  field?: string;
  message: string;
  studentNumber?: string;
}

export function validateFileGate(input: {
  filename: string;
  byteLength: number;
  headers: string[];
  rowCount: number;
}): ImportError[] {
  const errors: ImportError[] = [];
  if (!input.filename.toLowerCase().endsWith(".csv")) {
    errors.push({ message: "File must be a .csv export." });
  }
  if (input.byteLength > MAX_IMPORT_BYTES) {
    errors.push({ message: `File is ${Math.round(input.byteLength / 1024)} KB; the limit is ${MAX_IMPORT_BYTES / 1024} KB.` });
  }
  for (const h of REQUIRED_HEADERS) {
    if (!input.headers.includes(h)) errors.push({ message: `Missing required header: ${h}` });
  }
  if (input.rowCount === 0) {
    errors.push({ message: "The file has no data rows." });
  }
  return errors;
}

export function validateRows(rows: ParsedRow[], knownSchoolCodes: Set<string>): ImportError[] {
  const errors: ImportError[] = [];
  const firstSeenAt = new Map<string, number>();

  for (const row of rows) {
    const req: [string, string, string][] = [
      [row.studentNumber, HEADER.studentNumber, "student number"],
      [row.firstName, HEADER.firstName, "first name"],
      [row.lastName, HEADER.lastName, "last name"],
      [row.grade, HEADER.grade, "grade"],
      [row.schoolCode, HEADER.schoolCode, "school code"],
    ];
    for (const [value, field, label] of req) {
      if (!value) errors.push({ row: row.rowNumber, field, message: `Missing ${label}.`, studentNumber: row.studentNumber || undefined });
    }
    if (row.schoolCode && !knownSchoolCodes.has(row.schoolCode)) {
      errors.push({ row: row.rowNumber, field: HEADER.schoolCode, message: `Unknown school code: ${row.schoolCode}.`, studentNumber: row.studentNumber || undefined });
    }
    if (row.studentNumber) {
      const prev = firstSeenAt.get(row.studentNumber);
      if (prev !== undefined) {
        errors.push({ row: row.rowNumber, field: HEADER.studentNumber, message: `Duplicate student number ${row.studentNumber} (first seen at row ${prev}).`, studentNumber: row.studentNumber });
      } else {
        firstSeenAt.set(row.studentNumber, row.rowNumber);
      }
    }
  }
  return errors;
}
