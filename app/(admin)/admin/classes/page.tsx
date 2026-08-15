import { redirect } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import {
  getClassroomManagement,
  listClassroomSchools,
} from "@/server/classrooms/classrooms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClassroomManager } from "./classroom-manager";

const selectClass = "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-sm text-ink";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: { schoolId?: string };
}) {
  const session = await getAppSession();
  const schools = await listClassroomSchools(session);
  if (schools.length === 0) {
    return (
      <section>
        <h1 className="text-2xl font-medium text-ink">Classes</h1>
        <div className="mt-6 rounded-card border border-border bg-surface-card p-6">
          <h2 className="text-lg font-medium text-ink">Ask for a school assignment to get started</h2>
          <p className="mt-1 text-sm text-ink-muted">A district administrator can update staff access.</p>
        </div>
      </section>
    );
  }
  const schoolId = searchParams.schoolId ?? schools[0]!.id;
  if (!schools.some((school) => school.id === schoolId)) redirect("/admin/classes");
  const view = await getClassroomManagement(session, schoolId);

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Manage classes</h1>
      <p className="mt-1 text-sm text-ink-muted">Create teacher-named classes and keep student assignments current.</p>

      <form action="/admin/classes" method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="schoolId">School</Label>
          <select id="schoolId" name="schoolId" className={selectClass} defaultValue={schoolId}>
            {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary">Show classes</Button>
      </form>

      <div className="mt-6"><ClassroomManager view={view} /></div>
    </section>
  );
}
