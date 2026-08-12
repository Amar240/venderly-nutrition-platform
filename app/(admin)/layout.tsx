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

  const isStaff = session.principalType === "staff";
  const isSuper = isStaff && session.role === "SUPER_ADMIN";
  const isDistrictAdminPlus = isStaff && (session.role === "DISTRICT_ADMIN" || session.role === "SUPER_ADMIN");

  const nav: NavItem[] = [
    { label: "Overview", href: "/admin" },
    { label: "Students", href: "/admin/students" },
    { label: "Reports", href: "/admin/reports" },
  ];
  // Delivery log: district admin+. Audit viewer + config: super admin only.
  if (isDistrictAdminPlus) nav.push({ label: "Notifications", href: "/admin/notifications" });
  if (isSuper) {
    nav.push({ label: "Config", href: "/admin/config" });
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
