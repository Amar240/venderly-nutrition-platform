import { InfoIcon } from "@/components/icons";

/**
 * Prototype-only keypad hints.
 *
 * The register is keyboard-first by design: a cashier knows the numbers. An
 * evaluator does not, and a numeric pad with nothing to type is a dead end —
 * the same problem the student list solves on the admin side.
 *
 * These four are seeded fixtures chosen to show the interesting outcomes, not
 * just the happy path: a clean record, a duplicate, and a student at another
 * school. Gated on the same flag as the sign-in codes so it disappears from
 * real use in one setting.
 */

const DEMO_STUDENTS = [
  { number: "100003", outcome: "Records cleanly" },
  { number: "100004", outcome: "Records cleanly" },
  { number: "100001", outcome: "Already had lunch today" },
  { number: "100002", outcome: "Enrolled at another school" },
] as const;

export function DemoStudents() {
  if (process.env.PROTOTYPE_SHOW_DEMO_CODES !== "true") return null;

  return (
    <div
      role="note"
      className="mx-auto mt-6 max-w-md rounded-card border border-control-border bg-warn-wash p-4 text-sm text-ink"
    >
      <div className="flex items-start gap-2">
        <InfoIcon className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">Numbers to try</p>
          <ul className="mt-2 space-y-1">
            {DEMO_STUDENTS.map((student) => (
              <li key={student.number} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular font-mono">{student.number}</span>
                <span className="text-ink-muted">{student.outcome}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
