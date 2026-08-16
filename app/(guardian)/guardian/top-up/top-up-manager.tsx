"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  cancelAutoTopUpAction,
  saveAutoTopUpAction,
  type AutoTopUpState,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon, CheckCircleIcon, InfoIcon } from "@/components/icons";
import { formatCents, parseDollarsToCents } from "@/lib/utils";

interface TopUpChild {
  studentId: string;
  name: string;
  schoolName: string;
  lunchPriceCents: number;
}

interface Rule {
  id: string;
  studentId: string;
  triggerBalanceCents: number;
  topUpAmountCents: number;
  monthlyCeilingCents: number;
}

const initialState: AutoTopUpState = { error: null };

function centsInput(cents: number | undefined) {
  return cents === undefined ? "" : (cents / 100).toFixed(2);
}

export function TopUpManager({ students, rules }: { students: TopUpChild[]; rules: Rule[] }) {
  return (
    <div className="space-y-4">
      {students.map((child) => (
        <TopUpCard
          key={child.studentId}
          child={child}
          rule={rules.find((rule) => rule.studentId === child.studentId)}
        />
      ))}
    </div>
  );
}

function TopUpCard({ child, rule }: { child: TopUpChild; rule?: Rule }) {
  const [saveState, saveAction] = useFormState(saveAutoTopUpAction, initialState);
  const [cancelState, cancelAction] = useFormState(cancelAutoTopUpAction, initialState);
  const [triggerBalance, setTriggerBalance] = useState(centsInput(rule?.triggerBalanceCents));
  const [topUpAmount, setTopUpAmount] = useState(centsInput(rule?.topUpAmountCents));
  const [monthlyCeiling, setMonthlyCeiling] = useState(centsInput(rule?.monthlyCeilingCents));
  const topUpCents = parseDollarsToCents(topUpAmount);
  const accountLabel = child.lunchPriceCents === 0 ? "snack money" : "meal account";

  return (
    <article className="rounded-card border border-border bg-surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">{child.name}</h2>
          <p className="text-sm text-ink-muted">{child.schoolName}</p>
        </div>
        {rule && (
          <p className="flex items-center gap-2 rounded-control bg-success-wash px-3 py-2 text-sm text-success">
            <CheckCircleIcon className="shrink-0" />
            Automatic top-up is on
          </p>
        )}
      </div>

      {rule && (
        <p className="mt-4 flex gap-2 rounded-control bg-brand-wash p-3 text-sm text-ink">
          <InfoIcon className="mt-0.5 shrink-0 text-brand" />
          <span>
            When {child.name}&apos;s {accountLabel} drops below {formatCents(rule.triggerBalanceCents)}, add{" "}
            {formatCents(rule.topUpAmountCents)}. This stops for the month at{" "}
            {formatCents(rule.monthlyCeilingCents)}.
          </span>
        </p>
      )}

      {saveState.error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-control bg-danger-wash p-3 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 shrink-0" />
          <span>{saveState.error}</span>
        </p>
      )}
      {saveState.saved && (
        <p role="status" className="mt-4 flex gap-2 rounded-control bg-success-wash p-3 text-sm text-success">
          <CheckCircleIcon className="mt-0.5 shrink-0" />
          <span>Automatic top-up is saved for {child.name}.</span>
        </p>
      )}
      {cancelState.error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-control bg-danger-wash p-3 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 shrink-0" />
          <span>{cancelState.error}</span>
        </p>
      )}
      {cancelState.saved && (
        <p role="status" className="mt-4 flex gap-2 rounded-control bg-success-wash p-3 text-sm text-success">
          <CheckCircleIcon className="mt-0.5 shrink-0" />
          <span>Automatic top-up is stopped for {child.name}.</span>
        </p>
      )}

      <form action={saveAction} className="mt-5 grid gap-4 sm:grid-cols-3">
        <input type="hidden" name="studentId" value={child.studentId} />
        <MoneyField
          id={`trigger-${child.studentId}`}
          name="triggerBalance"
          label={`When ${accountLabel} drops below`}
          value={triggerBalance}
          onChange={setTriggerBalance}
        />
        <MoneyField
          id={`amount-${child.studentId}`}
          name="topUpAmount"
          label="Add this amount"
          value={topUpAmount}
          onChange={setTopUpAmount}
        />
        <MoneyField
          id={`ceiling-${child.studentId}`}
          name="monthlyCeiling"
          label="Monthly limit"
          value={monthlyCeiling}
          onChange={setMonthlyCeiling}
        />
        <div className="sm:col-span-3">
          <SaveButton amountCents={topUpCents && topUpCents > 0 ? topUpCents : null} />
        </div>
      </form>

      {rule && (
        <form action={cancelAction} className="mt-3">
          <input type="hidden" name="ruleId" value={rule.id} />
          <CancelButton />
        </form>
      )}
    </article>
  );
}

function MoneyField({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <span aria-hidden className="text-ink-muted">$</span>
        <Input
          id={id}
          name={name}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function SaveButton({ amountCents }: { amountCents: number | null }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full sm:w-auto" loading={pending}>
      {amountCents ? `Save ${formatCents(amountCents)} top-up` : "Save automatic top-up"}
    </Button>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" className="w-full sm:w-auto" loading={pending}>
      Stop automatic top-up
    </Button>
  );
}
