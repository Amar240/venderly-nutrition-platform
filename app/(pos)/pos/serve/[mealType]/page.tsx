import Link from "next/link";
import { notFound } from "next/navigation";
import type { MealType } from "@prisma/client";
import { MealEntry } from "./meal-entry";

const MEALS: Record<string, { type: MealType; label: string }> = {
  breakfast: { type: "BREAKFAST", label: "Breakfast" },
  lunch: { type: "LUNCH", label: "Lunch" },
};

export default function ServePage({ params }: { params: { mealType: string } }) {
  const meal = MEALS[params.mealType];
  if (!meal) notFound();

  return (
    <div>
      <Link href="/pos" className="text-sm text-ink-muted hover:text-ink">
        ← Back to serving line
      </Link>
      <div className="mt-4">
        <MealEntry mealType={meal.type} label={meal.label} />
      </div>
    </div>
  );
}
