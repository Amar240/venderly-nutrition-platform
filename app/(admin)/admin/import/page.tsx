import { notFound } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { ImportUploader } from "./import-uploader";

/** Infinite Campus roster import — super admin only. */
export default async function ImportPage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff" || session.role !== "SUPER_ADMIN") notFound();

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium text-ink">Roster import</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Upload the Infinite Campus CSV export. The file is validated in full before anything is written;
        birthdate, race/ethnicity, and gender columns are dropped at parse and never stored.
      </p>
      <div className="mt-6">
        <ImportUploader />
      </div>
    </section>
  );
}
