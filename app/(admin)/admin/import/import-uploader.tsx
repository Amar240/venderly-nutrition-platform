"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircleIcon, AlertCircleIcon, AlertTriangleIcon, InfoIcon } from "@/components/icons";
import { TRUST_COPY } from "@/lib/presentation-labels";

interface RowError { row?: number; field?: string; message: string; studentNumber?: string }
type ImportResult =
  | { status: "rejected"; ignoredColumns: number; errors: RowError[] }
  | { status: "needs_confirmation"; ignoredColumns: number; plan: { created: number; updated: number; inactive: number; skipped: number }; deactivateCount: number; activeCount: number; sharePct: number }
  | { status: "committed"; ignoredColumns: number; counts: { created: number; updated: number; inactive: number; skipped: number; failed: number }; confirmed: boolean };

export function ImportUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(confirmDeactivation: boolean) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (confirmDeactivation) fd.set("confirmDeactivation", "true");
      const res = await fetch("/api/admin/import", { method: "POST", body: fd });
      if (!res.ok) {
        const message =
          res.status === 413
            ? "That file is larger than we can read. Ask for an export without extra columns."
            : res.status === 403
              ? "You don't have access to that. Ask a district administrator if you need it."
              : "That file could not be uploaded. Check the file and try again.";
        setError(message);
        setResult(null);
        return;
      }
      setResult((await res.json()) as ImportResult);
    } catch {
      setError("You've lost your connection. Nothing was lost. Try again when you're back online.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(false); }}
        className="rounded-card border border-border bg-surface-card p-6"
      >
        <div className="space-y-1">
          <Label htmlFor="file">Student list file</Label>
          <input
            id="file"
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }}
            className="block min-h-touch w-full text-sm text-ink file:mr-3 file:min-h-touch file:rounded-control file:border file:border-control-border file:bg-surface file:px-3 file:py-2 file:text-sm"
          />
        </div>
        <div className="mt-4">
          <Button type="submit" loading={busy} disabled={!file}>Upload student list</Button>
        </div>
        {error && <p className="mt-3 flex items-center gap-1 text-sm text-danger"><AlertCircleIcon /> {error}</p>}
      </form>

      {result && <ResultPanel result={result} onConfirm={() => void submit(true)} busy={busy} />}
    </div>
  );
}

function PolicyLine({ n }: { n: number }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink">
      <InfoIcon className="shrink-0 text-brand" />
      <span>{n === 3 ? TRUST_COPY.ignoredColumns : `${n} columns were ignored: date of birth, race, and gender. This system doesn't store them.`}</span>
    </p>
  );
}

function ResultPanel({ result, onConfirm, busy }: { result: ImportResult; onConfirm: () => void; busy: boolean }) {
  if (result.status === "committed") {
    const c = result.counts;
    return (
      <div className="rounded-card border border-border bg-surface-card p-6">
        <p className="flex items-center gap-2 text-lg font-medium text-success"><CheckCircleIcon /> Student list uploaded</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Added", c.created], ["Updated", c.updated], ["Marked as left", c.inactive], ["Already current", c.skipped]].map(([label, v]) => (
            <div key={label as string} className="rounded-control border border-border p-3">
              <div className="text-xs text-ink-muted">{label}</div>
              <div className="text-2xl font-medium tabular text-ink">{v as number}</div>
            </div>
          ))}
        </dl>
        {result.confirmed && <p className="mt-3 text-sm text-warn">A large group was marked as left and recorded for review.</p>}
        <div className="mt-4"><PolicyLine n={result.ignoredColumns} /></div>
      </div>
    );
  }

  if (result.status === "needs_confirmation") {
    return (
      <div className="rounded-card border border-warn bg-warn-wash p-6">
        <p className="flex items-center gap-2 text-lg font-medium text-warn"><AlertTriangleIcon /> Check before changing students</p>
        <p className="mt-2 text-sm text-ink">
          This file would mark <span className="font-medium">{result.deactivateCount}</span> of{" "}
          <span className="font-medium">{result.activeCount}</span> current students as left
          ({result.sharePct.toFixed(1)}%). That can happen when a file only has part of the district.
          Nothing has changed.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          It would also add {result.plan.created}, update {result.plan.updated}, and leave {result.plan.skipped} already current.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" variant="danger" loading={busy} onClick={onConfirm}>
            Mark {result.deactivateCount} students as left and upload
          </Button>
        </div>
        <div className="mt-4"><PolicyLine n={result.ignoredColumns} /></div>
      </div>
    );
  }

  // rejected
  return (
    <div className="rounded-card border border-danger bg-danger-wash p-6">
      <p className="flex items-center gap-2 text-lg font-medium text-danger"><AlertCircleIcon /> Student list needs changes</p>
      <p className="mt-1 text-sm text-ink">Nothing changed. Fix {result.errors.length} issue{result.errors.length === 1 ? "" : "s"} and upload again.</p>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-control border border-border bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="px-3 py-2 font-medium">Row</th>
              <th scope="col" className="px-3 py-2 font-medium">Field</th>
              <th scope="col" className="px-3 py-2 font-medium">Problem</th>
            </tr>
          </thead>
          <tbody>
            {result.errors.map((e, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-2 tabular text-ink-muted">{e.row ?? "None"}</td>
                <td className="px-3 py-2 text-ink-muted">{e.field ?? "file"}</td>
                <td className="px-3 py-2 text-ink">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4"><PolicyLine n={result.ignoredColumns} /></div>
    </div>
  );
}
