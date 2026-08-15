"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Admin data could not load"
      body="The request failed before the page finished loading. Nothing was changed. Retry, or use the navigation to return to a known admin page."
      action={<Button type="button" onClick={reset}>Retry</Button>}
    />
  );
}
