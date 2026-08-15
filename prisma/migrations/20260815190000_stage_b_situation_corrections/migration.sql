CREATE TYPE "CorrectionSituation" AS ENUM (
  'CHARGED_TWICE',
  'WRONG_STUDENT',
  'SNACK_RETURNED',
  'SOMETHING_ELSE',
  'DISTRICT_DECISION'
);

CREATE TYPE "CorrectionCaseStatus" AS ENUM (
  'PENDING',
  'FOLLOW_UP_REQUIRED',
  'COMPLETED'
);

CREATE TABLE "CorrectionCase" (
  "id" TEXT NOT NULL,
  "situation" "CorrectionSituation" NOT NULL,
  "status" "CorrectionCaseStatus" NOT NULL DEFAULT 'PENDING',
  "studentId" TEXT NOT NULL,
  "originalEntryId" TEXT,
  "targetStudentId" TEXT,
  "reason" TEXT NOT NULL,
  "actorId" TEXT,
  "refundEntryId" TEXT,
  "chargeEntryId" TEXT,
  "adjustmentEntryId" TEXT,
  "expectedAmountCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,

  CONSTRAINT "CorrectionCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CorrectionCase_originalEntryId_key" ON "CorrectionCase"("originalEntryId");
CREATE UNIQUE INDEX "CorrectionCase_refundEntryId_key" ON "CorrectionCase"("refundEntryId");
CREATE UNIQUE INDEX "CorrectionCase_chargeEntryId_key" ON "CorrectionCase"("chargeEntryId");
CREATE UNIQUE INDEX "CorrectionCase_adjustmentEntryId_key" ON "CorrectionCase"("adjustmentEntryId");
CREATE INDEX "CorrectionCase_studentId_idx" ON "CorrectionCase"("studentId");
CREATE INDEX "CorrectionCase_targetStudentId_idx" ON "CorrectionCase"("targetStudentId");
CREATE INDEX "CorrectionCase_status_idx" ON "CorrectionCase"("status");

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_targetStudentId_fkey"
  FOREIGN KEY ("targetStudentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_originalEntryId_fkey"
  FOREIGN KEY ("originalEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_refundEntryId_fkey"
  FOREIGN KEY ("refundEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_chargeEntryId_fkey"
  FOREIGN KEY ("chargeEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrectionCase"
  ADD CONSTRAINT "CorrectionCase_adjustmentEntryId_fkey"
  FOREIGN KEY ("adjustmentEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
