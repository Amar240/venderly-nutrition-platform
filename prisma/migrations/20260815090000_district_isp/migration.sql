ALTER TABLE "District" ADD COLUMN "identifiedStudentPercentageBps" INTEGER;

ALTER TABLE "District"
  ADD CONSTRAINT "District_identifiedStudentPercentageBps_check"
  CHECK (
    "identifiedStudentPercentageBps" IS NULL
    OR (
      "identifiedStudentPercentageBps" >= 0
      AND "identifiedStudentPercentageBps" <= 10000
    )
  );
