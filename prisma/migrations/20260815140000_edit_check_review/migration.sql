-- Stage D item 5: minimal review-tracking for edit-check exceptions, feeding
-- the "who reviewed them and when" line on the claim pack.
CREATE TABLE "EditCheckReview" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "EditCheckReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditCheckReview_schoolId_serviceDate_mealType_key"
  ON "EditCheckReview"("schoolId", "serviceDate", "mealType");

ALTER TABLE "EditCheckReview"
  ADD CONSTRAINT "EditCheckReview_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EditCheckReview_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
