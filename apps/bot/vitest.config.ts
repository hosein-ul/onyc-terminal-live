import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Reads the repo-root .env so the integration tests find the local database.
    env: loadEnv("test", fileURLToPath(new URL("../..", import.meta.url)), ""),
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
