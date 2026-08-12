import { redirect } from "next/navigation";
import { getAppSession } from "./session";
import { canEnterSurface, roleHome, type Surface } from "./navigation";
import type { AppSession } from "./types";

/**
 * Server-side gate for a route-group layout. Unauthenticated users go to
 * sign-in; authenticated users on the wrong surface are redirected to their
 * own home. RBAC is enforced here, not in the UI (CLAUDE.md rule 7).
 */
export async function requireSurface(surface: Surface): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) redirect("/signin");
  if (!canEnterSurface(session, surface)) redirect(roleHome(session));
  return session;
}
