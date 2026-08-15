import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  auditActorLabel,
  auditSubjectLabel,
  deliveryStatusLabel,
  moneyActivityLabel,
  notificationTypeLabel,
  staffRoleLabel,
} from "./presentation-labels";

describe("presentation labels", () => {
  it("maps internal values to plain user-facing labels", () => {
    expect(moneyActivityLabel("ADJUSTMENT")).toBe("Mistake fixed");
    expect(moneyActivityLabel("TRANSFER_DEBIT")).toBe("Money moved out");
    expect(staffRoleLabel("SUPER_ADMIN")).toBe("System administrator");
    expect(auditActionLabel("LEDGER_REALLOCATION")).toBe("Moved money");
    expect(auditActionLabel("STUDENT_CLASSROOM_REASSIGNED")).toBe("Moved a student to another class");
    expect(auditActorLabel("USER")).toBe("Staff");
    expect(auditSubjectLabel("import")).toBe("Student list");
    expect(auditSubjectLabel("classroom")).toBe("Class");
    expect(notificationTypeLabel("LOW_BALANCE")).toBe("Money running low");
    expect(deliveryStatusLabel("PENDING")).toBe("Sending");
  });

  it("uses safe fallbacks instead of rendering raw values", () => {
    expect(moneyActivityLabel("RAW_ENUM")).toBe("Money activity");
    expect(staffRoleLabel("RAW_ROLE")).toBe("Staff");
    expect(auditActionLabel("RAW_ACTION")).toBe("Staff activity");
    expect(auditActorLabel("RAW_ACTOR")).toBe("Actor");
    expect(auditSubjectLabel("raw_subject")).toBe("Subject");
    expect(notificationTypeLabel("RAW_NOTIFICATION")).toBe("Household update");
    expect(deliveryStatusLabel("RAW_STATUS")).toBe("Recorded");
  });
});
