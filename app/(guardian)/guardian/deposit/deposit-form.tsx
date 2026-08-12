"use client";

import { useFormState, useFormStatus } from "react-dom";
import { startDepositAction, type DepositState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon } from "@/components/icons";

interface ChildOption {
  studentId: string;
  name: string;
  schoolName: string;
}

const initialState: DepositState = { error: null };

export function DepositForm({ students }: { students: ChildOption[] }) {
  const [state, formAction] = useFormState(startDepositAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control bg-danger-wash px-3 py-2 text-sm text-danger"
        >
          <AlertCircleIcon className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <ul className="space-y-4">
        {students.map((child) => {
          const fieldId = `amount_${child.studentId}`;
          const fieldError = state.fieldErrors?.[child.studentId];
          return (
            <li
              key={child.studentId}
              className="rounded-card border border-border bg-surface-card p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={fieldId}>{child.name}</Label>
                  <p className="text-xs text-ink-muted">{child.schoolName}</p>
                </div>
                <div className="w-36">
                  <div className="flex items-center gap-1">
                    <span aria-hidden className="text-ink-muted">$</span>
                    <Input
                      id={fieldId}
                      name={fieldId}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-invalid={fieldError ? true : undefined}
                      aria-describedby={fieldError ? `${fieldId}-err` : undefined}
                    />
                  </div>
                  {fieldError && (
                    <p id={`${fieldId}-err`} className="mt-1 text-xs text-danger">
                      {fieldError}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" loading={pending}>
      Continue to checkout
    </Button>
  );
}
