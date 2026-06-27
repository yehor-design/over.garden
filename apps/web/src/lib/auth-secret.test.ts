import { describe, expect, it } from "vitest";

import { resolveBetterAuthSecret } from "./auth-secret";

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

  it("uses a local fallback only outside production-like runtimes", () => {
    expect(
      resolveBetterAuthSecret({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: undefined,
      }),
    ).toMatch(
      /^local-development-only-overgarden-better-auth-secret-[0-9a-f-]+$/,
    );
  });

  it("rejects placeholder secrets in production-like runtimes", () => {
    expect(() =>
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "CHANGE_ME_generate_with_openssl_rand_base64_32",
      }),
    ).toThrow("Missing required environment variable: BETTER_AUTH_SECRET");
  });

  it("rejects change-before-deploy secrets in production-like runtimes", () => {
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
});
