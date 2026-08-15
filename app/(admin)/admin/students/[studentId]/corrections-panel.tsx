"use client";

import { useId, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  commitCorrectionAction,
  completeFollowUpAction,
  overrideAction,
  reviewCorrectionAction,
  type CorrectionState,
} from "./actions";
import type { CorrectionCandidate, CorrectionFollowUp, SituationChoice } from "@/server/corrections/situationCorrections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { TRUST_COPY } from "@/lib/presentation-labels";
import { formatCents, parseDollarsToCents } from "@/lib/utils";

const initial: CorrectionState = { error: null, ok: false, review: null };
const selectClass =
  "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-base text-ink";

const SITUATIONS: { value: SituationChoice; label: string; needs: "snack" | "any" | "none" }[] = [
  { value: "CHARGED_TWICE", label: "Charged twice for a snack", needs: "snack" },
  { value: "WRONG_STUDENT", label: "Wrong student charged", needs: "snack" },
  { value: "SNACK_RETURNED", label: "Snack was returned", needs: "snack" },
  { value: "SOMETHING_ELSE", label: "Something else", needs: "any" },
  { value: "DISTRICT_DECISION", label: "District decision to add or take money", needs: "none" },
];

export function CorrectionsPanel({
  studentId,
  snackCharges,
  paymentsAndCharges,
  followUps,
}: {
  studentId: string;
  snackCharges: CorrectionCandidate[];
  paymentsAndCharges: CorrectionCandidate[];
  followUps: CorrectionFollowUp[];
}) {
  return (
    <div className="rounded-card border border-border bg-surface-card p-6">
      <h2 className="text-lg font-medium text-ink">Fix a mistake</h2>
      <p className="mt-1 text-sm text-ink-muted">{TRUST_COPY.correction}</p>
      <div className="mt-4 space-y-4">
        {followUps.length > 0 && <FollowUps studentId={studentId} followUps={followUps} />}
        <SituationForm
          studentId={studentId}
          snackCharges={snackCharges}
          paymentsAndCharges={paymentsAndCharges}
        />
        <OverrideForm studentId={studentId} />
      </div>
    </div>
  );
}

function Feedback({ state }: { state: CorrectionState }) {
  if (state.ok) {
    return (
      <p className="flex items-center gap-1 text-sm text-success" role="status">
        <CheckCircleIcon /> {state.message ?? "Recorded."}
      </p>
    );
  }
  if (state.error) {
    return (
      <p className="flex items-center gap-1 text-sm text-danger" role="alert">
        <AlertCircleIcon /> {state.error}
      </p>
    );
  }
  return null;
}

function PendingButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" loading={pending} className={className}>
      {children}
    </Button>
  );
}

