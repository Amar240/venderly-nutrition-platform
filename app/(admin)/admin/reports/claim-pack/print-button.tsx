"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <div data-print-hidden="true">
      <Button type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </Button>
    </div>
  );
}
