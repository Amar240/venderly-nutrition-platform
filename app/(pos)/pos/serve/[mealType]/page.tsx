import Link from "next/link";
import { notFound } from "next/navigation";
import type { MealType } from "@prisma/client";
import { MealEntry } from "./meal-entry";
import { getAppSession } from "@/server/auth/session";
import { listRosterClasses } from "@/server/meals/roster";
import { LinkButton } from "@/components/ui/link-button";

const MEALS: Record<string, { type: MealType; label: string }> = {
  breakfast: { type: "BREAKFAST", label: "Breakfast" },
  lunch: { type: "LUNCH", label: "Lunch" },
};

export default async function ServePage({ params }: { params: { mealType: string } }) {
  const meal = MEALS[params.mealType];
  if (!meal) notFound();
  const classes = await listRosterClasses(await getAppSession());

  return (
    <div>
      <Link href="/pos" className="text-sm text-ink-muted hover:text-ink">
        ← Back to serving line
      </Link>
      <div className="mt-4">
        <MealEntry mealType={meal.type} label={meal.label} />
      </div>
      {classes.length > 0 && (
        <div className="mx-auto mt-6 max-w-md border-t border-border pt-4">
          <LinkButton
            href={`/pos/serve/${params.mealType}/classes`}
            variant="secondary"
            size="lg"
            className="w-full"
          >
            Choose a class
          </LinkButton>
        </div>
      )}
    </div>
  );
}
