import { prisma } from "@/server/db/client";
import { writeAudit } from "@/server/audit/log";
import { AuthError } from "@/server/auth/errors";
import { assertSuperAdmin } from "./guard";
import type { AppSession } from "@/server/auth/types";
import type { Item } from "@prisma/client";

/**
 * A-la-carte item catalog config (super admin). Editing an item's price changes
 * ONLY the Item row — past ItemSale.priceCentsAtSale is historical and is never
 * rewritten. Every change writes an AuditLog with before/after.
 */

export class ConfigError extends Error {
  constructor(public code: "INVALID" | "NOT_FOUND") {
    super(code);
    this.name = "ConfigError";
  }
}

export function listItems(session: AppSession | null | undefined): Promise<Item[]> {
  const staff = assertSuperAdmin(session);
  return prisma.item.findMany({ where: { districtId: staff.districtId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
}

export async function createItem(
  session: AppSession | null | undefined,
  input: { name: string; priceCents: number },
): Promise<Item> {
  const staff = assertSuperAdmin(session);
  if (!input.name.trim() || !Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new ConfigError("INVALID");
  }
  const item = await prisma.item.create({
    data: { districtId: staff.districtId, name: input.name.trim(), priceCents: input.priceCents, active: true },
  });
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_ITEM_CREATE",
    subjectType: "item", subjectId: item.id, districtId: staff.districtId,
    before: null, after: { name: item.name, priceCents: item.priceCents, active: true },
  });
  return item;
}

async function scopedItem(districtId: string, itemId: string) {
  const item = await prisma.item.findFirst({ where: { id: itemId, districtId } });
  if (!item) throw new ConfigError("NOT_FOUND");
  return item;
}

export async function updateItem(
  session: AppSession | null | undefined,
  itemId: string,
  input: { name: string; priceCents: number },
): Promise<Item> {
  const staff = assertSuperAdmin(session);
  if (!input.name.trim() || !Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new ConfigError("INVALID");
  }
  const before = await scopedItem(staff.districtId, itemId);
  const after = await prisma.item.update({
    where: { id: itemId },
    data: { name: input.name.trim(), priceCents: input.priceCents }, // ItemSale rows untouched
  });
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: "CONFIG_ITEM_UPDATE",
    subjectType: "item", subjectId: itemId, districtId: staff.districtId,
    before: { name: before.name, priceCents: before.priceCents },
    after: { name: after.name, priceCents: after.priceCents },
  });
  return after;
}

export async function setItemActive(
  session: AppSession | null | undefined,
  itemId: string,
  active: boolean,
): Promise<Item> {
  const staff = assertSuperAdmin(session);
  const before = await scopedItem(staff.districtId, itemId);
  const after = await prisma.item.update({ where: { id: itemId }, data: { active } });
  await writeAudit({
    actorType: "USER", actorId: staff.userId, action: active ? "CONFIG_ITEM_ACTIVATE" : "CONFIG_ITEM_DEACTIVATE",
    subjectType: "item", subjectId: itemId, districtId: staff.districtId,
    before: { active: before.active }, after: { active: after.active },
  });
  return after;
}

export { AuthError };
