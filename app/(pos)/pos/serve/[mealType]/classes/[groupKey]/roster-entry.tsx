"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MealType } from "@prisma/client";
import type { RosterGroupView } from "@/server/meals/roster";
import {
  recordRosterBatchAction,
  undoRosterBatchAction,
} from "../../../../actions";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type UndoReceipt = {
  batchId: string;
  expiresAt: string;
  count: number;
  studentIds: string[];
};

function mealWord(mealType: MealType, count: number): string {
  const singular = mealType === "BREAKFAST" ? "breakfast" : "lunch";
  if (count === 1) return singular;
  return mealType === "BREAKFAST" ? "breakfasts" : "lunches";
}

export function RosterEntry({
  mealType,
  mealLabel,
  initialRoster,
}: {
  mealType: MealType;
  mealLabel: string;
  initialRoster: RosterGroupView;
}) {
  const router = useRouter();
  const [students, setStudents] = useState(initialRoster.students);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [undoPending, setUndoPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [undo, setUndo] = useState<UndoReceipt | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const alertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setStudents(initialRoster.students);
    setSelected((current) => new Set(
      [...current].filter((id) => !initialRoster.students.find((student) => student.id === id)?.alreadyRecorded),
    ));
  }, [initialRoster.students]);

  useEffect(() => {
    if (!undo) return;
    const expiresAt = Date.parse(undo.expiresAt);
    const tick = () => {
      const now = Date.now();
      setClockMs(now);
      if (now >= expiresAt) setUndo(null);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [undo]);

  const alreadyDone = useMemo(
    () => students.filter((student) => student.alreadyRecorded).length,
    [students],
  );
  const notEating = students.length - alreadyDone - selected.size;
  const secondsRemaining = undo
    ? Math.max(0, Math.ceil((Date.parse(undo.expiresAt) - clockMs) / 1000))
    : 0;

  function toggle(studentId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
    setError(null);
  }

  async function recordSelected() {
    if (pending || selected.size === 0) return;
    const studentIds = [...selected];
    setPending(true);
    setError(null);
    try {
      const result = await recordRosterBatchAction(mealType, initialRoster.groupKey, studentIds);
      if (result.status === "recorded") {
        setStudents((current) => current.map((student) => (
          studentIds.includes(student.id) ? { ...student, alreadyRecorded: true } : student
        )));
        setSelected(new Set());
        setUndo({ ...result.undo, count: result.recordedCount, studentIds });
        setAnnouncement(`${result.recordedCount} ${mealWord(mealType, result.recordedCount)} recorded.`);
        window.requestAnimationFrame(() => undoRef.current?.focus());
      } else {
        setError(result.message);
        setAnnouncement(result.message);
        window.requestAnimationFrame(() => alertRef.current?.focus());
      }
      router.refresh();
    } catch {
      const message = "The class could not be recorded, so nothing changed and you can try again.";
      setError(message);
      setAnnouncement(message);
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  async function undoBatch() {
    if (!undo || undoPending) return;
    setUndoPending(true);
    try {
      const result = await undoRosterBatchAction(undo.batchId);
      if (result.status === "undone") {
        setStudents((current) => current.map((student) => (
          undo.studentIds.includes(student.id) ? { ...student, alreadyRecorded: false } : student
        )));
        setAnnouncement(`${result.recordedCount} ${mealWord(mealType, result.recordedCount)} undone.`);
        setUndo(null);
        router.refresh();
        window.requestAnimationFrame(() => headingRef.current?.focus());
      } else {
        const message = result.status === "unavailable"
          ? "That meal can no longer be undone here, so ask an administrator to fix the mistake."
          : "The meals could not be undone, so check the class and try again.";
        setError(message);
        setAnnouncement(message);
        setUndo(null);
        window.requestAnimationFrame(() => alertRef.current?.focus());
      }
    } finally {
      setUndoPending(false);
    }
  }

  return (
    <div className="mt-4 pb-12">
      <p className="text-sm font-medium text-brand">{mealLabel}</p>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-medium text-ink">
        {initialRoster.teacherName}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {initialRoster.grade ? `Grade ${initialRoster.grade} · ` : ""}{initialRoster.schoolName}
      </p>
      <p className="mt-3 text-base text-ink">Tap each child who ate.</p>

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      {error && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-control bg-danger-wash px-3 py-2 text-sm text-danger"
        >
          <AlertCircleIcon className="mt-1 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {students.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {students.map((student) => {
            const isSelected = selected.has(student.id);
            if (student.alreadyRecorded) {
              return (
                <div
                  key={student.id}
                  aria-disabled="true"
                  className="flex min-h-touch flex-col items-center justify-center rounded-card border border-border bg-surface px-3 py-3 text-center text-ink-muted opacity-60"
                >
                  <span className="text-base font-medium">{student.firstName} {student.lastInitial}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs"><CheckCircleIcon /> already recorded</span>
                </div>
              );
            }
            return (
              <button
                key={student.id}
                type="button"
                aria-pressed={isSelected}
                disabled={pending}
                onClick={() => toggle(student.id)}
                className={cn(
                  "flex min-h-touch items-center justify-center gap-2 rounded-card border px-3 py-3 text-center text-base font-medium",
                  isSelected
                    ? "border-brand bg-brand text-white"
                    : "border-control-border bg-surface-card text-ink hover:bg-brand-wash",
                )}
              >
                {isSelected && <CheckCircleIcon className="shrink-0" />}
                <span>{student.firstName} {student.lastInitial}</span>
                {isSelected && <span className="sr-only">selected</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-card border border-border bg-surface-card p-6 text-center">
          <h2 className="text-lg font-medium text-ink">Assign students to this class to get started</h2>
          <p className="mt-1 text-sm text-ink-muted">Ask school staff to update the class assignments.</p>
        </div>
      )}

      <footer className="sticky bottom-0 mt-6 rounded-card border border-control-border bg-surface-card p-4">
        <p className="text-center text-sm text-ink" aria-live="polite">
          {selected.size} selected · {notEating} not eating · {alreadyDone} already done
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-3 w-full"
          disabled={selected.size === 0}
          loading={pending}
          onClick={() => void recordSelected()}
        >
          {selected.size === 0
            ? `Choose students for ${mealLabel.toLocaleLowerCase()}`
            : `Record ${selected.size} ${mealWord(mealType, selected.size)}.`}
        </Button>
        {undo && (
          <div className="mt-3 border-t border-border pt-3">
            <Button
              ref={undoRef}
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              loading={undoPending}
              onClick={() => void undoBatch()}
            >
              Undo {undo.count} {mealWord(mealType, undo.count)}
            </Button>
            <p className="mt-1 text-center text-sm text-ink-muted" aria-live="off">
              Available for {secondsRemaining} seconds
            </p>
          </div>
        )}
      </footer>
    </div>
  );
}
