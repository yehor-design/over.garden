import { describe, expect, it, vi } from "vitest";

import {
  hasUsableBetterAuthSecret,
  isBlockedBetterAuthSecret,
  resolveBetterAuthSecret,
} from "./auth-secret";

describe("Better Auth secret resolution", () => {
  it("fails closed in production when BETTER_AUTH_SECRET is missing", () => {
    expect(() =>
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: undefined,
      }),
    ).toThrow("Missing required environment variable: BETTER_AUTH_SECRET");
  });

  it("fails closed in Vercel preview when BETTER_AUTH_SECRET is missing", () => {
    expect(() =>
      resolveBetterAuthSecret({
        NODE_ENV: "test",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        BETTER_AUTH_SECRET: undefined,
      }),
    ).toThrow("Missing required environment variable: BETTER_AUTH_SECRET");
  });

  it("uses a stable local fallback only outside production-like runtimes", () => {
    const env = {
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: undefined,
    };

    const first = resolveBetterAuthSecret(env);
    const second = resolveBetterAuthSecret(env);

    expect(first).toMatch(
      /^local-development-only-overgarden-better-auth-secret-[0-9a-f-]+$/,
    );
    expect(second).toBe(first);
  });

  it("uses an explicit configured secret when it is not placeholder-like", () => {
    expect(
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "  deployed-auth-secret-present-in-platform  ",
      }),
    ).toBe("deployed-auth-secret-present-in-platform");
  });

  it("reads the configured secret from the runtime environment by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "runtime-auth-secret-retained-by-the-production-bundle",
    );

    try {
      expect(resolveBetterAuthSecret()).toBe(
        "runtime-auth-secret-retained-by-the-production-bundle",
      );
      expect(hasUsableBetterAuthSecret()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects placeholder secrets in production-like runtimes", () => {
    expect(() =>
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "CHANGE_ME_generate_with_openssl_rand_base64_32",
      }),
    ).toThrow("Missing required environment variable: BETTER_AUTH_SECRET");
  });

  it("rejects checked-in change-before-deploy strings in production-like runtimes", () => {
    expect(() =>
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: [
          "ci-overgarden",
          "better-auth-secret",
          "change-before-deploy",
        ].join("-"),
      }),
    ).toThrow("Missing required environment variable: BETTER_AUTH_SECRET");
  });

  it("reports usable and blocked secret state without exposing values", () => {
    expect(
      hasUsableBetterAuthSecret({
        BETTER_AUTH_SECRET: "deployed-auth-secret-present-in-platform",
      }),
    ).toBe(true);
    expect(
      hasUsableBetterAuthSecret({
        BETTER_AUTH_SECRET:
          "local-development-only-overgarden-better-auth-secret-fixed",
      }),
    ).toBe(false);
    expect(
      isBlockedBetterAuthSecret(
        "local-development-only-overgarden-better-auth-secret-fixed",
      ),
    ).toBe(true);
  });
});
