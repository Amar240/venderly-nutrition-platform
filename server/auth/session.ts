import { auth } from "@/auth";
import type { AppSession } from "./types";

/**
 * The authenticated principal for the current request, or null. Server
 * components, layouts, route handlers, and server actions read RBAC state
 * from here — never from client-supplied values.
 */
export async function getAppSession(): Promise<AppSession | null> {
  const session = await auth();
  return session?.appSession ?? null;
}
