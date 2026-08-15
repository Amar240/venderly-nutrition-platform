import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";

export default function GuardianNotFound() {
  return (
    <EmptyState
      title="This household page is not available"
      body="Your child may not be linked to your guardian login. Your other household pages are still available."
      action={<LinkButton href="/guardian">Go to household</LinkButton>}
    />
  );
}
