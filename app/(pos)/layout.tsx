import { requireSurface } from "@/server/auth/guardLayout";
import { getSessionIdentity } from "@/server/auth/identity";
import { SurfaceShell, type NavItem } from "@/components/surface-shell";

const NAV: NavItem[] = [
  { label: "Serving line", href: "/pos" },
  { label: "Charge policy", href: "/pos/charge-policy" },
];

export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSurface("pos");
  const identity = await getSessionIdentity(session);
  return (
    <SurfaceShell
      surface="pos"
      surfaceLabel="Cafeteria POS"
      identityLabel={identity.name}
      roleLabel={identity.roleLabel}
      navItems={NAV}
    >
      {children}
    </SurfaceShell>
  );
}
