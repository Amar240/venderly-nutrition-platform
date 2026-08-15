import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { ImportUploader } from "./import-uploader";

/** Infinite Campus student-list upload — super admin only. */
export default async function ImportPage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff" || session.role !== "SUPER_ADMIN") notFound();

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium text-ink">Upload student list</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Upload the student list from Infinite Campus. The whole file is checked before anything changes;
        birthdate, race, and gender are ignored and never stored.
      </p>
      <div className="mt-6">
        <ImportUploader />
      </div>
    </section>
  );
}
