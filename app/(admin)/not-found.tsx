import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminNotFound() {
  return (
    <EmptyState
      title="That admin page is not available"
      body="It may be outside your role or school scope. The prototype hides restricted admin pages instead of exposing details."
      action={<LinkButton href="/admin">Go to admin home</LinkButton>}
    />
  );
}
