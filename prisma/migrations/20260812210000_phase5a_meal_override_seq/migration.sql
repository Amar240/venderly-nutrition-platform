-- Duplicate-meal override (rule 6). overrideSeq = 0 is the normal POS serving
-- (the duplicate guard is unchanged); only an admin override creates seq > 0,
-- with an overrideReason + AuditLog. The unique key now includes overrideSeq so
-- an override is a real, distinct, audited MealEvent.
ALTER TABLE "MealEvent" ADD COLUMN "overrideSeq" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "MealEvent_studentId_serviceDate_mealType_key";

CREATE UNIQUE INDEX "MealEvent_studentId_serviceDate_mealType_overrideSeq_key"
  ON "MealEvent"("studentId", "serviceDate", "mealType", "overrideSeq");
