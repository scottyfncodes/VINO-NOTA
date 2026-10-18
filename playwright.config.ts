import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1366, height: 900 } }, testMatch: /navigation\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: `${baseURL}/sign-in`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { BETTER_AUTH_URL: baseURL, AUTH_RATE_LIMIT: "off" },
      },
});
