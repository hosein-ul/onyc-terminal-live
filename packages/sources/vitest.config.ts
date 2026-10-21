import { defineConfig } from "vitest/config";

// Unit tests only. The live contract tests in live/ hit real upstreams and run with `pnpm test:live`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
