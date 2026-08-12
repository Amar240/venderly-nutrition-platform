"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createSchoolAction, updateSchoolAction, type ConfigState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, AlertCircleIcon } from "@/components/icons";

interface SchoolRow { id: string; name: string; code: string }
const initial: ConfigState = { error: null, ok: false };

function Feedback({ state }: { state: ConfigState }) {
  if (state.ok) return <span className="flex items-center gap-1 text-sm text-success"><CheckCircleIcon /> Saved</span>;
  if (state.error) return <span className="flex items-center gap-1 text-sm text-danger"><AlertCircleIcon /> {state.error}</span>;
  return null;
}
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="md" loading={pending}>{children}</Button>;
}

export function SchoolsManager({ schools }: { schools: SchoolRow[] }) {
  const [createState, createAction] = useFormState(createSchoolAction, initial);
  return (
    <div className="space-y-6">
      <form action={createAction} className="rounded-card border border-border bg-surface-card p-4">
        <h2 className="text-sm font-medium text-ink">Add a school</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label htmlFor="ns-name">Name</Label><Input id="ns-name" name="name" required /></div>
          <div className="space-y-1"><Label htmlFor="ns-code">Code</Label><Input id="ns-code" name="code" required /></div>
          <Submit>Add</Submit>
          <Feedback state={createState} />
        </div>
      </form>

      <ul className="space-y-2">
        {schools.map((s) => <SchoolEditRow key={s.id} school={s} />)}
      </ul>
    </div>
  );
}

function SchoolEditRow({ school }: { school: SchoolRow }) {
  const [state, action] = useFormState(updateSchoolAction, initial);
  return (
    <li className="rounded-control border border-border p-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="schoolId" value={school.id} />
        <div className="space-y-1"><Label htmlFor={`sn-${school.id}`}>Name</Label><Input id={`sn-${school.id}`} name="name" defaultValue={school.name} required /></div>
        <div className="space-y-1"><Label htmlFor={`sc-${school.id}`}>Code</Label><Input id={`sc-${school.id}`} name="code" defaultValue={school.code} required /></div>
        <Submit>Save</Submit>
        <Feedback state={state} />
      </form>
    </li>
  );
}
