import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminNotFound() {
  return (
    <EmptyState
      title="That admin page is not available"
      body="You don't have access to that. Ask a district administrator if you need it."
      action={<LinkButton href="/admin">Go to admin home</LinkButton>}
    />
  );
}
