import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { listItems } from "@/server/config/items";
import { AuthError } from "@/server/auth/errors";
import { ItemsManager } from "./items-manager";

export default async function ItemsConfigPage() {
  const session = await getAppSession();
  let items;
  try {
    items = await listItems(session);
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/admin/config" className="text-sm text-ink-muted hover:text-ink">← Configuration</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Item catalog</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Editing a price never changes past sales — each sale keeps the price at time of purchase.
      </p>
      <div className="mt-6">
        <ItemsManager items={items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, active: i.active }))} />
      </div>
    </section>
  );
}