function SituationForm({
  studentId,
  snackCharges,
  paymentsAndCharges,
}: {
  studentId: string;
  snackCharges: CorrectionCandidate[];
  paymentsAndCharges: CorrectionCandidate[];
}) {
  const [reviewState, reviewAction] = useFormState(reviewCorrectionAction, initial);
  const [commitState, commitAction] = useFormState(commitCorrectionAction, initial);
  const formPrefix = useId();
  const [situation, setSituation] = useState<SituationChoice>("SNACK_RETURNED");
  const [originalEntryId, setOriginalEntryId] = useState("");
  const [targetStudentNumber, setTargetStudentNumber] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState("add");
  const [reason, setReason] = useState("Snack was returned");

  const selected = SITUATIONS.find((item) => item.value === situation)!;
  const candidates = selected.needs === "snack" ? snackCharges : paymentsAndCharges;
  const candidateRequired = selected.needs !== "none";

  function updateSituation(value: SituationChoice) {
    setSituation(value);
    setOriginalEntryId("");
    const option = SITUATIONS.find((item) => item.value === value);
    setReason(option?.label ?? "");
  }

  const hiddenFields = (
    <>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="situation" value={situation} />
      <input type="hidden" name="originalEntryId" value={originalEntryId} />
      <input type="hidden" name="targetStudentNumber" value={targetStudentNumber} />
      <input type="hidden" name="expectedAmount" value={expectedAmount} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="reason" value={reason} />
    </>
  );

  return (
    <section className="rounded-control border border-border p-4">
      <h3 className="text-sm font-medium text-ink">What happened?</h3>
      <form action={reviewAction} className="mt-3 space-y-3">
        <input type="hidden" name="studentId" value={studentId} />
        <fieldset className="space-y-2">
          <legend className="sr-only">What happened?</legend>
          {SITUATIONS.map((item) => (
            <label
              key={item.value}
              className="flex min-h-touch cursor-pointer items-center gap-2 rounded-control border border-control-border px-3 py-2 text-sm text-ink focus-within:ring-2 focus-within:ring-focus"
            >
              <input
                type="radio"
                name="situation"
                value={item.value}
                checked={situation === item.value}
                onChange={() => updateSituation(item.value)}
              />
              {item.label}
            </label>
          ))}
        </fieldset>

        {candidateRequired && (
          <div className="space-y-1">
            <Label htmlFor={`${formPrefix}-entry`}>Payment or charge</Label>
            <select
              id={`${formPrefix}-entry`}
              name="originalEntryId"
              className={selectClass}
              required
              value={originalEntryId}
              onChange={(event) => setOriginalEntryId(event.target.value)}
            >
              <option value="">Choose a payment or charge...</option>
              {candidates.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            {candidates.length === 0 && (
              <p className="text-sm text-ink-muted">
                Nothing here can be fixed this way. Use the district decision option only when there is no matching payment or charge.
              </p>
            )}
          </div>
        )}

        {situation === "WRONG_STUDENT" && (
          <div className="space-y-1">
            <Label htmlFor={`${formPrefix}-target`}>Student who should have been charged</Label>
            <Input
              id={`${formPrefix}-target`}
              name="targetStudentNumber"
              inputMode="numeric"
              required
              value={targetStudentNumber}
              onChange={(event) => setTargetStudentNumber(event.target.value)}
            />
          </div>
        )}

        {situation === "SOMETHING_ELSE" && (
          <div className="space-y-1">
            <Label htmlFor={`${formPrefix}-expected`}>What should the amount have been?</Label>
            <div className="flex items-center gap-1">
              <span aria-hidden className="text-ink-muted">$</span>
              <Input
                id={`${formPrefix}-expected`}
                name="expectedAmount"
                inputMode="decimal"
                placeholder="0.00"
                required
                value={expectedAmount}
                onChange={(event) => setExpectedAmount(event.target.value)}
              />
            </div>
          </div>
        )}

        {situation === "DISTRICT_DECISION" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${formPrefix}-direction`}>What should happen?</Label>
              <select
                id={`${formPrefix}-direction`}
                name="direction"
                className={selectClass}
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="add">Add money</option>
                <option value="take">Take money</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${formPrefix}-amount`}>Amount</Label>
              <div className="flex items-center gap-1">
                <span aria-hidden className="text-ink-muted">$</span>
                <Input
                  id={`${formPrefix}-amount`}
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor={`${formPrefix}-reason`}>Reason saved with your name</Label>
          <Input
            id={`${formPrefix}-reason`}
            name="reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <PendingButton className="w-full sm:w-auto">Review what will happen</PendingButton>
        <Feedback state={reviewState} />
      </form>

      {reviewState.review && (
        <form action={commitAction} className="mt-4 rounded-control border border-brand bg-brand-wash p-4">
          {hiddenFields}
          <h4 className="text-sm font-medium text-ink">Here&apos;s what will happen</h4>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {reviewState.review.lines.map((line) => (
              <li key={line} className="flex gap-2">
                <CheckCircleIcon />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <PendingButton className="mt-3 w-full sm:w-auto">{reviewState.review.confirmLabel}</PendingButton>
          <Feedback state={commitState} />
        </form>
      )}
    </section>
  );
}

function FollowUps({ studentId, followUps }: { studentId: string; followUps: CorrectionFollowUp[] }) {
  const [state, action] = useFormState(completeFollowUpAction, initial);
  return (
    <section className="rounded-control border border-warn bg-warn-wash p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
        <AlertCircleIcon /> A charge is still waiting
      </h3>
      <div className="mt-3 space-y-3">
        {followUps.map((item) => (
          <form key={item.id} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="caseId" value={item.id} />
            <p className="text-sm text-ink">
              {item.targetName} still needs to be charged {formatCents(item.amountCents)} for {item.itemName}.
            </p>
            <PendingButton>Charge {item.targetName.split(" ")[0]} {formatCents(item.amountCents)}</PendingButton>
          </form>
        ))}
      </div>
      <Feedback state={state} />
    </section>
  );
}

function OverrideForm({ studentId }: { studentId: string }) {
  const [state, action] = useFormState(overrideAction, initial);
  return (
    <section className="rounded-control border border-border p-4">
      <h3 className="text-sm font-medium text-ink">Record another meal</h3>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="override-meal">Meal</Label>
            <select id="override-meal" name="mealType" className={selectClass} required>
              <option value="">Choose a meal...</option>
              <option value="BREAKFAST">Breakfast</option>
              <option value="LUNCH">Lunch</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="override-date">Meal date</Label>
            <Input id="override-date" name="serviceDate" type="date" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="override-reason">Reason saved with your name</Label>
          <Input id="override-reason" name="reason" required />
        </div>
        <PendingButton>{overrideButtonLabel()}</PendingButton>
        <Feedback state={state} />
      </form>
    </section>
  );
}

function overrideButtonLabel() {
  return "Record another meal";
}
