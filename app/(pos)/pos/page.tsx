import { LinkButton } from "@/components/ui/link-button";

/**
 * POS home — the serving line. Two large meal actions plus a-la-carte, all
 * keyboard-operable and ≥48px at POS density. No student data, no eligibility.
 */
export default function PosHomePage() {
  return (
    <section>
      <h1 className="text-2xl font-medium text-ink">Serving line</h1>
      <p className="mt-1 text-sm text-ink-muted">Choose a meal to begin.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <LinkButton href="/pos/serve/breakfast" className="h-32 text-xl">
          Breakfast
        </LinkButton>
        <LinkButton href="/pos/serve/lunch" className="h-32 text-xl">
          Lunch
        </LinkButton>
      </div>

      <div className="mt-4">
        <LinkButton href="/pos/alacarte" variant="secondary" className="h-16 w-full text-lg">
          A-la-carte items
        </LinkButton>
      </div>
    </section>
  );
}
