import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/empty-server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      "tests/**",
      "cloudflare/media-staging/src/**/*.worker.test.ts",
    ],
    setupFiles: ["./test/setup.ts"],
  },
});
