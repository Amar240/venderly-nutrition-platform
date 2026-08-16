-- Stage C item 11: meal-price configuration is now versioned by service date.
-- Existing single-row configs become the first effective version for their
-- district/school scope; new changes create superseding rows rather than
-- overwriting earlier configuration.

CREATE TYPE "AttendanceFactorProvenance" AS ENUM ('FNS_FEDERAL_DEFAULT', 'APPROVED_LOCAL');

ALTER TABLE "District"
  ADD COLUMN "stateAttendanceFactorProvenance" "AttendanceFactorProvenance" NOT NULL DEFAULT 'FNS_FEDERAL_DEFAULT';

ALTER TABLE "PricingConfig"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT;

ALTER TABLE "PricingConfig"
  ALTER COLUMN "effectiveFrom" TYPE DATE USING "effectiveFrom"::date;

DROP INDEX IF EXISTS "PricingConfig_districtId_schoolId_key";

CREATE INDEX "PricingConfig_districtId_schoolId_effectiveFrom_createdAt_idx"
  ON "PricingConfig"("districtId", "schoolId", "effectiveFrom", "createdAt");

CREATE INDEX "PricingConfig_districtId_schoolId_cancelledAt_effectiveFrom_idx"
  ON "PricingConfig"("districtId", "schoolId", "cancelledAt", "effectiveFrom");

ALTER TABLE "PricingConfig"
  ADD CONSTRAINT "PricingConfig_nonnegative_amounts_check"
  CHECK (
    "breakfastFreeCents" >= 0
    AND "breakfastReducedCents" >= 0
    AND "breakfastPaidCents" >= 0
    AND "lunchFreeCents" >= 0
    AND "lunchReducedCents" >= 0
    AND "lunchPaidCents" >= 0
    AND "lowBalanceThresholdCents" >= 0
    AND "lowBalanceMealsThreshold" >= 0
  );

ALTER TABLE "PricingConfig"
  ADD CONSTRAINT "PricingConfig_cancellation_pair_check"
  CHECK (
    ("cancelledAt" IS NULL AND "cancelledByUserId" IS NULL)
    OR ("cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL)
  );

ALTER TABLE "PricingConfig"
  ADD CONSTRAINT "PricingConfig_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PricingConfig"
  ADD CONSTRAINT "PricingConfig_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
