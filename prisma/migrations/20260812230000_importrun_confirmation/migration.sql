-- Log a mass-deactivation confirmation on the ImportRun (the safety control).
ALTER TABLE "ImportRun" ADD COLUMN "confirmationJson" JSONB;
