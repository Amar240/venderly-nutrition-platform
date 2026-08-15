import Link from "next/link";
import { notFound } from "next/navigation";
import type { MealType } from "@prisma/client";
import { getAppSession } from "@/server/auth/session";
import { listRosterClasses } from "@/server/meals/roster";

const MEALS: Record<string, { type: MealType; singular: string; label: string }> = {
  breakfast: { type: "BREAKFAST", singular: "breakfast", label: "Breakfast" },
  lunch: { type: "LUNCH", singular: "lunch", label: "Lunch" },
};

export default async function ClassChooserPage({ params }: { params: { mealType: string } }) {
  const meal = MEALS[params.mealType];
  if (!meal) notFound();
  const classes = await listRosterClasses(await getAppSession());

  return (
    <section className="mx-auto max-w-2xl">
      <Link href={`/pos/serve/${params.mealType}`} className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Enter a student number
      </Link>
      <p className="mt-4 text-sm font-medium text-brand">{meal.label}</p>
      <h1 className="text-2xl font-medium text-ink">Choose a class</h1>
      <p className="mt-1 text-sm text-ink-muted">Choose the teacher whose class is eating {meal.singular}.</p>

      {classes.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {classes.map((classroom) => (
            <Link
              key={classroom.groupKey}
              href={`/pos/serve/${params.mealType}/classes/${encodeURIComponent(classroom.groupKey)}`}
              className="flex min-h-touch flex-col justify-center rounded-card border border-control-border bg-surface-card px-4 py-3 text-ink hover:bg-brand-wash"
            >
              <span className="text-lg font-medium">{classroom.teacherName}</span>
              <span className="mt-1 text-sm text-ink-muted">
                {classroom.grade ? `Grade ${classroom.grade} · ` : ""}
                {classroom.schoolName} · {classroom.studentCount} {classroom.studentCount === 1 ? "student" : "students"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-card border border-border bg-surface-card p-6">
          <h2 className="text-lg font-medium text-ink">Set up a class to get started</h2>
          <p className="mt-1 text-sm text-ink-muted">Ask school staff to add teacher names and class assignments.</p>
        </div>
      )}
    </section>
  );
}
