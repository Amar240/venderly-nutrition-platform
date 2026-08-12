import { redirect } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { roleHome } from "@/server/auth/navigation";

/** Root dispatcher: send each principal to its permitted surface, or sign-in. */
export default async function HomePage() {
  const session = await getAppSession();
  if (!session) redirect("/signin");
  redirect(roleHome(session));
}
