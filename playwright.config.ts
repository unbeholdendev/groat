import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? 3100;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  workers: 1,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], deviceScaleFactor: 1 } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "bun run build && NODE_ENV=test bun e2e/server.ts",
    url: `http://localhost:${port}/api/session`,
    reuseExistingServer: true,
  },
});
