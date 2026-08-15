import { prisma } from "@/server/db/client";

export async function recentCompletedOperatingDays(params: {
  schoolId: string;
  beforeDate: Date;
  take: number;
}): Promise<Date[]> {
  const rows = await prisma.mealEvent.groupBy({
    by: ["serviceDate"],
    where: {
      student: { schoolId: params.schoolId },
      serviceDate: { lt: params.beforeDate },
      overrideSeq: 0,
    },
    orderBy: { serviceDate: "desc" },
    take: params.take,
  });
  return rows.map((row) => row.serviceDate);
}

export async function missingLunchCountForStudent(params: {
  studentId: string;
  schoolId: string;
  dates: Date[];
}): Promise<number> {
  if (params.dates.length === 0) return 0;
  const lunches = await prisma.mealEvent.findMany({
    where: {
      studentId: params.studentId,
      student: { schoolId: params.schoolId },
      serviceDate: { in: params.dates },
      mealType: "LUNCH",
      overrideSeq: 0,
    },
    select: { serviceDate: true },
  });
  const eaten = new Set(lunches.map((meal) => meal.serviceDate.toISOString().slice(0, 10)));
  return params.dates.filter((date) => !eaten.has(date.toISOString().slice(0, 10))).length;
}

