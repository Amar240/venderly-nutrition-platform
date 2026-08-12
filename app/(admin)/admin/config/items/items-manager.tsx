"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createItemAction, updateItemAction, toggleItemActiveAction, type ConfigState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, AlertCircleIcon } from "@/components/icons";
import { formatCents } from "@/lib/utils";

interface ItemRow {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}
const initial: ConfigState = { error: null, ok: false };

function Feedback({ state }: { state: ConfigState }) {
  if (state.ok) return <span className="flex items-center gap-1 text-sm text-success"><CheckCircleIcon /> Saved</span>;
  if (state.error) return <span className="flex items-center gap-1 text-sm text-danger"><AlertCircleIcon /> {state.error}</span>;
  return null;
}
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="md" loading={pending}>{children}</Button>;
}

export function ItemsManager({ items }: { items: ItemRow[] }) {
  const [createState, createAction] = useFormState(createItemAction, initial);
  return (
    <div className="space-y-6">
      <form action={createAction} className="rounded-card border border-border bg-surface-card p-4">
        <h2 className="text-sm font-medium text-ink">Add an item</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-price">Price ($)</Label>
            <Input id="new-price" name="price" inputMode="decimal" placeholder="0.00" required />
          </div>
          <Submit>Add</Submit>
          <Feedback state={createState} />
        </div>
      </form>

      <ul className="space-y-2">
        {items.map((item) => (
          <ItemEditRow key={item.id} item={item} />
        ))}
        {items.length === 0 && <li className="text-sm text-ink-muted">No items yet.</li>}
      </ul>
    </div>
  );
}

function ItemEditRow({ item }: { item: ItemRow }) {
  const [saveState, saveAction] = useFormState(updateItemAction, initial);
  const [toggleState, toggleAction] = useFormState(toggleItemActiveAction, initial);
  return (
    <li className={`rounded-control border border-border p-3 ${item.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-end gap-2">
        <form action={saveAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          <div className="space-y-1">
            <Label htmlFor={`name-${item.id}`}>Name</Label>
            <Input id={`name-${item.id}`} name="name" defaultValue={item.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`price-${item.id}`}>Price ($)</Label>
            <Input id={`price-${item.id}`} name="price" inputMode="decimal" defaultValue={(item.priceCents / 100).toFixed(2)} required />
          </div>
          <Submit>Save</Submit>
        </form>
        <form action={toggleAction} className="flex items-center gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="active" value={item.active ? "false" : "true"} />
          <Button type="submit" variant={item.active ? "secondary" : "primary"} size="md">
            {item.active ? "Deactivate" : "Activate"}
          </Button>
        </form>
        <div className="ml-auto text-sm text-ink-muted">
          {formatCents(item.priceCents)} · {item.active ? "active" : "inactive"}
        </div>
      </div>
      <div className="mt-1"><Feedback state={saveState.ok || saveState.error ? saveState : toggleState} /></div>
    </li>
  );
}
