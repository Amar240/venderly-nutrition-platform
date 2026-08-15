import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import {
  formatMoneyHistoryEntry,
  moneyActivityLabel,
  type MoneyHistoryFormatInput,
} from "@/lib/presentation-labels";

const historyInclude = {
  account: {
    include: {
      student: {
        select: {
          id: true,
          studentNumber: true,
          firstName: true,
          lastName: true,
          schoolId: true,
          school: { select: { name: true } },
          district: { select: { timeZone: true } },
        },
      },
    },
  },
  mealEvent: {
    include: {
      school: { select: { name: true } },
      recordedByUser: { select: { firstName: true, lastName: true } },
    },
  },
  itemSale: { include: { item: { select: { name: true } } } },
  correctsEntry: {
    include: {
      mealEvent: { include: { school: { select: { name: true } } } },
      itemSale: { include: { item: { select: { name: true } } } },
    },
  },
  correctedBy: { select: { id: true } },
  correctionCaseOriginal: {
    select: { refundEntryId: true, chargeEntryId: true, adjustmentEntryId: true },
  },
  correctionCaseRefund: { select: { reason: true, situation: true } },
  correctionCaseCharge: { select: { reason: true, situation: true } },
  correctionCaseAdjustment: { select: { reason: true, situation: true } },
} satisfies Prisma.LedgerEntryInclude;

type HistoryEntry = Prisma.LedgerEntryGetPayload<{ include: typeof historyInclude }>;

export interface MoneyHistoryItem {
  id: string;
  createdAt: Date;
  activity: string;
  amountCents: number;
  amountDirection: "in" | "out" | "none";
  runningBalanceCents?: number;
  reason: string | null;
  connection: string | null;
  correctedAbove: boolean;
}

export interface MoneyHistoryOptions {
  visibleStudentIds?: string[];
  visibleSchoolIds?: string[];
}

function fullName(person: { firstName: string; lastName: string } | null | undefined): string | null {
  if (!person) return null;
  return `${person.firstName} ${person.lastName}`;
}

function entrySummary(entry: {
  type: string;
  description: string;
  mealEvent?: { mealType: string } | null;
  itemSale?: { item: { name: string } } | null;
}): string {
  if (entry.type === "ALACARTE_CHARGE") {
    return entry.itemSale?.item.name || entry.description || "Snack";
  }
  if (entry.type === "MEAL_CHARGE") {
    return entry.mealEvent?.mealType === "BREAKFAST" ? "Breakfast" : "Lunch";
  }
  return moneyActivityLabel(entry.type);
}

function correctionReason(entry: HistoryEntry): string | null {
  return (
    entry.correctionCaseRefund?.reason ??
    entry.correctionCaseCharge?.reason ??
    entry.correctionCaseAdjustment?.reason ??
    null
  );
}

function eventIdFromKey(idempotencyKey: string | null): string | null {
  if (!idempotencyKey) return null;
  const index = idempotencyKey.lastIndexOf(":");
  return index > 0 ? idempotencyKey.slice(0, index) : null;
}

