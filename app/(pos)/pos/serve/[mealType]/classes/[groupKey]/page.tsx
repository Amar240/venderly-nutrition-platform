import Link from "next/link";
import { notFound } from "next/navigation";
import type { MealType } from "@prisma/client";
import { getAppSession } from "@/server/auth/session";
import { getRosterGroup } from "@/server/meals/roster";
import { RosterEntry } from "./roster-entry";

const MEALS: Record<string, { type: MealType; label: string }> = {
  breakfast: { type: "BREAKFAST", label: "Breakfast" },
  lunch: { type: "LUNCH", label: "Lunch" },
};

export default async function RosterPage({
  params,
}: {
  params: { mealType: string; groupKey: string };
}) {
  const meal = MEALS[params.mealType];
  if (!meal) notFound();
  const roster = await getRosterGroup(await getAppSession(), {
    mealType: meal.type,
    groupKey: decodeURIComponent(params.groupKey),
  });
  if (!roster) notFound();

  return (
    <section className="mx-auto max-w-3xl">
      <Link href={`/pos/serve/${params.mealType}/classes`} className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-ink">
        ← Choose another class
      </Link>
      <RosterEntry mealType={meal.type} mealLabel={meal.label} initialRoster={roster} />
    </section>
  );
}
