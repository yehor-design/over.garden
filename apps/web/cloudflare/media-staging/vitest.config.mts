import { randomBytes } from "node:crypto";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const capabilitySecret = randomBytes(32).toString("base64url");
const receiptSecret = randomBytes(32).toString("base64url");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./cloudflare/media-staging/wrangler.jsonc" },
      miniflare: {
        bindings: {
          EPHEMERAL_MEDIA_CAPABILITY_SECRETS: `1:${capabilitySecret}`,
          EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION: "1",
          EPHEMERAL_MEDIA_RECEIPT_SECRETS: `1:${receiptSecret}`,
          EPHEMERAL_MEDIA_RECEIPT_CURRENT_VERSION: "1",
          EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET:
            randomBytes(32).toString("base64url"),
        },
      },
    }),
  ],
  test: {
    include: ["cloudflare/media-staging/src/**/*.worker.test.ts"],
  },
});
