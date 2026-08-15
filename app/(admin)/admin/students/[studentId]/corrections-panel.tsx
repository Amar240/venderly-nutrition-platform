"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  adjustAction,
  refundAction,
  reallocateAction,
  overrideAction,
  type CorrectionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircleIcon, AlertCircleIcon } from "@/components/icons";

const initial: CorrectionState = { error: null, ok: false };
const selectClass =
  "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-base text-ink";

interface RefundableEntry {
  id: string;
  label: string;
}

export function CorrectionsPanel({
  studentId,
  refundable,
}: {
  studentId: string;
  refundable: RefundableEntry[];
}) {
  return (
    <div className="rounded-card border border-border bg-surface-card p-6">
      <h2 className="text-lg font-medium text-ink">Corrections</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Every correction is recorded in the ledger and the audit log with your reason.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <AdjustForm studentId={studentId} />
        <ReallocateForm studentId={studentId} />
        <RefundForm studentId={studentId} refundable={refundable} />
        <OverrideForm studentId={studentId} />
      </div>
    </div>
  );
}

function Feedback({ state }: { state: CorrectionState }) {
  if (state.ok) {
    return (
      <p className="flex items-center gap-1 text-sm text-success">
        <CheckCircleIcon /> Done.
      </p>
    );
  }
  if (state.error) {
    return (
      <p className="flex items-center gap-1 text-sm text-danger">
        <AlertCircleIcon /> {state.error}
      </p>
    );
  }
  return null;
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-control border border-border p-4">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function ReasonField({ id }: { id: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Reason</Label>
      <Input id={id} name="reason" required placeholder="Required" />
    </div>
  );
}

function AdjustForm({ studentId }: { studentId: string }) {
  const [state, action] = useFormState(adjustAction, initial);
  return (
    <Card title="Adjust balance">
      <form action={action} className="space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="adjust-direction">Direction</Label>
            <select id="adjust-direction" name="direction" className={selectClass}>
            <option value="add">Add funds</option>
            <option value="remove">Remove funds</option>
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="adjust-amount">Amount</Label>
            <div className="flex items-center gap-1">
              <span aria-hidden className="text-ink-muted">$</span>
              <Input id="adjust-amount" name="amount" inputMode="decimal" placeholder="0.00" required />
            </div>
          </div>
        </div>
        <ReasonField id="adjust-reason" />
        <SubmitButton>Apply adjustment</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

function ReallocateForm({ studentId }: { studentId: string }) {
  const [state, action] = useFormState(reallocateAction, initial);
  return (
    <Card title="Reallocate to another student">
      <form action={action} className="space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="space-y-1">
          <Label htmlFor="realloc-to">Destination student number</Label>
          <Input id="realloc-to" name="toStudentNumber" inputMode="numeric" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="realloc-amount">Amount</Label>
          <div className="flex items-center gap-1">
            <span aria-hidden className="text-ink-muted">$</span>
            <Input id="realloc-amount" name="amount" inputMode="decimal" placeholder="0.00" required />
          </div>
        </div>
        <ReasonField id="realloc-reason" />
        <SubmitButton>Reallocate</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

function RefundForm({ studentId, refundable }: { studentId: string; refundable: RefundableEntry[] }) {
  const [state, action] = useFormState(refundAction, initial);
  return (
    <Card title="Refund an entry">
      <form action={action} className="space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="space-y-1">
          <Label htmlFor="refund-entry">Entry</Label>
          <select id="refund-entry" name="entryId" className={selectClass} required>
            <option value="">Choose an entry…</option>
            {refundable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <ReasonField id="refund-reason" />
        <SubmitButton>Refund</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

function OverrideForm({ studentId }: { studentId: string }) {
  const [state, action] = useFormState(overrideAction, initial);
  return (
    <Card title="Duplicate-meal override">
      <form action={action} className="space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="override-meal">Meal</Label>
            <select id="override-meal" name="mealType" className={selectClass} required>
              <option value="">Meal...</option>
              <option value="BREAKFAST">Breakfast</option>
              <option value="LUNCH">Lunch</option>
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="override-date">Service date</Label>
            <Input id="override-date" name="serviceDate" type="date" />
          </div>
        </div>
        <ReasonField id="override-reason" />
        <SubmitButton>Record override</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}
