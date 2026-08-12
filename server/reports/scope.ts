import { prisma } from "@/server/db/client";
import { requireStaff } from "@/server/auth/rbac";
import type { AppSession } from "@/server/auth/types";

/**
 * Resolve the concrete list of school ids a staff session may report on. Super
 * admin → every school in the district; every other staff role → only assigned
 * schools. Reports iterate this list, so a district admin can never see a school
 * outside their scope.
 */
export interface ReportScope {
  districtId: string;
  schools: { id: string; name: string }[];
}

export async function reportScope(session: AppSession | null | undefined): Promise<ReportScope> {
  const staff = requireStaff(session);
  const schools = await prisma.school.findMany({
    where: {
      districtId: staff.districtId,
      ...(staff.role === "SUPER_ADMIN" ? {} : { id: { in: staff.schoolIds } }),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { districtId: staff.districtId, schools };
}
