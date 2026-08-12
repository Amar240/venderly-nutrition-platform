import { requireSurface } from "@/server/auth/guardLayout";
import { getSessionIdentity } from "@/server/auth/identity";
import { SurfaceShell, type NavItem } from "@/components/surface-shell";

const NAV: NavItem[] = [{ label: "Overview", href: "/admin" }];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSurface("admin");
  const identity = await getSessionIdentity(session);
  return (
    <SurfaceShell
      surface="admin"
      surfaceLabel="Admin console"
      identityLabel={identity.name}
      roleLabel={identity.roleLabel}
      navItems={NAV}
    >
      {children}
    </SurfaceShell>
  );
}
