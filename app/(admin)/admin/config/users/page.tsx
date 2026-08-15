import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { listStaffUsers } from "@/server/config/users";
import { listSchools } from "@/server/config/schools";
import { AuthError } from "@/server/auth/errors";
import { UsersManager } from "./users-manager";

export default async function UsersConfigPage() {
  const session = await getAppSession();
  let users, schools;
  try {
    [users, schools] = await Promise.all([listStaffUsers(session), listSchools(session)]);
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/admin/config" className="text-sm text-ink-muted hover:text-ink">← Settings</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Staff access</h1>
      <p className="mt-1 text-sm text-ink-muted">
        New staff get the shared demo password and a one-time authenticator secret. Access is turned off, never deleted.
      </p>
      <div className="mt-6">
        <UsersManager
          users={users}
          schools={schools.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>
    </section>
  );
}
