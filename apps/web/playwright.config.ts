import { randomBytes } from "node:crypto";

import { defineConfig } from "playwright/test";

const LOCAL_PORT = 3_176;
const LOCAL_ORIGIN = `http://127.0.0.1:${LOCAL_PORT}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? LOCAL_ORIGIN;
const localAuthSecret = randomBytes(32).toString("base64url");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: [
          "env",
          `PUBLIC_SITE_URL=${LOCAL_ORIGIN}`,
          `BETTER_AUTH_URL=${LOCAL_ORIGIN}`,
          `BETTER_AUTH_SECRETS=0:${localAuthSecret}`,
          "BETTER_AUTH_CURRENT_SECRET_VERSION=0",
          "BETTER_AUTH_LEGACY_GRACE_UNTIL=",
          "DATABASE_URL=postgresql://overgarden:overgarden@127.0.0.1:5432/overgarden",
          "DIRECT_URL=postgresql://overgarden:overgarden@127.0.0.1:5432/overgarden",
          "DATABASE_SSL=false",
          "GOOGLE_CLIENT_ID=local-browser-client.apps.googleusercontent.com",
          "GOOGLE_CLIENT_SECRET=local-browser-secret",
          "VISUAL_FIXTURES_ENABLED=true",
          "VISUAL_FIXTURES_TARGET=local",
          "VISUAL_FIXTURES_DATABASE=overgarden",
          "R2_ENDPOINT=http://127.0.0.1:9000",
          "R2_PUBLIC_BASE_URL=http://127.0.0.1:9000",
          "NEXT_TELEMETRY_DISABLED=1",
          "pnpm exec next dev --hostname 127.0.0.1",
          `--port ${LOCAL_PORT}`,
        ].join(" "),
        url: `${LOCAL_ORIGIN}/garden`,
        timeout: 120_000,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
      },
});
