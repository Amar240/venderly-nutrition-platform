export const TRUST_COPY = {
  correction:
    "Nothing gets erased. The original stays where it is, and your correction sits next to it with your name and the reason.",
  priceChange:
    "Meals already served keep the price they were charged at. Changing these numbers never changes anything in the past.",
  ignoredColumns:
    "3 columns were ignored: date of birth, race, and gender. This system doesn't store them.",
  claimFigures: "These are your figures to check and submit. This system doesn't file claims.",
  mayBeNothing: "This may be nothing.",
};

export function moneyActivityLabel(type: string): string {
  const labels: Record<string, string> = {
    DEPOSIT: "Payment",
    MEAL_CHARGE: "Meal",
    ALACARTE_CHARGE: "Snack",
    TRANSFER_DEBIT: "Money moved out",
    TRANSFER_CREDIT: "Money moved in",
    ADJUSTMENT: "Mistake fixed",
    REFUND: "Money given back",
    CORRECTION: "Correction",
  };
  return labels[type] ?? "Money activity";
}

export function staffRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    CASHIER: "Cashier",
    SCHOOL_STAFF: "School staff",
    DISTRICT_ADMIN: "District administrator",
    SUPER_ADMIN: "System administrator",
  };
  return labels[role] ?? "Staff";
}

export function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    LOGIN: "Signed in",
    TRANSFER: "Moved money",
    LEDGER_ADJUSTMENT: "Fixed a mistake",
    LEDGER_REFUND: "Gave money back",
    LEDGER_REALLOCATION: "Moved money",
    MEAL_OVERRIDE: "Recorded another meal",
    MEAL_UNDO: "Undid a meal at the register",
    EXPORT_TRANSACTIONS: "Downloaded money history",
    IMPORT_REJECTED: "Student list had problems",
    IMPORT_COMMITTED: "Uploaded student list",
    IMPORT_CONFIRMED_DEACTIVATION: "Marked many students as left",
    CONFIG_PRICING_UPDATE: "Changed meal prices",
    CONFIG_SCHOOL_CREATE: "Added a school",
    CONFIG_SCHOOL_UPDATE: "Changed a school",
    CONFIG_ITEM_CREATE: "Added a snack",
    CONFIG_ITEM_UPDATE: "Changed a snack",
    CONFIG_ITEM_ACTIVE: "Changed snack availability",
    CONFIG_USER_CREATE: "Added staff access",
    CONFIG_USER_UPDATE: "Changed staff access",
    CONFIG_USER_DISABLED: "Turned off staff access",
    CONFIG_USER_ENABLED: "Turned on staff access",
    CLASSROOM_CREATED: "Created a class",
    CLASSROOM_DEACTIVATED: "Stopped using a class",
    CLASSROOM_REACTIVATED: "Started using a class again",
    STUDENT_CLASSROOM_ASSIGNED: "Assigned a student to a class",
    STUDENT_CLASSROOM_REASSIGNED: "Moved a student to another class",
    STUDENT_CLASSROOM_UNASSIGNED: "Removed a student from a class",
    STUDENT_CLASSROOM_CLEARED_FOR_SCHOOL_CHANGE: "Cleared a class after a school change",
    STUDENT_VIEW: "Viewed a student",
  };
  return labels[action] ?? "Staff activity";
}

export function auditActorLabel(actorType: string): string {
  const labels: Record<string, string> = {
    USER: "Staff",
    STAFF: "Staff",
    GUARDIAN: "Guardian",
    SYSTEM: "System",
  };
  return labels[actorType] ?? "Actor";
}

export function auditSubjectLabel(subjectType: string | null | undefined): string {
  if (!subjectType) return "None";
  const labels: Record<string, string> = {
    student: "Student",
    account: "Account",
    report: "Report",
    user: "Staff member",
    school: "School",
    item: "Snack",
    import: "Student list",
    district: "District",
    classroom: "Class",
  };
  return labels[subjectType] ?? "Subject";
}

export function notificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    LOW_BALANCE: "Money running low",
    DEPOSIT_COMPLETED: "Money added",
    TRANSFER_COMPLETED: "Money moved",
  };
  return labels[type] ?? "Household update";
}

export function deliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SENT: "Sent",
    DELIVERED: "Delivered",
    FAILED: "Needs review",
    PENDING: "Sending",
  };
  return labels[status] ?? "Recorded";
}
