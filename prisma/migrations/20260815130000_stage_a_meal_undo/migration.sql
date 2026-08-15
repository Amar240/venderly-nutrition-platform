-- Stage A item 3: retain meal events when a cashier undoes an entry while
-- excluding the reversed row from live uniqueness and reimbursable counts.
ALTER TABLE "MealEvent"
  ADD COLUMN "schoolId" TEXT,
  ADD COLUMN "recordedByUserId" TEXT,
  ADD COLUMN "recordingBatchId" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedByUserId" TEXT;

-- Existing events predate serving-site provenance. The student's current
-- school is the best available backfill; these legacy rows remain ineligible
-- for cashier undo because they have no cashier or batch id.
UPDATE "MealEvent" AS meal
SET "schoolId" = student."schoolId"
FROM "Student" AS student
WHERE meal."studentId" = student."id";

ALTER TABLE "MealEvent" ALTER COLUMN "schoolId" SET NOT NULL;

DROP INDEX "MealEvent_studentId_serviceDate_mealType_overrideSeq_key";
CREATE UNIQUE INDEX "MealEvent_live_student_service_meal_override_key"
  ON "MealEvent"("studentId", "serviceDate", "mealType", "overrideSeq")
  WHERE "reversedAt" IS NULL;

CREATE INDEX "MealEvent_studentId_serviceDate_mealType_overrideSeq_idx"
  ON "MealEvent"("studentId", "serviceDate", "mealType", "overrideSeq");
CREATE INDEX "MealEvent_schoolId_serviceDate_mealType_idx"
  ON "MealEvent"("schoolId", "serviceDate", "mealType");
CREATE INDEX "MealEvent_recordedByUserId_schoolId_createdAt_idx"
  ON "MealEvent"("recordedByUserId", "schoolId", "createdAt");
CREATE INDEX "MealEvent_recordingBatchId_idx" ON "MealEvent"("recordingBatchId");

ALTER TABLE "MealEvent"
  ADD CONSTRAINT "MealEvent_reversal_pair_check"
    CHECK (("reversedAt" IS NULL) = ("reversedByUserId" IS NULL)),
  ADD CONSTRAINT "MealEvent_cashier_reversal_normal_only_check"
    CHECK ("reversedAt" IS NULL OR "overrideSeq" = 0),
  ADD CONSTRAINT "MealEvent_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MealEvent_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MealEvent_reversedByUserId_fkey"
    FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
