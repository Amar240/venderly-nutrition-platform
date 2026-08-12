import Link from "next/link";
import { getAppSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { AlacarteEntry } from "./alacarte-entry";

/**
 * A-la-carte tiles. Items are scoped to the cashier's district (school override
 * allowed). Item prices are public catalog data — not eligibility.
 */
export default async function AlacartePage() {
  const session = await getAppSession();
  if (!session || session.principalType !== "staff") return null;

  const items = await prisma.item.findMany({
    where: { districtId: session.districtId, active: true },
    select: { id: true, name: true, priceCents: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link href="/pos" className="text-sm text-ink-muted hover:text-ink">
        ← Back to serving line
      </Link>
      <div className="mt-4">
        <AlacarteEntry items={items} />
      </div>
    </div>
  );
}
