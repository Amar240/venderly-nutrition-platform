import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * The seed's `reset()` deletes every table by hand, in foreign-key-safe order.
 * Nothing connects that list to the schema, so adding a model and forgetting
 * to add a delete leaves a landmine: the seed keeps working until rows happen
 * to exist in the new table, and then fails with a foreign key violation at a
 * completely unrelated line.
 *
 * That is exactly what happened with EditCheckReview. It was added, migrated,
 * used and reviewed, and the seed carried on working for days because no rows
 * existed yet. The first test run that exercised the review feature left a row
 * behind and the next `npm run seed` died on `user.deleteMany()`.
 *
 * This compares the models Prisma knows about against the ones `reset()`
 * actually clears, so the next missing table is a failing test at build time
 * rather than a confusing crash later. No database required.
 */

const SEED_SOURCE = readFileSync(new URL("./seed.ts", import.meta.url), "utf8");
const SCHEMA_SOURCE = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");

function camel(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/**
 * Models that disappear on their own when their parent row goes.
 *
 * `reset()` only needs to name a table when nothing deletes it for us. A model
 * with `onDelete: Cascade` is removed by the database the moment its parent is
 * deleted, and every such parent is itself in the reset list — so requiring an
 * explicit delete for these would be noise, and would train people to add
 * lines without thinking about why.
 *
 * The distinction is the whole point: `Cascade` cleans itself up, `Restrict`
 * blocks the parent delete and takes the seed down with it. EditCheckReview
 * was Restrict on both of its foreign keys, which is why it broke and these
 * three never did.
 */
function modelsRemovedByCascade(): Set<string> {
  const cascading = new Set<string>();
  const blocks = SCHEMA_SOURCE.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);
  for (const [, name, body] of blocks) {
    if (body!.includes("onDelete: Cascade")) cascading.add(camel(name!));
  }
  return cascading;
}

function modelsClearedByReset(): Set<string> {
  const body = SEED_SOURCE.slice(
    SEED_SOURCE.indexOf("async function reset()"),
    SEED_SOURCE.indexOf("let studentSeq"),
  );
  // Matches both `prisma.x.deleteMany()` and the ledger's `tx.x.deleteMany()`.
  const matches = body.matchAll(/\b(?:prisma|tx)\.(\w+)\.deleteMany\(/g);
  return new Set([...matches].map((m) => m[1]!));
}

describe("seed reset covers every model", () => {
  it("clears every table that will not clear itself", () => {
    const cleared = modelsClearedByReset();
    const cascading = modelsRemovedByCascade();
    const missing = Object.values(Prisma.ModelName)
      .map(camel)
      .filter((model) => !cleared.has(model) && !cascading.has(model))
      .sort();

    expect(
      missing,
      `reset() in prisma/seed.ts does not delete: ${missing.join(", ")}. ` +
        "These have no cascade, so the parent delete will be blocked and the " +
        "seed will fail once rows exist. Add them in foreign-key-safe order.",
    ).toEqual([]);
  });

  it("recognises the models that clean themselves up", () => {
    // Guards the exemption itself: if someone changes one of these from
    // Cascade to Restrict, it silently stops being exempt and the test above
    // starts requiring it — which is right, but only if this stays accurate.
    const cascading = modelsRemovedByCascade();
    expect([...cascading].sort()).toContain("studentPricing");
    expect([...cascading].sort()).toContain("notificationDelivery");
  });

  it("does not name tables that no longer exist", () => {
    const known = new Set(Object.values(Prisma.ModelName).map(camel));
    const unknown = [...modelsClearedByReset()].filter((m) => !known.has(m)).sort();
    expect(unknown).toEqual([]);
  });
});
