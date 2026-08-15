"use client";

import { useEffect, useRef, useState } from "react";
import type { MealType } from "@prisma/client";
import {
  recordMealAction,
  undoMealAction,
  type MealActionResult,
  type UndoMealActionResult,
} from "../../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericKeypad } from "@/components/pos/numeric-keypad";
import { PosResult, type PosStatus } from "@/components/pos/pos-result";
import { Button } from "@/components/ui/button";

type DisplayResult = MealActionResult | UndoMealActionResult;
type UndoReceipt = { batchId: string; expiresAt: string };

/**
 * Keyboard-first meal entry. The input is autofocused for physical-keyboard
 * speed; the on-screen keypad mirrors it for touch. After any result the screen
 * auto-resets to entry in ~2s. Nothing here knows a price or eligibility.
 */
export function MealEntry({ mealType, label }: { mealType: MealType; label: string }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [pending, setPending] = useState(false);
  const [undoPending, setUndoPending] = useState(false);
  const [undo, setUndo] = useState<UndoReceipt | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const focus = () => inputRef.current?.focus();
  useEffect(() => {
    if (!result) inputRef.current?.focus();
  }, [result]);

  // Auto-reset to a clean entry screen ~2s after a result.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      setResult(null);
      setValue("");
    }, 2000);
    return () => clearTimeout(t);
  }, [result]);

  useEffect(() => {
    if (!undo) return;
    const expiry = Date.parse(undo.expiresAt);
    const tick = () => {
      const now = Date.now();
      setClockMs(now);
      if (now >= expiry) setUndo(null);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [undo]);

  async function submit() {
    const num = value.trim();
    if (!num || pending) return;
    setPending(true);
    try {
      const r = await recordMealAction(mealType, num);
      setResult(r);
      if (r.status === "recorded") setUndo(r.undo);
    } catch {
      setResult({ status: "error" });
    } finally {
      setPending(false);
      window.requestAnimationFrame(focus);
    }
  }

  async function undoLast() {
    if (!undo || undoPending) return;
    setUndoPending(true);
    try {
      const r = await undoMealAction(undo.batchId);
      setResult(r);
      if (r.status === "undone" || r.status === "unavailable") setUndo(null);
    } catch {
      setResult({ status: "error" });
    } finally {
      setUndoPending(false);
      window.requestAnimationFrame(focus);
    }
  }

  const secondsRemaining = undo
    ? Math.max(0, Math.ceil((Date.parse(undo.expiresAt) - clockMs) / 1000))
    : 0;
  const resultMessage = result?.status === "undone"
    ? `${label} undone for ${result.studentNames.join(", ")}.`
    : undefined;
  const resultStatus = result?.status === "unavailable" ? "undo_unavailable" : result?.status;

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-2xl font-medium text-ink">{label}</h1>
      <p className="mt-1 text-sm text-ink-muted">Enter the student number, then press Enter.</p>

      {result ? (
        <div className="mt-6">
          <PosResult
            status={resultStatus as PosStatus}
            studentName={"studentName" in result ? result.studentName : undefined}
            detail={
              "grade" in result ? `Grade ${result.grade} · ${result.schoolName}` : undefined
            }
            message={resultMessage}
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

      {undo && (
        <div className="mt-4 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            loading={undoPending}
            disabled={pending}
            onClick={() => void undoLast()}
          >
            Undo last student
          </Button>
          <p className="mt-1 text-center text-sm text-ink-muted" aria-live="off">
            Available for {secondsRemaining} seconds
          </p>
        </div>
      )}
    </section>
  );
}
