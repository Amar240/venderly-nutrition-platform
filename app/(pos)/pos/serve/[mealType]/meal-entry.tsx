"use client";

import { useEffect, useRef, useState } from "react";
import type { MealType } from "@prisma/client";
import { recordMealAction, type MealActionResult } from "../../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericKeypad } from "@/components/pos/numeric-keypad";
import { PosResult, type PosStatus } from "@/components/pos/pos-result";

/**
 * Keyboard-first meal entry. The input is autofocused for physical-keyboard
 * speed; the on-screen keypad mirrors it for touch. After any result the screen
 * auto-resets to entry in ~2s. Nothing here knows a price or eligibility.
 */
export function MealEntry({ mealType, label }: { mealType: MealType; label: string }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<MealActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const focus = () => inputRef.current?.focus();
  useEffect(() => {
    focus();
  }, []);

  // Auto-reset to a clean entry screen ~2s after a result.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      setResult(null);
      setValue("");
      focus();
    }, 2000);
    return () => clearTimeout(t);
  }, [result]);

  async function submit() {
    const num = value.trim();
    if (!num || pending) return;
    setPending(true);
    try {
      const r = await recordMealAction(mealType, num);
      setResult(r);
    } catch {
      setResult({ status: "error" });
    } finally {
      setPending(false);
      window.requestAnimationFrame(focus);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-2xl font-medium text-ink">{label}</h1>
      <p className="mt-1 text-sm text-ink-muted">Enter the student number, then press Enter.</p>

      {result ? (
        <div className="mt-6">
          <PosResult
            status={result.status as PosStatus}
            studentName={"studentName" in result ? result.studentName : undefined}
            detail={
              "grade" in result ? `Grade ${result.grade} · ${result.schoolName}` : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="studentNumber">Student number</Label>
            <Input
              id="studentNumber"
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
      )}
    </section>
  );
}
