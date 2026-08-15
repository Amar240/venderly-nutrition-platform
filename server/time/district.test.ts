import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { dateOnlyUtc, districtDateOnly, districtToday, isAfterServiceEnd, minutesAfterMidnightInZone } from "./district";

const prisma = new PrismaClient();
let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  console.warn("[district-time.test] no database reachable — skipping");
}

const districtIds: string[] = [];
afterAll(async () => {
  for (const id of districtIds) {
    await prisma.school.deleteMany({ where: { districtId: id } });
    await prisma.district.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("district time helpers", () => {
  it("derives date and minutes in an IANA time zone, independent of host TZ", () => {
    const now = new Date("2026-08-15T03:30:00.000Z");
    expect(minutesAfterMidnightInZone("America/New_York", now)).toBe(23 * 60 + 30);
    expect(districtDateOnly("America/New_York", now)).toEqual(dateOnlyUtc(2026, 8, 14));
    expect(dateOnlyUtc(2026, 8, 14).toISOString().slice(0, 10)).toBe("2026-08-14");
  });
});

describe.skipIf(!dbUp)("districtToday and service end", () => {
  it("uses the district zone for the service date, including DST dates", async () => {
    const district = await prisma.district.create({ data: { name: `TZ-${crypto.randomUUID()}`, timeZone: "America/New_York" } });
    districtIds.push(district.id);
    await expect(districtToday(district.id, new Date("2026-03-08T04:30:00.000Z"))).resolves.toEqual(dateOnlyUtc(2026, 3, 7));
    await expect(districtToday(district.id, new Date("2026-03-08T07:30:00.000Z"))).resolves.toEqual(dateOnlyUtc(2026, 3, 8));
  });

  it("treats exact service end as after, and null service as unserved", async () => {
    const district = await prisma.district.create({ data: { name: `END-${crypto.randomUUID()}`, timeZone: "America/New_York" } });
    districtIds.push(district.id);
    const school = await prisma.school.create({
      data: { districtId: district.id, name: "Service School", code: `S${crypto.randomUUID()}`, lunchServiceEndMinutes: 13 * 60 },
    });
    await expect(isAfterServiceEnd(district.id, school.id, "LUNCH", new Date("2026-08-15T16:59:00.000Z"))).resolves.toBe(false);
    await expect(isAfterServiceEnd(district.id, school.id, "LUNCH", new Date("2026-08-15T17:00:00.000Z"))).resolves.toBe(true);
    await expect(isAfterServiceEnd(district.id, school.id, "BREAKFAST", new Date("2026-08-15T17:00:00.000Z"))).resolves.toBeNull();
  });
});
