import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// Load .env.local so the tests know the database, cron secret and emulator settings.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  // CI provides env vars
}

/**
 * End-to-end tests. They need:
 *  - the local Supabase stack (npm run db:start) with migrations + seed
 *  - .env.local pointing Stripe at the emulator (see README)
 * The emulator and the Next.js dev server are started automatically.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: [
    {
      command: "npm run stripe:emulator",
      url: "http://localhost:12111/_emulator/state",
      reuseExistingServer: true,
      env: { STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "", STRIPE_EMULATOR_QUIET: "1" },
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
