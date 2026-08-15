"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updatePricingAction, type ConfigState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, AlertCircleIcon } from "@/components/icons";
import { TRUST_COPY } from "@/lib/presentation-labels";

interface Initial {
  cepEnabled: boolean;
  breakfastFreeCents: number;
  breakfastReducedCents: number;
  breakfastPaidCents: number;
  lunchFreeCents: number;
  lunchReducedCents: number;
  lunchPaidCents: number;
  lowBalanceThresholdCents: number;
  lowBalanceMealsThreshold: number;
}
const initialState: ConfigState = { error: null, ok: false };
const dollars = (c: number) => (c / 100).toFixed(2);

function Money({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-1">
        <span aria-hidden className="text-ink-muted">$</span>
        <Input id={name} name={name} inputMode="decimal" defaultValue={dollars(value)} required />
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending}>Update meal prices</Button>;
}

export function PricingForm({ initial }: { initial: Initial }) {
  const [state, action] = useFormState(updatePricingAction, initialState);
  return (
    <form action={action} className="space-y-5 rounded-card border border-border bg-surface-card p-6">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="cepEnabled" defaultChecked={initial.cepEnabled} className="h-4 w-4" />
        <span className="text-sm text-ink">Free meals for all students is on</span>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Breakfast prices if free meals for all is off</legend>
        <div className="grid grid-cols-3 gap-3">
          <Money name="bFree" label="No-cost price" value={initial.breakfastFreeCents} />
          <Money name="bReduced" label="Lower price" value={initial.breakfastReducedCents} />
          <Money name="bPaid" label="Full price" value={initial.breakfastPaidCents} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Lunch prices if free meals for all is off</legend>
        <div className="grid grid-cols-3 gap-3">
          <Money name="lFree" label="No-cost price" value={initial.lunchFreeCents} />
          <Money name="lReduced" label="Lower price" value={initial.lunchReducedCents} />
          <Money name="lPaid" label="Full price" value={initial.lunchPaidCents} />
        </div>
      </fieldset>

      <Money name="threshold" label="Snack money warning amount" value={initial.lowBalanceThresholdCents} />

      <div className="space-y-1">
        <Label htmlFor="mealsThreshold">Meals remaining warning</Label>
        <Input
          id="mealsThreshold"
          name="mealsThreshold"
          type="number"
          min={0}
          step={1}
          defaultValue={initial.lowBalanceMealsThreshold}
          required
        />
        <p className="text-sm text-ink-muted">
          Used when lunch has a price. No-cost meals use the snack money warning amount.
        </p>
      </div>
      <p className="rounded-control bg-brand-wash px-3 py-2 text-sm text-ink">{TRUST_COPY.priceChange}</p>

      <div className="flex items-center gap-3">
        <Submit />
        {state.ok && <span className="flex items-center gap-1 text-sm text-success"><CheckCircleIcon /> Meal prices updated</span>}
        {state.error && <span className="flex items-center gap-1 text-sm text-danger"><AlertCircleIcon /> {state.error}</span>}
      </div>
    </form>
  );
}
