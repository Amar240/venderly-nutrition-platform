import { describe, expect, it, afterEach } from "vitest";
import { demoCodesEnabled } from "./demoCredentials";

/**
 * The value of this feature is entirely in its guards: it displays live
 * second-factor codes, so "off by default" and "only ever the seeded demo
 * accounts" are the properties that make it safe to ship.
 */
describe("demo sign-in hints", () => {
  const original = process.env.PROTOTYPE_SHOW_DEMO_CODES;

  afterEach(() => {
    if (original === undefined) delete process.env.PROTOTYPE_SHOW_DEMO_CODES;
    else process.env.PROTOTYPE_SHOW_DEMO_CODES = original;
  });

  it("is off when the flag is absent", () => {
    delete process.env.PROTOTYPE_SHOW_DEMO_CODES;
    expect(demoCodesEnabled()).toBe(false);
  });

  it("is on only for exactly \"true\"", () => {
    process.env.PROTOTYPE_SHOW_DEMO_CODES = "true";
    expect(demoCodesEnabled()).toBe(true);
  });

  it.each(["TRUE", "True", "1", "yes", "on", ""])(
    "stays off for the near-miss value %j",
    (value) => {
      process.env.PROTOTYPE_SHOW_DEMO_CODES = value;
      expect(demoCodesEnabled()).toBe(false);
    },
  );

  it("only ever names the four seeded demo accounts", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./demoCredentials.ts", import.meta.url), "utf8"),
    );
    const allowlist = source.slice(
      source.indexOf("const DEMO_EMAILS"),
      source.indexOf("] as const"),
    );
    const emails = allowlist.match(/"[^"]+@[^"]+"/g) ?? [];
    expect(emails).toHaveLength(4);
    for (const email of emails) {
      // The property that matters is not which domain, but that every entry is
      // a .demo address: no deliverable mailbox, so no real person's account
      // can ever end up on a page that prints live second-factor codes.
      expect(email).toMatch(/\.demo"$/);
    }
  });
});
