"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signInAction, type SignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon } from "@/components/icons";

const initialState: SignInState = { error: null };

export function SignInForm() {
  const [state, formAction] = useFormState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control bg-danger-wash px-3 py-2 text-sm text-danger"
        >
          <AlertCircleIcon className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="totp">Authenticator code</Label>
        <Input
          id="totp"
          name="totp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          placeholder="Staff only"
          aria-describedby="totp-help"
        />
        <p id="totp-help" className="text-xs text-ink-muted">
          Staff accounts require a 6-digit code. Guardians can leave this blank.
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" loading={pending}>
      Sign in
    </Button>
  );
}
