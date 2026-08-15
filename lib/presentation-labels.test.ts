import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  auditActorLabel,
  auditSubjectLabel,
  deliveryStatusLabel,
  formatMoneyHistoryEntry,
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

  it("formats provider payments as canonical sentences", () => {
    const item = formatMoneyHistoryEntry({
      id: "dep_1",
      type: "DEPOSIT",
      amountCents: 1000,
      description: "Payment (simulated checkout)",
      createdAt: new Date("2026-08-15T12:00:00Z"),
      actorType: "SYSTEM",
      paymentGuardianName: "Dana Whitfield",
      paymentProviderConfirmed: true,
    });
    expect(item.activity).toBe("Dana Whitfield added $10.00 online · confirmed by the payment provider.");
    expect(item.connection).toBeNull();
    expect(item.amountDirection).toBe("in");
  });

  it("formats linked fixes with a correction reference and verbatim reason", () => {
    const item = formatMoneyHistoryEntry({
      id: "refund_1",
      type: "REFUND",
      amountCents: 125,
      description: "Money given back: Snack was returned",
      createdAt: new Date("2026-08-15T13:00:00Z"),
      actorType: "USER",
      actorName: "Casey Nguyen",
      reason: "Snack was returned",
      corrects: {
        summary: "Cookie",
        createdAt: new Date("2026-08-15T12:04:00Z"),
        amountCents: -125,
      },
      timeZone: "America/New_York",
    });
    expect(item.activity).toBe('Casey Nguyen gave back $1.25 for Cookie. Reason: "Snack was returned"');
    expect(item.connection).toBe("Corrects: Cookie · Aug 15, 2026, 8:04 AM · -$1.25 — the original remains in history.");
    expect(item.reason).toBe("Snack was returned");
  });

  it("keeps district decisions standalone when no original entry is linked", () => {
    const item = formatMoneyHistoryEntry({
      id: "adjust_1",
      type: "ADJUSTMENT",
      amountCents: -250,
      description: "Mistake fixed: District decision to change snack money",
      createdAt: new Date("2026-08-15T12:00:00Z"),
      actorType: "USER",
      actorName: "Alex Admin",
    });
    expect(item.activity).toBe('Alex Admin took $2.50. Reason: "District decision to change snack money"');
    expect(item.connection).toBeNull();
    expect(item.correctedAbove).toBe(false);
  });

  it("marks originals corrected without using raw system vocabulary", () => {
    const item = formatMoneyHistoryEntry({
      id: "charge_1",
      type: "ALACARTE_CHARGE",
      amountCents: -125,
      description: "Cookie",
      createdAt: new Date("2026-08-15T12:00:00Z"),
      actorType: "USER",
      actorName: "Casey Nguyen",
      itemName: "Cookie",
      schoolName: "Phillis Wheatley Elementary",
      correctedByCount: 1,
    });
    expect(item.activity).toBe("Bought a cookie at Phillis Wheatley Elementary.");
    expect(item.correctedAbove).toBe(true);
  });
});
