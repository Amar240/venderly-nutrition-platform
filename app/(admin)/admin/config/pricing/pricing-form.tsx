"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  cancelPricingAction,
  updateComplianceAction,
  updatePricingAction,
  type ConfigState,
} from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, AlertCircleIcon, InfoIcon } from "@/components/icons";
import { TRUST_COPY } from "@/lib/presentation-labels";

interface Version {
  id: string | null;
  cepEnabled: boolean;
  breakfastFreeCents: number;
  breakfastReducedCents: number;
  breakfastPaidCents: number;
  lunchFreeCents: number;
  lunchReducedCents: number;
  lunchPaidCents: number;
  lowBalanceThresholdCents: number;
  lowBalanceMealsThreshold: number;
  effectiveFrom: string | null;
  createdByName: string | null;
}

interface Counts {
  noCostStudentCount: number;
  lowerPriceStudentCount: number;
  fullPriceStudentCount: number;
  activeStudentCount: number;
}

interface Compliance {
  identifiedStudentPercentageBps: number | null;
  stateAttendanceFactorBps: number | null;
  stateAttendanceFactorProvenance: "FNS_FEDERAL_DEFAULT" | "APPROVED_LOCAL";
}

interface Props {
  current: Version;
  scheduled: Version | null;
  counts: Counts;
  compliance: Compliance;
  today: string;
}

const initialState: ConfigState = { error: null, ok: false };
const dollars = (cents: number) => (cents / 100).toFixed(2);
const percent = (bps: number | null) => bps === null ? "" : (bps / 100).toFixed(2);
const count = (value: number) => `${value.toLocaleString()} ${value === 1 ? "student" : "students"}`;

function Money({ name, label, value, affected }: { name: string; label: string; value: number; affected: string }) {
  return (
    <div className="space-y-1 rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={name}>{label}</Label>
        <span className="text-sm text-ink-muted">{affected}</span>
      </div>
      <div className="flex items-center gap-1">
        <span aria-hidden className="text-ink-muted">$</span>
        <Input id={name} name={name} inputMode="decimal" defaultValue={dollars(value)} required />
      </div>
    </div>
  );
}

function SubmitPricing({ startDate, today }: { startDate: string; today: string }) {
  const { pending } = useFormStatus();
  const future = startDate > today;
  return (
    <Button type="submit" loading={pending}>
      {future ? "Schedule meal prices" : "Change meal prices today"}
    </Button>
  );
}

function SubmitSimple({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending}>{children}</Button>;
}

function StateMessage({ state, ok }: { state: ConfigState; ok: string }) {
  if (state.ok) {
    return <span className="flex items-center gap-1 text-sm text-success"><CheckCircleIcon /> {ok}</span>;
  }
  if (state.error) {
    return <span role="alert" className="flex items-center gap-1 text-sm text-danger"><AlertCircleIcon /> {state.error}</span>;
  }
  return null;
}

