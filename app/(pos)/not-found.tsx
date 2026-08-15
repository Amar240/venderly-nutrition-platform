import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";

export default function PosNotFound() {
  return (
    <EmptyState
      title="That serving page is not available"
      body="Use the POS home screen to choose breakfast, lunch, or a-la-carte service."
      action={<LinkButton href="/pos">Go to POS home</LinkButton>}
    />
  );
}
