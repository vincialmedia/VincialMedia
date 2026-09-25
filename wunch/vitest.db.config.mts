// Database tests: need the local Supabase stack (`npm run db:start`).
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
