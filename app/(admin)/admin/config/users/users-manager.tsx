"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createUserAction, updateUserAction, toggleUserDisabledAction, type ConfigState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, AlertCircleIcon, InfoIcon } from "@/components/icons";

interface SchoolOpt { id: string; name: string }
interface UserRow { id: string; email: string; name: string; role: string; schoolIds: string[]; disabled: boolean }
const initial: ConfigState = { error: null, ok: false };
const ROLES = ["CASHIER", "SCHOOL_STAFF", "DISTRICT_ADMIN", "SUPER_ADMIN"];
const selectClass = "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-base text-ink";

function Feedback({ state }: { state: ConfigState }) {
  if (state.ok) return <span className="flex items-center gap-1 text-sm text-success"><CheckCircleIcon /> Saved</span>;
  if (state.error) return <span className="flex items-center gap-1 text-sm text-danger"><AlertCircleIcon /> {state.error}</span>;
  return null;
}
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="md" loading={pending}>{children}</Button>;
}
function SchoolChecks({ schools, selected }: { schools: SchoolOpt[]; selected: string[] }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm text-ink-muted">Schools</legend>
      <div className="flex flex-wrap gap-3">
        {schools.map((s) => (
          <label key={s.id} className="flex items-center gap-1 text-sm text-ink">
            <input type="checkbox" name="schoolIds" value={s.id} defaultChecked={selected.includes(s.id)} className="h-4 w-4" />
            {s.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function UsersManager({ users, schools }: { users: UserRow[]; schools: SchoolOpt[] }) {
  const [createState, createAction] = useFormState(createUserAction, initial);
  return (
    <div className="space-y-6">
      <form action={createAction} className="space-y-3 rounded-card border border-border bg-surface-card p-4">
        <h2 className="text-sm font-medium text-ink">Add a staff user</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="nu-email">Email</Label><Input id="nu-email" name="email" type="email" required /></div>
          <div className="space-y-1"><Label htmlFor="nu-first">First name</Label><Input id="nu-first" name="firstName" required /></div>
          <div className="space-y-1"><Label htmlFor="nu-last">Last name</Label><Input id="nu-last" name="lastName" required /></div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="nu-role">Role</Label>
          <select id="nu-role" name="role" className={selectClass} required defaultValue="CASHIER">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <SchoolChecks schools={schools} selected={[]} />
        <div className="flex items-center gap-3"><Submit>Create user</Submit><Feedback state={createState} /></div>
        {createState.totpSecret && (
          <div className="flex items-start gap-2 rounded-control bg-warn-wash px-3 py-2 text-sm text-ink">
            <InfoIcon className="mt-0.5 shrink-0 text-warn" />
            <span>
              TOTP secret (shown once, cannot be retrieved): <code className="font-medium">{createState.totpSecret}</code>.
              Add it to an authenticator app now. Password is the shared demo password.
            </span>
          </div>
        )}
      </form>

      <ul className="space-y-2">
        {users.map((u) => <UserEditRow key={u.id} user={u} schools={schools} />)}
      </ul>
    </div>
  );
}

function UserEditRow({ user, schools }: { user: UserRow; schools: SchoolOpt[] }) {
  const [saveState, saveAction] = useFormState(updateUserAction, initial);
  const [toggleState, toggleAction] = useFormState(toggleUserDisabledAction, initial);
  return (
    <li className={`rounded-control border border-border p-3 ${user.disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-medium text-ink">{user.name}</span>
          <span className="ml-2 text-sm text-ink-muted">{user.email}</span>
          {user.disabled && <span className="ml-2 rounded-pill bg-danger-wash px-2 py-0.5 text-xs text-danger">Disabled</span>}
        </div>
        <form action={toggleAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="disabled" value={user.disabled ? "false" : "true"} />
          <Button type="submit" variant={user.disabled ? "primary" : "danger"} size="md">
            {user.disabled ? "Reactivate" : "Deactivate"}
          </Button>
        </form>
      </div>
      <form action={saveAction} className="mt-3 space-y-2">
        <input type="hidden" name="userId" value={user.id} />
        <div className="space-y-1">
          <Label htmlFor={`role-${user.id}`}>Role</Label>
          <select id={`role-${user.id}`} name="role" className={selectClass} defaultValue={user.role}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <SchoolChecks schools={schools} selected={user.schoolIds} />
        <div className="flex items-center gap-3"><Submit>Save</Submit><Feedback state={saveState.ok || saveState.error ? saveState : toggleState} /></div>
      </form>
    </li>
  );
}
