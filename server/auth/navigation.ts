import type { AppSession } from "./types";

/** Which surfaces a role may enter. Enforced by each route-group layout. */
export type Surface = "guardian" | "pos" | "admin";

export function allowedSurface(session: AppSession): Surface {
  if (session.principalType === "guardian") return "guardian";
  switch (session.role) {
    case "CASHIER":
      return "pos";
    case "SCHOOL_STAFF":
    case "DISTRICT_ADMIN":
    case "SUPER_ADMIN":
      return "admin";
  }
}

export function surfaceHref(surface: Surface): string {
  return `/${surface}`;
}

/** Post-sign-in landing path for a session. */
export function roleHome(session: AppSession): string {
  return surfaceHref(allowedSurface(session));
}

export function canEnterSurface(session: AppSession, surface: Surface): boolean {
  return allowedSurface(session) === surface;
}
