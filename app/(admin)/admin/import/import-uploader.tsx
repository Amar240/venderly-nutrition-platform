"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircleIcon, AlertCircleIcon, AlertTriangleIcon, InfoIcon } from "@/components/icons";

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
            ? "That CSV is too large to import here. The prototype limit is 100 KB; export a smaller roster and try again."
            : res.status === 403
              ? "You are not allowed to import rosters."
              : "Upload failed. Please check the file and try again.";
        setError(message);
        setResult(null);
        return;
      }
      setResult((await res.json()) as ImportResult);
    } catch {
      setError("Upload failed.");
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
          <Label htmlFor="file">CSV file</Label>
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
          <Button type="submit" loading={busy} disabled={!file}>Validate &amp; import</Button>
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
      <span>{n} column{n === 1 ? "" : "s"} ignored by policy (birthdate, race/ethnicity, gender) — never stored.</span>
    </p>
  );
}

function ResultPanel({ result, onConfirm, busy }: { result: ImportResult; onConfirm: () => void; busy: boolean }) {
  if (result.status === "committed") {
    const c = result.counts;
    return (
      <div className="rounded-card border border-border bg-surface-card p-6">
        <p className="flex items-center gap-2 text-lg font-medium text-success"><CheckCircleIcon /> Import complete</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Created", c.created], ["Updated", c.updated], ["Marked inactive", c.inactive], ["Skipped", c.skipped]].map(([label, v]) => (
            <div key={label as string} className="rounded-control border border-border p-3">
              <div className="text-xs text-ink-muted">{label}</div>
              <div className="text-2xl font-medium tabular text-ink">{v as number}</div>
            </div>
          ))}
        </dl>
        {result.confirmed && <p className="mt-3 text-sm text-warn">Mass deactivation was confirmed and logged.</p>}
        <div className="mt-4"><PolicyLine n={result.ignoredColumns} /></div>
      </div>
    );
  }

  if (result.status === "needs_confirmation") {
    return (
      <div className="rounded-card border border-warn bg-warn-wash p-6">
        <p className="flex items-center gap-2 text-lg font-medium text-warn"><AlertTriangleIcon /> Confirmation required</p>
        <p className="mt-2 text-sm text-ink">
          This file would mark <span className="font-medium">{result.deactivateCount}</span> of{" "}
          <span className="font-medium">{result.activeCount}</span> active students inactive
          ({result.sharePct.toFixed(1)}%) — above the 10% safety threshold. This is what a truncated
          or partial upload looks like. Nothing has been written.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Would also create {result.plan.created}, update {result.plan.updated}, skip {result.plan.skipped}.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" variant="danger" loading={busy} onClick={onConfirm}>
            Confirm — deactivate {result.deactivateCount} and import
          </Button>
        </div>
        <div className="mt-4"><PolicyLine n={result.ignoredColumns} /></div>
      </div>
    );
  }

  // rejected
  return (
    <div className="rounded-card border border-danger bg-danger-wash p-6">
      <p className="flex items-center gap-2 text-lg font-medium text-danger"><AlertCircleIcon /> Not imported — fix and re-upload</p>
      <p className="mt-1 text-sm text-ink">Nothing was written. {result.errors.length} issue{result.errors.length === 1 ? "" : "s"}:</p>
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
                <td className="px-3 py-2 tabular text-ink-muted">{e.row ?? "—"}</td>
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
