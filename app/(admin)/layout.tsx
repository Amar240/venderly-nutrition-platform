import { requireSurface } from "@/server/auth/guardLayout";
import { getSessionIdentity } from "@/server/auth/identity";
import { APP_BRAND_NAME } from "@/lib/prototype";
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
    { label: "Classes", href: "/admin/classes" },
    { label: "Reports", href: "/admin/reports" },
    { label: "Charge policy", href: "/admin/charge-policy" },
  ];
  // District settings are district-admin+. Student list and staff activity stay super-admin only.
  if (isDistrictAdminPlus) nav.push({ label: "Notifications", href: "/admin/notifications" });
  if (isDistrictAdminPlus) nav.push({ label: "Settings", href: "/admin/config" });
  if (isSuper) {
    nav.push({ label: "Student list", href: "/admin/import" });
    nav.push({ label: "Staff activity", href: "/admin/audit" });
  }

  return (
    <SurfaceShell
      brandName={APP_BRAND_NAME}
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