async function actorNameMaps(entries: HistoryEntry[]) {
  const userIds = new Set<string>();
  const guardianIds = new Set<string>();
  for (const entry of entries) {
    if (!entry.actorId) continue;
    if (entry.actorType === "USER") userIds.add(entry.actorId);
    if (entry.actorType === "GUARDIAN") guardianIds.add(entry.actorId);
  }
  const [users, guardians] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    guardianIds.size
      ? prisma.guardian.findMany({
          where: { id: { in: Array.from(guardianIds) } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    users: new Map(users.map((user) => [user.id, fullName(user)])),
    guardians: new Map(guardians.map((guardian) => [guardian.id, fullName(guardian)])),
  };
}

async function paymentGuardianMap(entries: HistoryEntry[]) {
  const eventIds = entries
    .filter((entry) => entry.type === "DEPOSIT")
    .map((entry) => eventIdFromKey(entry.idempotencyKey))
    .filter((id): id is string => Boolean(id));
  if (eventIds.length === 0) return new Map<string, { guardianName: string; confirmed: boolean }>();
  const intents = await prisma.paymentIntent.findMany({
    where: { eventId: { in: eventIds } },
    include: { guardian: { select: { firstName: true, lastName: true } } },
  });
  return new Map(
    intents.flatMap((intent) =>
      intent.eventId
        ? [[intent.eventId, { guardianName: fullName(intent.guardian) ?? "A guardian", confirmed: intent.status === "COMPLETED" }]]
        : [],
    ),
  );
}

async function transferCounterpartMap(entries: HistoryEntry[], options: MoneyHistoryOptions) {
  const refs = Array.from(new Set(entries.map((entry) => entry.transferRef).filter((ref): ref is string => Boolean(ref))));
  if (refs.length === 0) return new Map<string, HistoryEntry>();
  const ids = new Set(entries.map((entry) => entry.id));
  const counterparts = await prisma.ledgerEntry.findMany({
    where: { transferRef: { in: refs }, id: { notIn: Array.from(ids) } },
    include: historyInclude,
  });
  return new Map(counterparts.map((entry) => [entry.transferRef!, entry]));
}

function canSeeStudent(
  student: { id: string; schoolId: string },
  options: MoneyHistoryOptions,
): boolean {
  if (options.visibleStudentIds) return options.visibleStudentIds.includes(student.id);
  if (options.visibleSchoolIds) return options.visibleSchoolIds.includes(student.schoolId);
  return true;
}

function actorName(
  entry: HistoryEntry,
  maps: Awaited<ReturnType<typeof actorNameMaps>>,
): string | null {
  if (!entry.actorId) return null;
  if (entry.actorType === "USER") return maps.users.get(entry.actorId) ?? null;
  if (entry.actorType === "GUARDIAN") return maps.guardians.get(entry.actorId) ?? null;
  return null;
}

async function buildMoneyHistory(
  entries: HistoryEntry[],
  options: MoneyHistoryOptions = {},
): Promise<MoneyHistoryItem[]> {
  const [actors, payments, transferCounterparts] = await Promise.all([
    actorNameMaps(entries),
    paymentGuardianMap(entries),
    transferCounterpartMap(entries, options),
  ]);
  const correctedOriginalIds = new Set<string>();
  for (const entry of entries) {
    if (entry.correctedBy.length > 0) correctedOriginalIds.add(entry.id);
    if (
      entry.correctionCaseOriginal?.refundEntryId ||
      entry.correctionCaseOriginal?.chargeEntryId ||
      entry.correctionCaseOriginal?.adjustmentEntryId
    ) {
      correctedOriginalIds.add(entry.id);
    }
  }

  let running = 0;
  const formatted = entries.map((entry) => {
    running += entry.amountCents;
    const eventId = eventIdFromKey(entry.idempotencyKey);
    const payment = eventId ? payments.get(eventId) : null;
    const counterpart = entry.transferRef ? transferCounterparts.get(entry.transferRef) : null;
    const currentStudentName = fullName(entry.account.student);
    const entryActorName = actorName(entry, actors);
    const counterpartVisible = counterpart ? canSeeStudent(counterpart.account.student, options) : false;
    const fromName = entry.type === "TRANSFER_DEBIT"
      ? currentStudentName
      : counterpartVisible
        ? fullName(counterpart?.account.student)
        : null;
    const toName = entry.type === "TRANSFER_CREDIT"
      ? currentStudentName
      : counterpartVisible
        ? fullName(counterpart?.account.student)
        : null;
    const formatInput: MoneyHistoryFormatInput = {
      id: entry.id,
      type: entry.type,
      amountCents: entry.amountCents,
      description: entry.description,
      createdAt: entry.createdAt,
      actorType: entry.actorType,
      actorName: entryActorName,
      studentName: currentStudentName,
      itemName: entry.itemSale?.item.name ?? null,
      mealType: entry.mealEvent?.mealType ?? null,
      schoolName: entry.mealEvent?.school.name ?? entry.account.student.school.name,
      cashierName: fullName(entry.mealEvent?.recordedByUser) ?? (entry.type === "ALACARTE_CHARGE" ? entryActorName : null),
      paymentGuardianName: payment?.guardianName,
      paymentProviderConfirmed: payment?.confirmed,
      transfer: entry.transferRef
        ? {
            fromStudentName: fromName,
            toStudentName: toName,
            counterpartVisible: Boolean(counterpart && counterpartVisible),
          }
        : null,
      corrects: entry.correctsEntry
        ? {
            summary: entrySummary(entry.correctsEntry),
            createdAt: entry.correctsEntry.createdAt,
            amountCents: entry.correctsEntry.amountCents,
          }
        : null,
      correctedByCount: correctedOriginalIds.has(entry.id) ? 1 : 0,
      reason: correctionReason(entry),
      timeZone: entry.account.student.district.timeZone,
    };
    const item = formatMoneyHistoryEntry(formatInput);
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      activity: item.activity,
      amountCents: item.amountCents,
      amountDirection: item.amountDirection,
      runningBalanceCents: running,
      reason: item.reason,
      connection: item.connection,
      correctedAbove: item.correctedAbove,
    };
  });
  return formatted.reverse();
}

export async function getMoneyHistoryForAccount(
  accountId: string,
  options: MoneyHistoryOptions = {},
): Promise<MoneyHistoryItem[]> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId },
    include: historyInclude,
    orderBy: { createdAt: "asc" },
  });
  return buildMoneyHistory(entries, options);
}

export async function getMoneyHistoryForExport(
  where: Prisma.LedgerEntryWhereInput,
  options: MoneyHistoryOptions = {},
): Promise<(MoneyHistoryItem & {
  studentNumber: string;
  studentName: string;
  schoolName: string;
})[]> {
  const entries = await prisma.ledgerEntry.findMany({
    where,
    include: historyInclude,
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  const items = await buildMoneyHistory(entries, options);
  const itemById = new Map(items.map((item) => [item.id, item]));
  return entries
    .map((entry) => ({
      ...itemById.get(entry.id)!,
      studentNumber: entry.account.student.studentNumber,
      studentName: fullName(entry.account.student) ?? "",
      schoolName: entry.account.student.school.name,
    }))
    .reverse();
}
