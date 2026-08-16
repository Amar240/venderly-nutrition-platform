"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon } from "@/components/icons";

const selectClass =
  "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-base text-ink";

interface ExportFormProps {
  schools: { id: string; name: string }[];
}

function filenameFromDisposition(disposition: string | null): string {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? "money-history.csv";
}

export function ExportForm({ schools }: ExportFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/transactions/export", { method: "POST", body: formData });
      if (!res.ok) {
        setError(
          res.status === 403
            ? "You don't have access to that. Ask a district administrator if you need it."
            : "The money history could not be downloaded. Check the filters and try again.",
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(res.headers.get("content-disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("You've lost your connection. Nothing was lost. Try again when you're back online.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="mt-6 space-y-4">
      <div className="space-y-1">
        <Label htmlFor="schoolId">School</Label>
        <select id="schoolId" name="schoolId" className={selectClass}>
          <option value="">All my schools</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" />
        </div>
      </div>
      <Button type="submit" loading={busy}>Download money history</Button>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertCircleIcon className="mt-1 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </form>
  );
}
