import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "prisma/**/*.test.ts", "lib/**/*.test.ts"],
    globals: true,
    // Refuses to run under CI when the database is unreachable, so a green
    // build can never mean "two thirds of the suite silently skipped".
    globalSetup: ["./vitest.global-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
