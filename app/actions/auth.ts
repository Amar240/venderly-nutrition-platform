"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export interface SignInState {
  error: string | null;
}

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      totp: String(formData.get("totp") ?? ""),
      redirectTo: "/",
    });
    return { error: null };
  } catch (err) {
    // A successful sign-in throws NEXT_REDIRECT, which must propagate.
    if (err instanceof AuthError) {
      // Generic message — never reveal which factor failed or whether the
      // account exists (avoids user enumeration).
      return {
        error:
          "Sign-in failed. Check your email, password, and — for staff — your authenticator code.",
      };
    }
    throw err;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
