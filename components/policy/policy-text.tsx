import { EmptyState } from "@/components/ui/empty-state";

export function PolicyText({
  text,
  missingBody,
}: {
  text: string | null;
  missingBody: string;
}) {
  if (!text) {
    return (
      <EmptyState
        title="No charge policy has been shared here yet"
        body={missingBody}
      />
    );
  }
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface-card p-6 text-ink">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap leading-7">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
