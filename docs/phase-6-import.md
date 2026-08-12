# Phase 6 — Infinite Campus import simulation

## Goal
Prove the platform handles the district's real export file format safely.

## The real file (confirmed by district)
One CSV, exported from Infinite Campus (today it feeds PCS), with exactly these headers:

| Header | Treatment |
|---|---|
| student.studentNumber | required — match key |
| student.firstName | required |
| student.lastName | required |
| student.middleName | store, never display by default |
| function.SchoolCode | required — must match a known school |
| student.grade | required |
| student.birthdate | DROP at parse — never stored |
| student.raceEthnicityFed | DROP at parse — never stored |
| student.gender | DROP at parse — never stored |

## In scope
- Upload (super admin only) of a synthetic CSV in exactly this shape; sample files in `fixtures/` including a clean file, and files with: missing header, unknown school code, duplicate studentNumber, malformed row, empty file, oversized file.
- Validation BEFORE any write: file type, size cap, required headers present, row count, school codes exist, duplicate student numbers within file, malformed values. Errors presented as actionable rows; nothing committed if validation gate fails.
- Dropped-columns policy applied at parse time; the report states "3 columns ignored by policy" — values never reach the database or logs.
- Upsert by (district, studentNumber): create new, update changed, mark students missing from the file as inactive (never delete).
- Import report: created / updated / marked inactive / skipped / failed counts + per-row errors.
- ImportRun audit record: source filename, operator, timestamp, file checksum, result summary.

## Acceptance criteria (from PRD)
- System accepts an approved synthetic roster and produces a clear error/result summary.
- A re-run of the same file is a no-op (idempotent import).
- Excluded columns are verifiably absent from the database.

## Human verification
Import the clean fixture, then each broken fixture; re-import the clean file and confirm zero changes; query the students table and confirm no birthdate/race/gender columns or values anywhere.
