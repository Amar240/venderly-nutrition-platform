"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/server/auth/session";
import { markInboxRead } from "@/server/notifications/inbox";

export async function markInboxReadAction(): Promise<void> {
  const session = await getAppSession();
  await markInboxRead(session);
  revalidatePath("/guardian/inbox");
  revalidatePath("/guardian");
}
