import { requireSurface } from "@/server/auth/guardLayout";
import { getSessionIdentity } from "@/server/auth/identity";
import { SurfaceShell, type NavItem } from "@/components/surface-shell";

const NAV: NavItem[] = [{ label: "My household", href: "/guardian" }];

export default async function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSurface("guardian");
  const identity = await getSessionIdentity(session);
  return (
    <SurfaceShell
      surface="guardian"
      surfaceLabel="Guardian portal"
      identityLabel={identity.name}
      roleLabel={identity.roleLabel}
      navItems={NAV}
    >
      {children}
    </SurfaceShell>
  );
}
