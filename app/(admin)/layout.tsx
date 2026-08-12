import { requireSurface } from "@/server/auth/guardLayout";
import { getSessionIdentity } from "@/server/auth/identity";
import { SurfaceShell, type NavItem } from "@/components/surface-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSurface("admin");
  const identity = await getSessionIdentity(session);

  const nav: NavItem[] = [
    { label: "Overview", href: "/admin" },
    { label: "Students", href: "/admin/students" },
    { label: "Reports", href: "/admin/reports" },
  ];
  // The audit log viewer is super-admin only (page is gated too).
  if (session.principalType === "staff" && session.role === "SUPER_ADMIN") {
    nav.push({ label: "Audit log", href: "/admin/audit" });
  }

  return (
    <SurfaceShell
      surface="admin"
      surfaceLabel="Admin console"
      identityLabel={identity.name}
      roleLabel={identity.roleLabel}
      navItems={nav}
    >
      {children}
    </SurfaceShell>
  );
}
