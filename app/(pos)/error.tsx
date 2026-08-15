"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function PosError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="The serving screen could not load"
      body="No meal was recorded. Retry when the network is stable, or switch to the backup meal-count procedure for the demo."
      action={<Button type="button" onClick={reset}>Retry</Button>}
    />
  );
}
