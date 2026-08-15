import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { listSchools } from "@/server/config/schools";
import { AuthError } from "@/server/auth/errors";
import { SchoolsManager } from "./schools-manager";

export default async function SchoolsConfigPage() {
  const session = await getAppSession();
  let schools;
  try {
    schools = await listSchools(session);
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }
  return (
    <section className="mx-auto max-w-2xl">
      <Link href="/admin/config" className="text-sm text-ink-muted hover:text-ink">← Settings</Link>
      <h1 className="mt-2 text-2xl font-medium text-ink">Schools</h1>
      <div className="mt-6">
        <SchoolsManager schools={schools.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          breakfastServiceEndMinutes: s.breakfastServiceEndMinutes,
          lunchServiceEndMinutes: s.lunchServiceEndMinutes,
        }))} />
      </div>
    </section>
  );
}
