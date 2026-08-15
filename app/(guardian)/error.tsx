"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function GuardianError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Household information could not load"
      body="The prototype kept your session open, but the latest household data was not available. Try again, or return to this screen after the connection is stable."
      action={<Button type="button" onClick={reset}>Retry</Button>}
    />
  );
}
