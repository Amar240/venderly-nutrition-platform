import { PrismaClient } from "@prisma/client";

/**
 * Guard against a silently green build.
 *
 * Sixteen test files probe the database themselves and call `describe.skipIf`
 * when it is unreachable. Locally that is a kindness: you can run the pure
 * unit tests without starting Postgres. In CI it is a trap — the suite reports
 * success while quietly skipping about two thirds of the tests, including
 * every one that covers the ledger, RBAC scoping, and the duplicate-meal
 * guard. That has already happened once on this project: `npm run check`
 * passed with 144 of 214 tests skipped because a container was not running.
 *
 * A gate that cannot distinguish "everything passed" from "almost nothing
 * ran" is not a gate. So when CI=true, refuse to start at all rather than
 * report a success nobody should trust.
 */
export async function setup(): Promise<void> {
  if (process.env.CI !== "true") return;

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "CI=true but no database is reachable, so the database-backed tests " +
        "would skip and the run would pass without verifying the ledger, " +
        "authorisation scoping, or the duplicate-meal guard. Start Postgres " +
        `and re-run.\n\nUnderlying error: ${detail}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
