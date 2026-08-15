"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateChargePolicyAction, type ChargePolicyState } from "./actions";

const initialState: ChargePolicyState = { ok: false, error: null };

function Submit({ hasText }: { hasText: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {hasText ? "Update charge policy" : "Publish charge policy"}
    </Button>
  );
}

export function ChargePolicyForm({ initialText }: { initialText: string | null }) {
  const [state, action] = useFormState(updateChargePolicyAction, initialState);
  return (
    <form action={action} className="space-y-4 rounded-card border border-border bg-surface-card p-6">
      <div className="space-y-2">
        <Label htmlFor="policyText">District charge policy</Label>
        <textarea
          id="policyText"
          name="policyText"
          defaultValue={initialText ?? ""}
          required
          maxLength={10000}
          rows={12}
          className="min-h-44 w-full rounded-control border border-control-border bg-white px-3 py-2 text-base text-ink shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <p className="text-sm text-ink-muted">
          Plain text only. This wording is shown to families and staff exactly as the district writes it.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit hasText={Boolean(initialText)} />
        {state.ok ? (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckCircleIcon /> Charge policy updated
          </span>
        ) : null}
        {state.error ? (
          <span role="alert" className="inline-flex items-center gap-1 text-sm text-danger">
            <AlertCircleIcon /> {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
