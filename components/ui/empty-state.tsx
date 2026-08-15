import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-card border border-border bg-surface-card p-6 text-center", className)}>
      <InfoIcon className="mx-auto text-brand" aria-hidden />
      <h2 className="mt-2 text-lg font-medium text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-prose text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
