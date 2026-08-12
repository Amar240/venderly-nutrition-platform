import { requireSurface } from "@/server/auth/guardLayout";
import { getSessionIdentity } from "@/server/auth/identity";
import { getUnreadCount } from "@/server/notifications/inbox";
import { SurfaceShell, type NavItem } from "@/components/surface-shell";

export default async function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSurface("guardian");
  const [identity, unread] = await Promise.all([
    getSessionIdentity(session),
    getUnreadCount(session),
  ]);
  const nav: NavItem[] = [
    { label: "My household", href: "/guardian" },
    { label: unread > 0 ? `Inbox (${unread})` : "Inbox", href: "/guardian/inbox" },
  ];
  return (
    <SurfaceShell
      surface="guardian"
      surfaceLabel="Guardian portal"
      identityLabel={identity.name}
      roleLabel={identity.roleLabel}
      navItems={nav}
    >
      {children}
    </SurfaceShell>
  );
}
