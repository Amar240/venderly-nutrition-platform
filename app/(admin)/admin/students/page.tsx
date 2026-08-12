import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { searchStudents } from "@/server/directory/adminStudents";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Student search — scoped to the session's schools (searchStudents enforces it).
 * Search by number or name. No eligibility / tier anywhere.
 */
export default async function StudentSearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = await getAppSession();
  const q = searchParams.q?.trim() ?? "";
  const results = q ? await searchStudents(session, q) : [];

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Students</h1>
      <p className="mt-1 text-sm text-ink-muted">Search by student number or name.</p>

      <form action="/admin/students" method="get" className="mt-6 flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Number or name" autoComplete="off" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {q && (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface-card">
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
              {results.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 tabular">
                    <Link href={`/admin/students/${s.id}`} className="text-brand hover:underline">
                      {s.studentNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{s.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.grade}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.schoolName}</td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-muted">
                    No students match “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