export function PricingForm({ current, scheduled, counts, compliance, today }: Props) {
  const [pricingState, pricingAction] = useFormState(updatePricingAction, initialState);
  const [cancelState, cancelAction] = useFormState(cancelPricingAction, initialState);
  const [complianceState, complianceAction] = useFormState(updateComplianceAction, initialState);
  const [startDate, setStartDate] = useState(current.effectiveFrom ?? today);
  const affected = useMemo(() => ({
    noCost: count(counts.noCostStudentCount),
    lower: count(counts.lowerPriceStudentCount),
    full: count(counts.fullPriceStudentCount),
  }), [counts]);

  return (
    <div className="space-y-6">
      <form action={pricingAction} className="space-y-5 rounded-card border border-border bg-surface-card p-6">
        <div className="rounded-card border border-control-border bg-brand-wash p-4">
          <label className="flex min-h-touch items-start gap-3">
            <input type="checkbox" name="cepEnabled" defaultChecked={current.cepEnabled} className="mt-1 h-5 w-5" />
            <span>
              <span className="block font-medium text-ink">Free meals for all students is on</span>
              <span className="mt-1 block text-sm text-ink-muted">
                Breakfast and lunch cost nothing for every student, whatever their category. Snacks are still charged. This is how Woodbridge runs today.
              </span>
            </span>
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-base font-medium text-ink">Prices if free meals for all is turned off</legend>
          <p className="text-sm text-ink-muted">Kept ready so nothing has to be rebuilt if the district&apos;s status changes.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Money name="bFree" label="Breakfast, no-cost price" value={current.breakfastFreeCents} affected={affected.noCost} />
            <Money name="bReduced" label="Breakfast, lower price" value={current.breakfastReducedCents} affected={affected.lower} />
            <Money name="bPaid" label="Breakfast, full price" value={current.breakfastPaidCents} affected={affected.full} />
            <Money name="lFree" label="Lunch, no-cost price" value={current.lunchFreeCents} affected={affected.noCost} />
            <Money name="lReduced" label="Lunch, lower price" value={current.lunchReducedCents} affected={affected.lower} />
            <Money name="lPaid" label="Lunch, full price" value={current.lunchPaidCents} affected={affected.full} />
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="mealsThreshold">Warn families when they have fewer than this many meals left</Label>
            <Input
              id="mealsThreshold"
              name="mealsThreshold"
              type="number"
              min={0}
              step={1}
              defaultValue={current.lowBalanceMealsThreshold}
              required
            />
          </div>
          <Money name="threshold" label="Snack-money warning amount" value={current.lowBalanceThresholdCents} affected="Used when meals cost nothing" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="effectiveFrom">These prices start on</Label>
            <Input
              id="effectiveFrom"
              name="effectiveFrom"
              type="date"
              min={today}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pricingReason">Reason</Label>
            <Input id="pricingReason" name="reason" placeholder="Board-approved meal price change" required />
          </div>
        </div>

        <p className="rounded-control bg-brand-wash px-3 py-2 text-sm text-ink">{TRUST_COPY.priceChange}</p>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitPricing startDate={startDate} today={today} />
          <StateMessage state={pricingState} ok="Meal prices recorded" />
        </div>
      </form>

      {scheduled && scheduled.id && (
        <form action={cancelAction} className="space-y-3 rounded-card border border-control-border bg-warn-wash p-4">
          <input type="hidden" name="pricingConfigId" value={scheduled.id} />
          <div className="flex items-start gap-2 text-ink">
            <InfoIcon className="mt-1 shrink-0 text-warn" />
            <div>
              <h2 className="font-medium">Scheduled price change</h2>
              <p className="text-sm text-ink-muted">
                Starts on {scheduled.effectiveFrom}. Created by {scheduled.createdByName ?? "staff"}.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="cancelPricingReason">Reason for cancelling</Label>
              <Input id="cancelPricingReason" name="reason" required />
            </div>
            <div className="flex items-end">
              <SubmitSimple>Cancel scheduled prices</SubmitSimple>
            </div>
          </div>
          <StateMessage state={cancelState} ok="Scheduled price change cancelled" />
        </form>
      )}

      <form action={complianceAction} className="space-y-5 rounded-card border border-border bg-surface-card p-6">
        <div>
          <h2 className="text-lg font-medium text-ink">District claim settings</h2>
          <p className="mt-1 text-sm text-ink-muted">
            These numbers come from district compliance records and are shown here so meal-count checks can explain their math.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="identifiedStudentPercentage">Identified student percentage</Label>
            <div className="flex items-center gap-1">
              <Input
                id="identifiedStudentPercentage"
                name="identifiedStudentPercentage"
                inputMode="decimal"
                defaultValue={percent(compliance.identifiedStudentPercentageBps)}
                required
              />
              <span aria-hidden className="text-ink-muted">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="stateAttendanceFactor">Maximum-meal percentage</Label>
            <div className="flex items-center gap-1">
              <Input
                id="stateAttendanceFactor"
                name="stateAttendanceFactor"
                inputMode="decimal"
                defaultValue={percent(compliance.stateAttendanceFactorBps)}
                required
              />
              <span aria-hidden className="text-ink-muted">%</span>
            </div>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Where the maximum-meal percentage came from</legend>
          <label className="flex min-h-touch items-center gap-2">
            <input
              type="radio"
              name="stateAttendanceFactorProvenance"
              value="FNS_FEDERAL_DEFAULT"
              defaultChecked={compliance.stateAttendanceFactorProvenance === "FNS_FEDERAL_DEFAULT"}
            />
            <span>FNS federal default</span>
          </label>
          <label className="flex min-h-touch items-center gap-2">
            <input
              type="radio"
              name="stateAttendanceFactorProvenance"
              value="APPROVED_LOCAL"
              defaultChecked={compliance.stateAttendanceFactorProvenance === "APPROVED_LOCAL"}
            />
            <span>Approved Delaware or Woodbridge value</span>
          </label>
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="complianceReason">Reason</Label>
          <Input id="complianceReason" name="reason" placeholder="District compliance records updated" required />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitSimple>Update district percentages</SubmitSimple>
          <StateMessage state={complianceState} ok="District percentages updated" />
        </div>
      </form>
    </div>
  );
}
