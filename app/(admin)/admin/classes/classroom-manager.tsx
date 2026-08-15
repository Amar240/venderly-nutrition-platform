"use client";

import { useFormState } from "react-dom";
import type { ClassroomManagementView } from "@/server/classrooms/classrooms";
import {
  assignStudentClassroomAction,
  createClassroomAction,
  setClassroomActiveAction,
  type ClassroomActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

const INITIAL: ClassroomActionState = { ok: false, error: null };
const selectClass = "min-h-touch w-full rounded-control border border-control-border bg-surface-card px-3 py-2 text-sm text-ink";

function Feedback({ state }: { state: ClassroomActionState }) {
  if (state.error) {
    return <p role="alert" className="mt-2 flex items-start gap-1 text-sm text-danger"><AlertCircleIcon className="mt-1 shrink-0" /> {state.error}</p>;
  }
  if (state.ok) {
    return <p role="status" className="mt-2 flex items-center gap-1 text-sm text-success"><CheckCircleIcon /> Updated</p>;
  }
  return null;
}

function ClassroomStatusForm({ classroom }: { classroom: ClassroomManagementView["classrooms"][number] }) {
  const [state, action] = useFormState(setClassroomActiveAction, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="classroomId" value={classroom.id} />
      <input type="hidden" name="active" value={classroom.active ? "false" : "true"} />
      <Button type="submit" variant="secondary">
        {classroom.active ? "Stop using class" : "Use class again"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

function StudentAssignmentForm({
  student,
  classrooms,
}: {
  student: ClassroomManagementView["students"][number];
  classrooms: ClassroomManagementView["classrooms"];
}) {
  const [state, action] = useFormState(assignStudentClassroomAction, INITIAL);
  const currentValue = student.needsAssignment ? "" : (student.classroomId ?? "");
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="studentId" value={student.id} />
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={`classroom-${student.id}`}>Class for {student.name}</Label>
        <select
          id={`classroom-${student.id}`}
          name="classroomId"
          className={selectClass}
          defaultValue={currentValue}
        >
          <option value="">Needs class assignment</option>
          {classrooms.filter((classroom) => classroom.active).map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.teacherName}{classroom.grade ? ` · Grade ${classroom.grade}` : ""}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary">Update {student.name}</Button>
      <Feedback state={state} />
    </form>
  );
}

export function ClassroomManager({ view }: { view: ClassroomManagementView }) {
  const [createState, createAction] = useFormState(createClassroomAction, INITIAL);
  return (
    <div className="space-y-8">
      <form action={createAction} className="rounded-card border border-border bg-surface-card p-4">
        <input type="hidden" name="schoolId" value={view.school.id} />
        <h2 className="text-lg font-medium text-ink">Create a class</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="teacherName">Teacher name</Label>
            <Input id="teacherName" name="teacherName" required maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grade">Grade (optional)</Label>
            <Input id="grade" name="grade" maxLength={20} />
          </div>
          <Button type="submit">Create class</Button>
        </div>
        <Feedback state={createState} />
      </form>

      <section aria-labelledby="class-list-heading">
        <h2 id="class-list-heading" className="text-lg font-medium text-ink">Classes at {view.school.name}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {view.classrooms.map((classroom) => (
            <article key={classroom.id} className="rounded-card border border-border bg-surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-ink">{classroom.teacherName}</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    {classroom.grade ? `Grade ${classroom.grade} · ` : ""}
                    {classroom.studentCount} {classroom.studentCount === 1 ? "student" : "students"}
                  </p>
                  <p className={`mt-1 text-sm ${classroom.active ? "text-success" : "text-ink-muted"}`}>
                    {classroom.active ? "In use" : "Not in use"}
                  </p>
                </div>
                <ClassroomStatusForm classroom={classroom} />
              </div>
            </article>
          ))}
          {view.classrooms.length === 0 && (
            <div className="rounded-card border border-border bg-surface-card p-6 sm:col-span-2">
              <h3 className="font-medium text-ink">Create the first class</h3>
              <p className="mt-1 text-sm text-ink-muted">Add a teacher name, then assign students below.</p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="assignments-heading">
        <h2 id="assignments-heading" className="text-lg font-medium text-ink">Student class assignments</h2>
        <p className="mt-1 text-sm text-ink-muted">Students linked to a class that is not in use need a new assignment.</p>
        <div className="mt-3 space-y-3">
          {view.students.map((student) => (
            <article key={student.id} className="rounded-card border border-border bg-surface-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium text-ink">{student.name}</h3>
                  <p className="text-sm text-ink-muted">Student {student.studentNumber} · Grade {student.grade}</p>
                </div>
                {student.needsAssignment && (
                  <span className="rounded-pill bg-warn-wash px-2 py-1 text-xs text-warn">Needs class assignment</span>
                )}
              </div>
              <StudentAssignmentForm student={student} classrooms={view.classrooms} />
            </article>
          ))}
          {view.students.length === 0 && (
            <div className="rounded-card border border-border bg-surface-card p-6 text-center text-sm text-ink-muted">
              Upload the student list to get started.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
