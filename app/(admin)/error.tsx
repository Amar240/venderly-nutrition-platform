"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Admin data could not load"
      body="The page could not load. Nothing was changed — try again or use the navigation to return to a known page."
      action={<Button type="button" onClick={reset}>Try again</Button>}
    />
  );
}
