import { prisma } from "@/server/db/client";
import type { ActorType, Prisma } from "@prisma/client";

/**
 * Append an audit record. Sensitive actions (logins, adjustments, transfers,
 * overrides, exports, imports, config changes) MUST be audited (CLAUDE.md
 * rule 8). Writes never throw into the caller's happy path — a failed audit
 * write is logged, not surfaced to the user.
 */
export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  districtId?: string | null;
  schoolId?: string | null;
  reason?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        districtId: input.districtId ?? null,
        schoolId: input.schoolId ?? null,
        reason: input.reason ?? null,
        beforeJson: input.before ?? undefined,
        afterJson: input.after ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", input.action, err);
  }
}
