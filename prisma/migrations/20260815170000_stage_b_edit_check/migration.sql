-- Stage B item 6: district-owned edit-check input. Woodbridge's seed uses the
-- 93.8% FNS federal default because no Delaware-specific published percentage
-- was found. This nullable field never silently falls back at read time.
ALTER TABLE "District"
  ADD COLUMN "stateAttendanceFactorBps" INTEGER;

ALTER TABLE "District"
  ADD CONSTRAINT "District_stateAttendanceFactorBps_check"
  CHECK (
    "stateAttendanceFactorBps" IS NULL
    OR (
      "stateAttendanceFactorBps" >= 0
      AND "stateAttendanceFactorBps" <= 10000
    )
  );
