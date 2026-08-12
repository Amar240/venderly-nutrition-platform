import { Button } from "@/components/ui/button";

/**
 * POS home. Phase 1 renders the shell and the two large meal actions at POS
 * density (48px+ targets) — meal entry logic arrives in phase 4. Cashiers never
 * browse students or see eligibility; there is no student data on this page.
 */
export default function PosHomePage() {
  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Serving line</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Choose a meal to begin. Meal entry is enabled in a later phase.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Button size="lg" variant="primary" disabled className="h-32 text-xl">
          Breakfast
        </Button>
        <Button size="lg" variant="primary" disabled className="h-32 text-xl">
          Lunch
        </Button>
      </div>
    </section>
  );
}
