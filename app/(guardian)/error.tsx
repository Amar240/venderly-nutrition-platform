"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function GuardianError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Household information could not load"
      body="Household information could not load. Nothing was changed. Try again when the connection is stable."
      action={<Button type="button" onClick={reset}>Try again</Button>}
    />
  );
}
