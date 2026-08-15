import { NextResponse, type NextRequest } from "next/server";
import { getAppSession } from "@/server/auth/session";
import { listTransactions, transactionsToCsv } from "@/server/reports/transactions";
import { writeAudit } from "@/server/audit/log";
import { AuthError } from "@/server/auth/errors";

/**
 * Transaction CSV export. POST (not GET) so a prefetch can't fire it. Permission
 * is checked (staff + school scope via listTransactions) AND every export writes
 * an audit entry recording who, what filters, and when. No pricing tier column.
 */
export async function POST(req: NextRequest) {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const schoolId = String(form.get("schoolId") ?? "").trim() || undefined;
  const fromStr = String(form.get("from") ?? "").trim();
  const toStr = String(form.get("to") ?? "").trim();
  const from = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59.999Z`) : undefined;

  let rows;
  try {
    rows = await listTransactions(session, { schoolId, from, to });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }

  const csv = transactionsToCsv(rows);

  await writeAudit({
    actorType: "USER",
    actorId: session.userId,
    action: "EXPORT_TRANSACTIONS",
    subjectType: "report",
    districtId: session.districtId,
    after: { filters: { schoolId: schoolId ?? "all", from: fromStr || null, to: toStr || null }, rowCount: rows.length },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="money-history-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
