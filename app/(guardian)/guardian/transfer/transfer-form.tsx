"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { transferAction, type TransferState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyDisplay } from "@/components/ui/money";
import { AlertCircleIcon } from "@/components/icons";
import { parseDollarsToCents } from "@/lib/utils";

interface ChildOption {
  studentId: string;
  name: string;
  balanceCents: number;
}

const initialState: TransferState = { error: null };
const selectClass =
  "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-base text-ink";

export function TransferForm({
  token,
  students,
}: {
  token: string;
  students: ChildOption[];
}) {
  const [state, formAction] = useFormState(transferAction, initialState);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const from = students.find((c) => c.studentId === fromId);
  const to = students.find((c) => c.studentId === toId);
  const cents = parseDollarsToCents(amount);

  function review() {
    if (!fromId || !toId) return setLocalError("Choose both children.");
    if (fromId === toId) return setLocalError("Choose two different children.");
    if (cents === null || cents <= 0) return setLocalError("Enter a valid amount.");
    if (from && cents > from.balanceCents) {
      return setLocalError("That's more than the source child's balance.");
    }
    setLocalError(null);
    setReviewing(true);
  }

  if (reviewing && from && to && cents !== null) {
    return (
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-control bg-danger-wash px-3 py-2 text-sm text-danger"
          >
            <AlertCircleIcon className="mt-0.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="fromStudentId" value={fromId} />
        <input type="hidden" name="toStudentId" value={toId} />
        <input type="hidden" name="amount" value={amount} />

        <div className="rounded-card border border-border bg-surface-card p-5">
          <p className="text-sm text-ink-muted">You&apos;re about to move</p>
          <p className="mt-1 text-2xl">
            <MoneyDisplay amountCents={cents} />
          </p>
          <p className="mt-3 text-sm text-ink">
            From <span className="font-medium">{from.name}</span> → to{" "}
            <span className="font-medium">{to.name}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <ConfirmButton />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReviewing(false)}
          >
            Edit
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {localError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control bg-danger-wash px-3 py-2 text-sm text-danger"
        >
          <AlertCircleIcon className="mt-0.5 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="from">From</Label>
        <select
          id="from"
          className={selectClass}
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        >
          <option value="">Choose a child…</option>
          {students.map((c) => (
            <option key={c.studentId} value={c.studentId}>
              {c.name}
            </option>
          ))}
        </select>
        {from && (
          <p className="text-xs text-ink-muted">
            Available: <MoneyDisplay amountCents={from.balanceCents} />
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="to">To</Label>
        <select
          id="to"
          className={selectClass}
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          <option value="">Choose a child…</option>
          {students
            .filter((c) => c.studentId !== fromId)
            .map((c) => (
              <option key={c.studentId} value={c.studentId}>
                {c.name}
              </option>
            ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="amount">Amount</Label>
        <div className="flex items-center gap-1">
          <span aria-hidden className="text-ink-muted">$</span>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <Button type="button" className="w-full" onClick={review}>
        Review transfer
      </Button>
    </div>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Confirm transfer
    </Button>
  );
}
