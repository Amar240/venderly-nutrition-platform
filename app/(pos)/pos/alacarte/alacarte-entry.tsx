"use client";

import { useEffect, useRef, useState } from "react";
import { recordItemAction, type ItemActionResult } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/ui/money";
import { NumericKeypad } from "@/components/pos/numeric-keypad";
import { PosResult, type PosStatus } from "@/components/pos/pos-result";

interface ItemOption {
  id: string;
  name: string;
  priceCents: number;
}

/**
 * A-la-carte flow: pick an item, then enter a student number. The sale can be
 * denied (insufficient balance) — a calm message, no eligibility. Auto-resets
 * after a result.
 */
export function AlacarteEntry({ items }: { items: ItemOption[] }) {
  const [item, setItem] = useState<ItemOption | null>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ItemActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) inputRef.current?.focus();
  }, [item]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      setResult(null);
      setValue("");
      setItem(null);
    }, 2000);
    return () => clearTimeout(t);
  }, [result]);

  async function submit() {
    const num = value.trim();
    if (!item || !num || pending) return;
    setPending(true);
    const r = await recordItemAction(item.id, num);
    setPending(false);
    setResult(r);
  }

  if (result) {
    return (
      <div className="mx-auto max-w-md">
        <PosResult
          status={result.status as PosStatus}
          studentName={"studentName" in result ? result.studentName : undefined}
        />
      </div>
    );
  }

  if (!item) {
    return (
      <section>
        <h1 className="text-2xl font-medium text-ink">A-la-carte</h1>
        <p className="mt-1 text-sm text-ink-muted">Choose an item.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <Button
              key={it.id}
              type="button"
              variant="secondary"
              size="lg"
              className="h-24 flex-col"
              onClick={() => setItem(it)}
            >
              <span className="text-base font-medium">{it.name}</span>
              <span className="text-sm text-ink-muted">
                <MoneyDisplay amountCents={it.priceCents} />
              </span>
            </Button>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-ink-muted">No a-la-carte items available.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium text-ink">{item.name}</h1>
        <span className="text-lg">
          <MoneyDisplay amountCents={item.priceCents} />
        </span>
      </div>
      <button
        type="button"
        onClick={() => setItem(null)}
        className="mt-1 text-sm text-ink-muted hover:text-ink"
      >
        ← Choose a different item
      </button>

      <div className="mt-6 space-y-4">
        <div className="space-y-1">
          <Label htmlFor="itemStudentNumber">Student number</Label>
          <Input
            id="itemStudentNumber"
            ref={inputRef}
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            className="text-center text-2xl tabular"
          />
        </div>
        <NumericKeypad
          disabled={pending}
          onDigit={(d) => setValue((v) => v + d)}
          onBackspace={() => setValue((v) => v.slice(0, -1))}
          onClear={() => setValue("")}
          onEnter={() => void submit()}
        />
      </div>
    </section>
  );
}
