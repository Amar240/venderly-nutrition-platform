import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import {
  browseStudents,
  searchStudents,
  type StudentSearchResult,
} from "@/server/directory/adminStudents";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Student search, scoped to the session's schools (the server functions enforce
 * it). No eligibility or pricing tier anywhere, in either mode (D-1).
 *
 * With no query the page lists the roster instead of showing an empty table.
 * Search only helps someone who already knows a number or a surname; anyone
 * meeting this district for the first time has neither, and an empty box is a
 * dead end for them.
 */

const BROWSE_LIMIT = 50;

function StudentTable({
  rows,
  emptyMessage,
}: {
  rows: StudentSearchResult[];
  emptyMessage: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            <th scope="col" className="px-4 py-3 font-medium">Number</th>
            <th scope="col" className="px-4 py-3 font-medium">Name</th>
            <th scope="col" className="px-4 py-3 font-medium">Grade</th>
            <th scope="col" className="px-4 py-3 font-medium">School</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 tabular">
                <Link
                  href={`/admin/students/${s.id}`}
                  className="flex min-h-touch items-center text-brand hover:underline"
                >
                  {s.studentNumber}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink">{s.name}</td>
              <td className="px-4 py-3 text-ink-muted">{s.grade}</td>
              <td className="px-4 py-3 text-ink-muted">{s.schoolName}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-ink-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function StudentSearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = await getAppSession();
  const q = searchParams.q?.trim() ?? "";

  const results = q ? await searchStudents(session, q) : null;
  const browse = q ? null : await browseStudents(session, BROWSE_LIMIT);

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Students</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Search by student number or name, or pick someone from the list.
      </p>

      <form action="/admin/students" method="get" className="mt-6 flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Number or name" autoComplete="off" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {q && results && (
        <>
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink-muted" role="status">
              {results.length === 1
                ? `1 student matches "${q}".`
                : `${results.length} students match "${q}".`}
            </p>
            <Link
              href="/admin/students"
              className="flex min-h-touch items-center text-sm text-brand hover:underline"
            >
              Clear search
            </Link>
          </div>
          <StudentTable
            rows={results}
            emptyMessage={`No students match "${q}". Check the number, or search by name.`}
          />
        </>
      )}

      {browse && (
        <>
          <p className="mt-6 text-sm text-ink-muted" role="status">
            {browse.total > browse.shown
              ? `Showing the first ${browse.shown} of ${browse.total} students. Search to narrow the list.`
              : `${browse.total} ${browse.total === 1 ? "student" : "students"}.`}
          </p>
          <StudentTable
            rows={browse.students}
            emptyMessage="No students are enrolled at your schools yet."
          />
        </>
      )}
    </section>
  );
}
