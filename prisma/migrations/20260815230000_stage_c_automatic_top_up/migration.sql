-- Stage C item 10: guardian automatic top-up rules.
-- Credits still pass through PaymentIntent/webhook settlement; these tables
-- store the guardian's rule and each idempotent trigger attempt.

ALTER TYPE "NotificationType" ADD VALUE 'AUTO_TOP_UP_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTO_TOP_UP_SKIPPED';

CREATE TYPE "AutomaticTopUpRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED_CEILING', 'FAILED');

CREATE TABLE "AutomaticTopUpRule" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "triggerBalanceCents" INTEGER NOT NULL,
    "topUpAmountCents" INTEGER NOT NULL,
    "monthlyCeilingCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomaticTopUpRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutomaticTopUpRule_amounts_check" CHECK (
      "triggerBalanceCents" >= 0
      AND "topUpAmountCents" > 0
      AND "monthlyCeilingCents" > 0
      AND "monthlyCeilingCents" >= "topUpAmountCents"
    ),
    CONSTRAINT "AutomaticTopUpRule_cancel_check" CHECK (
      ("active" = true AND "cancelledAt" IS NULL)
      OR ("active" = false)
    )
);

CREATE TABLE "AutomaticTopUpRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggeringLedgerEntryId" TEXT,
    "depositLedgerEntryId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AutomaticTopUpRunStatus" NOT NULL DEFAULT 'PENDING',
    "balanceAfterCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "ceilingCents" INTEGER NOT NULL,
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AutomaticTopUpRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutomaticTopUpRun_amounts_check" CHECK (
      "amountCents" > 0 AND "ceilingCents" > 0
    )
);

ALTER TABLE "PaymentIntent" ADD COLUMN "automaticTopUpRunId" TEXT;

CREATE UNIQUE INDEX "AutomaticTopUpRule_one_active_per_guardian_student"
  ON "AutomaticTopUpRule"("guardianId", "studentId")
  WHERE "active" = true;

CREATE UNIQUE INDEX "AutomaticTopUpRun_idempotencyKey_key" ON "AutomaticTopUpRun"("idempotencyKey");
CREATE UNIQUE INDEX "AutomaticTopUpRun_rule_trigger_key"
  ON "AutomaticTopUpRun"("ruleId", "triggeringLedgerEntryId")
  WHERE "triggeringLedgerEntryId" IS NOT NULL;
CREATE UNIQUE INDEX "PaymentIntent_automaticTopUpRunId_key" ON "PaymentIntent"("automaticTopUpRunId");

CREATE INDEX "AutomaticTopUpRule_guardianId_idx" ON "AutomaticTopUpRule"("guardianId");
CREATE INDEX "AutomaticTopUpRule_studentId_idx" ON "AutomaticTopUpRule"("studentId");
CREATE INDEX "AutomaticTopUpRule_guardianId_studentId_active_idx" ON "AutomaticTopUpRule"("guardianId", "studentId", "active");
CREATE INDEX "AutomaticTopUpRun_ruleId_idx" ON "AutomaticTopUpRun"("ruleId");
CREATE INDEX "AutomaticTopUpRun_triggeringLedgerEntryId_idx" ON "AutomaticTopUpRun"("triggeringLedgerEntryId");
CREATE INDEX "AutomaticTopUpRun_status_idx" ON "AutomaticTopUpRun"("status");

ALTER TABLE "AutomaticTopUpRule"
  ADD CONSTRAINT "AutomaticTopUpRule_guardianId_fkey"
  FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomaticTopUpRule"
  ADD CONSTRAINT "AutomaticTopUpRule_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomaticTopUpRun"
  ADD CONSTRAINT "AutomaticTopUpRun_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "AutomaticTopUpRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomaticTopUpRun"
  ADD CONSTRAINT "AutomaticTopUpRun_triggeringLedgerEntryId_fkey"
  FOREIGN KEY ("triggeringLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomaticTopUpRun"
  ADD CONSTRAINT "AutomaticTopUpRun_depositLedgerEntryId_fkey"
  FOREIGN KEY ("depositLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_automaticTopUpRunId_fkey"
  FOREIGN KEY ("automaticTopUpRunId") REFERENCES "AutomaticTopUpRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
