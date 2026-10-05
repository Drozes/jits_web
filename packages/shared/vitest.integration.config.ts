import { defineConfig } from "vitest/config";

/**
 * Local-stack integration suites (`*.int.test.ts`). Never part of `npm test`:
 * they need a running local Supabase (see src/__integration__/README.md) and
 * skip themselves when its env is absent.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.int.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
