import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { runProductionPublicIndexParity } from "./production-public-index-parity-runner";

describe("production public index parity runner", () => {
  it("runs Vercel production from an isolated cwd and removes it", () => {
    const spawn = vi.fn(() => ({ status: 0 })) as unknown as typeof spawnSync;
    const removeTempDirectory = vi.fn();
    const webRoot = "/workspace/apps/web";

    expect(
      runProductionPublicIndexParity(
        [
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--mode",
          "classify",
        ],
        {
          webRoot,
          environment: {
            DATABASE_URL: "must-not-cross",
            DIRECT_URL: "must-not-cross",
            MEILISEARCH_API_KEY: "must-not-cross",
            MEILISEARCH_HOST: "must-not-cross",
            NODE_ENV: "test",
            PATH: "/usr/bin",
            VERCEL_TOKEN: "provider-auth-remains-available",
          },
          makeTempDirectory: () => "/tmp/isolated-production-operator",
          removeTempDirectory,
          spawn,
        },
      ),
    ).toBe(0);

    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining([
        "vercel@59.3.0",
        "production",
        path.join(webRoot, "node_modules/.bin/tsx"),
        path.join(webRoot, "tsconfig.json"),
        path.join(webRoot, "scripts/smoke-public-index-parity.ts"),
        "classify",
      ]),
      {
        cwd: "/tmp/isolated-production-operator",
        env: {
          NODE_ENV: "test",
          OVERGARDEN_PRODUCTION_PARITY_ISOLATED: "1",
          PATH: "/usr/bin",
          VERCEL_TOKEN: "provider-auth-remains-available",
        },
        stdio: "inherit",
      },
    );
    expect(removeTempDirectory).toHaveBeenCalledWith(
      "/tmp/isolated-production-operator",
    );
  });

  it("removes the isolated cwd when the provider command throws", () => {
    const providerError = new Error("provider unavailable");
    const spawn = vi.fn(() => {
      throw providerError;
    }) as unknown as typeof spawnSync;
    const removeTempDirectory = vi.fn();

    expect(() =>
      runProductionPublicIndexParity([], {
        webRoot: "/workspace/apps/web",
        makeTempDirectory: () => "/tmp/isolated-production-operator",
        removeTempDirectory,
        spawn,
      }),
    ).toThrow(providerError);
    expect(removeTempDirectory).toHaveBeenCalledOnce();
  });
});
