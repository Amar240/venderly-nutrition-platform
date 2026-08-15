-- Stage C item 9: district-authored unpaid meal charge policy.
-- Plain text only. Woodbridge seed leaves this null until the district supplies
-- its own written wording; the application must not invent legal policy text.
ALTER TABLE "District"
  ADD COLUMN "unpaidMealChargePolicyText" TEXT;

ALTER TABLE "District"
  ADD CONSTRAINT "District_unpaidMealChargePolicyText_length_check"
  CHECK (
    "unpaidMealChargePolicyText" IS NULL
    OR char_length("unpaidMealChargePolicyText") <= 10000
  );
