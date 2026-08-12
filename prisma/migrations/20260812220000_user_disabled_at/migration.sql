-- Staff users are deactivated, never deleted (AuditLog.actorId references them).
-- Deactivated users fail authentication. Reversible.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
