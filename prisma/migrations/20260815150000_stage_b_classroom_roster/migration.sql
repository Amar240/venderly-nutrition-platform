-- Stage B item 5: teacher-named classroom rosters. Classroom membership is
-- independent of the student-list file and nullable for non-roster schools.
CREATE TABLE "Classroom" (
  "id" TEXT NOT NULL,
  "teacherName" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "grade" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Student" ADD COLUMN "classroomId" TEXT;

CREATE UNIQUE INDEX "Classroom_id_schoolId_key"
  ON "Classroom"("id", "schoolId");
CREATE INDEX "Classroom_schoolId_active_idx"
  ON "Classroom"("schoolId", "active");
CREATE INDEX "Student_classroomId_idx" ON "Student"("classroomId");

-- The register identifies a class by teacher name, so case/whitespace variants
-- must not create ambiguous choices within one school.
CREATE UNIQUE INDEX "Classroom_schoolId_teacherName_ci_key"
  ON "Classroom"("schoolId", LOWER(BTRIM("teacherName")));

ALTER TABLE "Classroom"
  ADD CONSTRAINT "Classroom_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Including schoolId in this FK enforces D-13 at the database boundary: a
-- student's classroom, when present, must belong to that student's school.
ALTER TABLE "Student"
  ADD CONSTRAINT "Student_classroomId_schoolId_fkey"
  FOREIGN KEY ("classroomId", "schoolId")
  REFERENCES "Classroom"("id", "schoolId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
