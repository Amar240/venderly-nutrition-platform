export const TRUST_COPY = {
  correction:
    "Nothing gets erased. The original stays where it is, and your correction sits next to it with your name and the reason.",
  priceChange:
    "Meals already served keep the price they were charged at. Changing these numbers never changes anything in the past.",
  ignoredColumns:
    "3 columns were ignored: date of birth, race, and gender. This system doesn't store them.",
  claimFigures:
    "These are your figures to check and submit. This system doesn't file claims and isn't your official counting record — PCS still is, unless the district decides otherwise.",
  mayBeNothing: "This may be nothing.",
};

export function formatBps(value: number, digits = 2): string {
  return (value / 100).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatClaimRate(units: number, digits = 1): string {
  return (units / 1000).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function correctionSituationLabel(situation: string): string {
  const labels: Record<string, string> = {
    CHARGED_TWICE: "Charged twice for a snack",
    WRONG_STUDENT: "Wrong student charged",
    SNACK_RETURNED: "Snack was returned",
    SOMETHING_ELSE: "Corrected after review",
    DISTRICT_DECISION: "District decision",
  };
  return labels[situation] ?? "Correction";
}

export function moneyActivityLabel(type: string): string {
  const labels: Record<string, string> = {
    DEPOSIT: "Payment",
    MEAL_CHARGE: "Meal",
    ALACARTE_CHARGE: "Snack",
    TRANSFER_DEBIT: "Money moved out",
    TRANSFER_CREDIT: "Money moved in",
    ADJUSTMENT: "Mistake fixed",
    REFUND: "Money given back",
    CORRECTION: "Mistake fixed",
  };
  return labels[type] ?? "Money activity";
}

export interface MoneyHistoryFormatInput {
  id: string;
  type: string;
  amountCents: number;
  description?: string | null;
  createdAt: Date;
  actorType: string;
  actorName?: string | null;
  studentName?: string | null;
  itemName?: string | null;
  mealType?: "BREAKFAST" | "LUNCH" | string | null;
  schoolName?: string | null;
  cashierName?: string | null;
  paymentGuardianName?: string | null;
  paymentProviderConfirmed?: boolean;
  transfer?: {
    fromStudentName?: string | null;
    toStudentName?: string | null;
    counterpartVisible: boolean;
  } | null;
  corrects?: {
    summary: string;
    createdAt: Date;
    amountCents: number;
  } | null;
  correctedByCount?: number;
  reason?: string | null;
  timeZone?: string | null;
}

export interface MoneyHistoryFormatOutput {
  activity: string;
  amountCents: number;
  amountDirection: "in" | "out" | "none";
  reason: string | null;
  connection: string | null;
  correctedAbove: boolean;
}

function moneySentenceAmount(amountCents: number): string {
  const negative = amountCents < 0;
  const abs = Math.abs(amountCents);
  const dollars = Math.floor(abs / 100).toLocaleString();
  const cents = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${cents}`;
}

function titleCaseMeal(mealType: string | null | undefined): string {
  return mealType === "BREAKFAST" ? "Breakfast" : mealType === "LUNCH" ? "Lunch" : "Meal";
}

function actorFallback(actorType: string): string {
  if (actorType === "GUARDIAN") return "A guardian";
  if (actorType === "SYSTEM") return "The system";
  return "Staff";
}

function formatHistoryDateTime(date: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "America/New_York",
  }).format(date);
}

function normalizedDescription(description: string | null | undefined): string {
  const text = description?.trim();
  if (!text) return "";
  return text.replace(/^Mistake fixed:\s*/i, "").replace(/^Money given back:\s*/i, "");
}

function snackPurchaseText(name: string): string {
  const lower = name.trim().toLowerCase();
  if (!lower) return "a snack";
  if (lower === "milk" || lower === "chips") return lower;
  if (/^(a|an|the)\s/i.test(name)) return name;
  return `a ${lower}`;
}

function reasonFor(input: MoneyHistoryFormatInput): string | null {
  const reason = input.reason?.trim() || null;
  if (reason) return reason;
  if (input.corrects) return normalizedDescription(input.description) || null;
  if (input.type === "ADJUSTMENT" && !input.corrects) return normalizedDescription(input.description) || null;
  return null;
}

export function formatMoneyHistoryEntry(input: MoneyHistoryFormatInput): MoneyHistoryFormatOutput {
  const amount = moneySentenceAmount(Math.abs(input.amountCents));
  const actor = input.actorName?.trim() || actorFallback(input.actorType);
  const school = input.schoolName ? ` at ${input.schoolName}` : "";
  const cashier = input.cashierName ? ` · rung up by ${input.cashierName}` : "";
  const reason = reasonFor(input);
  const quotedReason = reason ? ` Reason: "${reason}"` : "";
  const isCorrection = Boolean(input.corrects);
  let activity: string;

  if (isCorrection) {
    const target = input.corrects?.summary ?? moneyActivityLabel(input.type);
    if (input.type === "ALACARTE_CHARGE") {
      activity = `${actor} charged ${amount} for ${target}.${quotedReason}`;
    } else if (input.amountCents >= 0) {
      activity = `${actor} gave back ${amount} for ${target}.${quotedReason}`;
    } else {
      activity = `${actor} took ${amount} for ${target}.${quotedReason}`;
    }
  } else if (input.type === "DEPOSIT") {
    const payer = input.paymentGuardianName || (input.actorType === "GUARDIAN" ? actor : null);
    activity = `${payer ?? actor} added ${amount} online`;
    if (input.paymentProviderConfirmed) activity += " · confirmed by the payment provider";
    activity += ".";
  } else if (input.type === "ALACARTE_CHARGE") {
    activity = `Bought ${snackPurchaseText(input.itemName || normalizedDescription(input.description) || "snack")}${school}${cashier}.`;
  } else if (input.type === "MEAL_CHARGE") {
    activity = `${titleCaseMeal(input.mealType)} recorded${school}${cashier}.`;
  } else if (input.type === "TRANSFER_DEBIT" || input.type === "TRANSFER_CREDIT") {
    if (input.transfer?.counterpartVisible && input.transfer.fromStudentName && input.transfer.toStudentName) {
      activity = `${actor} moved ${amount} from ${input.transfer.fromStudentName} to ${input.transfer.toStudentName} · appears in both histories.`;
    } else {
      activity = input.type === "TRANSFER_DEBIT"
        ? `${actor} moved ${amount} out for another child.`
        : `${actor} moved ${amount} in from another child.`;
    }
  } else if (input.type === "ADJUSTMENT" || input.type === "CORRECTION") {
    const direction = input.amountCents >= 0 ? "added" : "took";
    activity = `${actor} ${direction} ${amount}.${quotedReason}`;
  } else if (input.type === "REFUND") {
    activity = `${actor} gave back ${amount}.${quotedReason}`;
  } else {
    const direction = input.amountCents >= 0 ? "added" : "took";
    const context = normalizedDescription(input.description);
    activity = `${actor} ${direction} ${amount} for ${moneyActivityLabel(input.type).toLowerCase()}${context ? `: ${context}` : ""}.`;
  }

  const connection = input.corrects
    ? `Corrects: ${input.corrects.summary} · ${formatHistoryDateTime(input.corrects.createdAt, input.timeZone)} · ${moneySentenceAmount(input.corrects.amountCents)} — the original remains in history.`
    : null;

  return {
    activity,
    amountCents: input.amountCents,
    amountDirection: input.amountCents > 0 ? "in" : input.amountCents < 0 ? "out" : "none",
    reason,
    connection,
    correctedAbove: !isCorrection && (input.correctedByCount ?? 0) > 0,
  };
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
    CONFIG_PRICING_VERSION_CREATE: "Changed meal prices",
    CONFIG_PRICING_VERSION_CANCEL: "Cancelled scheduled meal prices",
    CONFIG_COMPLIANCE_SETTINGS_UPDATE: "Changed district claim settings",
    CONFIG_CHARGE_POLICY_UPDATE: "Changed charge policy",
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
    CORRECTION_CASE_CREATED: "Started fixing a mistake",
    CORRECTION_CHARGE_COMPLETED: "Charged the right student",
    CORRECTION_FOLLOW_UP_REQUIRED: "Marked a charge as waiting",
    CORRECTION_FOLLOW_UP_COMPLETED: "Finished a waiting charge",
    STUDENT_VIEW: "Viewed a student",
    EDIT_CHECK_EXCEPTION_REVIEWED: "Reviewed a meal-count exception",
    CLAIM_PACK_GENERATED: "Printed the claim pack",
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
