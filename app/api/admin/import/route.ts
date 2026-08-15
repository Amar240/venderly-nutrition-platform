import { NextResponse, type NextRequest } from "next/server";
import { getAppSession } from "@/server/auth/session";
import { runImport } from "@/server/import/importStudents";
import { AuthError } from "@/server/auth/errors";
import { MAX_IMPORT_BYTES } from "@/server/import/validate";

/**
 * Roster import endpoint (super admin only). Multipart upload so large-ish files
 * aren't limited by the server-action body cap. Returns the import result as
 * JSON; the client handles the two-step mass-deactivation confirmation.
 */
export async function POST(req: NextRequest) {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff" || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_IMPORT_BYTES }, { status: 413 });
  }
  const confirmDeactivation = form.get("confirmDeactivation") === "true";
  const content = await file.text();

  try {
    const result = await runImport(session, { filename: file.name, content, confirmDeactivation });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
}
