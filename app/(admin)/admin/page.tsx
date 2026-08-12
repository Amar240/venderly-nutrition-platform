import { getAppSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { scopeToSchools } from "@/server/auth/rbac";

/**
 * Admin overview. Counts are scoped to the schools the staff session may see
 * (scopeToSchools) — a SUPER_ADMIN sees the whole district, others only their
 * assigned schools. No eligibility anywhere.
 */
export default async function AdminHomePage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return null;

  const scope = scopeToSchools(session);
  const schoolWhere = scope.schoolId
    ? { districtId: scope.districtId, id: scope.schoolId }
    : { districtId: scope.districtId };
  const studentWhere = scope.schoolId
    ? { districtId: scope.districtId, schoolId: scope.schoolId }
    : { districtId: scope.districtId };

  const [schoolCount, studentCount, activeStudentCount] = await Promise.all([
    prisma.school.count({ where: schoolWhere }),
    prisma.student.count({ where: studentWhere }),
    prisma.student.count({
      where: { ...studentWhere, enrollmentStatus: "ACTIVE" },
    }),
  ]);

  const stats = [
    { label: "Schools in scope", value: schoolCount },
    { label: "Students in scope", value: studentCount },
    { label: "Active students", value: activeStudentCount },
  ];

  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Overview</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Summary for the schools your role can access.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-card border border-border bg-surface-card p-6"
          >
            <div className="text-xs text-ink-muted">{s.label}</div>
            <div className="mt-1 text-3xl font-medium tabular text-ink">
              {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
