ALTER TABLE "District"
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/New_York';

ALTER TABLE "School"
  ADD COLUMN "breakfastServiceEndMinutes" INTEGER,
  ADD COLUMN "lunchServiceEndMinutes" INTEGER;

ALTER TABLE "PricingConfig"
  ADD COLUMN "lowBalanceMealsThreshold" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "School"
  ADD CONSTRAINT "School_breakfastServiceEndMinutes_check"
  CHECK ("breakfastServiceEndMinutes" IS NULL OR ("breakfastServiceEndMinutes" >= 0 AND "breakfastServiceEndMinutes" <= 1439));

ALTER TABLE "School"
  ADD CONSTRAINT "School_lunchServiceEndMinutes_check"
  CHECK ("lunchServiceEndMinutes" IS NULL OR ("lunchServiceEndMinutes" >= 0 AND "lunchServiceEndMinutes" <= 1439));

ALTER TABLE "PricingConfig"
  ADD CONSTRAINT "PricingConfig_lowBalanceMealsThreshold_check"
  CHECK ("lowBalanceMealsThreshold" >= 0);
