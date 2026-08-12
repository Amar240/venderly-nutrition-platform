import { CheckCircleIcon, AlertTriangleIcon, AlertCircleIcon, InfoIcon } from "@/components/icons";

/**
 * Neutral POS result panel. It renders ONLY an operational outcome and, on a
 * recorded meal, the student's name/grade/school — never a price or eligibility
 * category. The tone is calm and non-judgmental (design-system + phase-4 spec).
 */
export type PosStatus =
  | "recorded"
  | "duplicate"
  | "not_active_at_school"
  | "insufficient_balance"
  | "rate_limited"
  | "error";

interface PosResultProps {
  status: PosStatus;
  studentName?: string;
  detail?: string; // e.g. "Grade 3 · Woodbridge Elementary"
}

const COPY: Record<PosStatus, { title: string; hint?: string }> = {
  recorded: { title: "Meal recorded" },
  duplicate: { title: "Already recorded", hint: "This meal is already recorded for today." },
  not_active_at_school: { title: "Not active at this school", hint: "Check the student number." },
  insufficient_balance: { title: "Not enough balance", hint: "This purchase can’t be completed." },
  rate_limited: { title: "Too many attempts", hint: "Please wait a moment and try again." },
  error: { title: "Something went wrong", hint: "Please try again." },
};

export function PosResult({ status, studentName, detail }: PosResultProps) {
  const copy = COPY[status];
  const tone =
    status === "recorded"
      ? { wash: "bg-success-wash", text: "text-success", Icon: CheckCircleIcon }
      : status === "error"
        ? { wash: "bg-danger-wash", text: "text-danger", Icon: AlertCircleIcon }
        : status === "not_active_at_school" || status === "insufficient_balance"
          ? { wash: "bg-warn-wash", text: "text-warn", Icon: AlertTriangleIcon }
          : { wash: "bg-brand-wash", text: "text-ink-muted", Icon: InfoIcon };

  return (
    <div role="status" aria-live="polite" className={`rounded-card ${tone.wash} p-6 text-center`}>
      <tone.Icon className={`mx-auto ${tone.text}`} />
      <p className="mt-2 text-2xl font-medium text-ink">{copy.title}</p>
      {status === "recorded" && studentName && (
        <p className="mt-1 text-lg text-ink">{studentName}</p>
      )}
      {status === "recorded" && detail && <p className="text-sm text-ink-muted">{detail}</p>}
      {status !== "recorded" && copy.hint && (
        <p className="mt-1 text-sm text-ink-muted">{copy.hint}</p>
      )}
    </div>
  );
}
