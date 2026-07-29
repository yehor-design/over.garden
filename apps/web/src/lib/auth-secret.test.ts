import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV,
  getAuthSecretHealth,
  hasUsableBetterAuthSecret,
  isBlockedBetterAuthSecret,
  resolveAuthSecretConfiguration,
  resolveBetterAuthSecret,
  resolveBetterAuthSecretOptions,
  selectLegacyAuthSecret,
  selectVersionedAuthSecret,
} from "./auth-secret";

const currentFixture = Buffer.alloc(32, 3).toString("base64url");
const priorFixture = Buffer.alloc(32, 4).toString("base64url");
const legacyFixture = Buffer.alloc(32, 7).toString("base64");
const legacyGraceUntil = "2026-08-06T12:00:00.000Z";

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    BETTER_AUTH_SECRET: legacyFixture,
    BETTER_AUTH_SECRETS: `2:${currentFixture},1:${priorFixture}`,
    BETTER_AUTH_CURRENT_SECRET_VERSION: "2",
    [BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV]: legacyGraceUntil,
    ...overrides,
  };
}

describe("Better Auth secret policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails closed in production and Preview without a declared versioned current secret", () => {
    for (const env of [
      productionEnv({
        BETTER_AUTH_SECRETS: undefined,
        BETTER_AUTH_CURRENT_SECRET_VERSION: undefined,
      }),
      productionEnv({
        VERCEL_ENV: "preview",
        BETTER_AUTH_SECRETS: `2:${currentFixture}`,
        BETTER_AUTH_CURRENT_SECRET_VERSION: "1",
      }),
    ]) {
      expect(() => resolveBetterAuthSecret(env)).toThrow(
        "Invalid Better Auth secret policy",
      );
      expect(getAuthSecretHealth(env)).toEqual({ class: "closed" });
    }
  });

  it("accepts only canonical 32-byte versioned keys and exposes a class-only active version", () => {
    const configuration = resolveAuthSecretConfiguration(productionEnv());

    expect(configuration.health).toEqual({
      class: "versioned_current",
      activeVersion: 2,
    });
    expect(selectVersionedAuthSecret(2, configuration)?.version).toBe(2);
    expect(selectVersionedAuthSecret(1, configuration)?.version).toBe(1);
    expect(selectVersionedAuthSecret(999, configuration)).toBeNull();
    expect(selectLegacyAuthSecret(configuration)).toBe(legacyFixture);
    expect(resolveBetterAuthSecretOptions(productionEnv())).toMatchObject({
      secret: legacyFixture,
      secrets: [{ version: 2 }, { version: 1 }],
    });
  });

  it("rejects malformed versioned policy regardless of singular fallback material", () => {
    const shortFixture = Buffer.alloc(31, 9).toString("base64url");
    const invalidEnvs = [
      productionEnv({ BETTER_AUTH_SECRETS: "2:arbitrary-prose" }),
      productionEnv({ BETTER_AUTH_SECRETS: `2:${shortFixture}` }),
      productionEnv({ BETTER_AUTH_SECRETS: ` 2:${currentFixture}` }),
      productionEnv({
        BETTER_AUTH_SECRETS: `2:${currentFixture},2:${priorFixture}`,
      }),
      productionEnv({ BETTER_AUTH_CURRENT_SECRET_VERSION: "1" }),
      productionEnv({ BETTER_AUTH_CURRENT_SECRET_VERSION: "2 " }),
    ];

    for (const env of invalidEnvs) {
      expect(getAuthSecretHealth(env)).toEqual({ class: "closed" });
      expect(() => resolveAuthSecretConfiguration(env)).toThrow(
        "Invalid Better Auth secret policy",
      );
    }
  });

  it("clean-cuts inadmissible legacy material instead of letting Better Auth read it", () => {
    for (const legacyValue of [
      "x",
      "a".repeat(32),
      '\"\"',
      "local-development-only-overgarden-better-auth-secret-fixed",
    ]) {
      const env = productionEnv({ BETTER_AUTH_SECRET: legacyValue });
      const configuration = resolveAuthSecretConfiguration(env);

      expect(configuration.health).toEqual({
        class: "versioned_current",
        activeVersion: 2,
      });
      expect(selectLegacyAuthSecret(configuration)).toBeNull();
      expect(resolveBetterAuthSecretOptions(env)).toMatchObject({
        secret: currentFixture,
        secrets: [{ version: 2 }, { version: 1 }],
      });
    }
  });

  it("uses an isolated fallback only for local/build runtimes", () => {
    const buildEnv = productionEnv({
      BETTER_AUTH_SECRET: undefined,
      BETTER_AUTH_SECRETS: undefined,
      BETTER_AUTH_CURRENT_SECRET_VERSION: undefined,
      NEXT_PHASE: "phase-production-build",
    });
    const first = resolveBetterAuthSecret(buildEnv);
    const second = resolveBetterAuthSecret(buildEnv);

    expect(first).toMatch(
      /^local-development-only-overgarden-better-auth-secret-[A-Za-z0-9_-]{43}$/,
    );
    expect(second).toBe(first);
    expect(getAuthSecretHealth(buildEnv)).toEqual({
      class: "local_fallback",
      activeVersion: 0,
    });
  });

  it("admits a legacy fallback only before its strict capped serving grace", () => {
    expect(resolveAuthSecretConfiguration(productionEnv()).legacySecret).toBe(
      legacyFixture,
    );

    for (const env of [
      productionEnv({ [BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV]: undefined }),
      productionEnv({
        [BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV]: "2026-08-07T00:00:00.000Z",
      }),
      productionEnv({
        [BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV]: "2026-08-07T00:00:00.001Z",
      }),
    ]) {
      const configuration = resolveAuthSecretConfiguration(env);
      expect(configuration.health).toEqual({
        class: "versioned_current",
        activeVersion: 2,
      });
      expect(selectLegacyAuthSecret(configuration)).toBeNull();
      expect(resolveBetterAuthSecretOptions(env).secret).toBe(currentFixture);
    }

    vi.setSystemTime(new Date(legacyGraceUntil));
    const configuration = resolveAuthSecretConfiguration(productionEnv());
    expect(configuration.health).toEqual({
      class: "versioned_current",
      activeVersion: 2,
    });
    expect(selectLegacyAuthSecret(configuration)).toBeNull();
    expect(resolveBetterAuthSecretOptions(productionEnv()).secret).toBe(
      currentFixture,
    );
  });

  it("never lets a serving Production or Preview CI marker bypass fail-closed auth", () => {
    for (const env of [
      productionEnv({
        BETTER_AUTH_SECRET: undefined,
        BETTER_AUTH_SECRETS: undefined,
        BETTER_AUTH_CURRENT_SECRET_VERSION: undefined,
        [BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV]: undefined,
        CI: "1",
      }),
      productionEnv({
        VERCEL_ENV: "preview",
        BETTER_AUTH_SECRET: undefined,
        BETTER_AUTH_SECRETS: undefined,
        BETTER_AUTH_CURRENT_SECRET_VERSION: undefined,
        [BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV]: undefined,
        CI: "true",
      }),
    ]) {
      expect(getAuthSecretHealth(env)).toEqual({ class: "closed" });
    }
  });

  it("keeps singular local development configuration in an explicit legacy-transition class", () => {
    const env = {
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: legacyFixture,
    };

    expect(getAuthSecretHealth(env)).toEqual({ class: "legacy_transition" });
    expect(resolveBetterAuthSecret(env)).toBe(legacyFixture);
    expect(hasUsableBetterAuthSecret(env)).toBe(true);
  });

  it("reads runtime policy inputs without returning a secret-bearing health value", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", legacyFixture);
    vi.stubEnv("BETTER_AUTH_SECRETS", `2:${currentFixture}`);
    vi.stubEnv("BETTER_AUTH_CURRENT_SECRET_VERSION", "2");
    vi.stubEnv(BETTER_AUTH_LEGACY_GRACE_UNTIL_ENV, legacyGraceUntil);

    try {
      expect(getAuthSecretHealth()).toEqual({
        class: "versioned_current",
        activeVersion: 2,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("resolves malformed policy within the declared local deadline", () => {
    const startedAt = performance.now();
    for (let index = 0; index < 500; index += 1) {
      expect(
        getAuthSecretHealth(productionEnv({ BETTER_AUTH_SECRETS: "invalid" })),
      ).toEqual({ class: "closed" });
    }
    expect(performance.now() - startedAt).toBeLessThan(25);
  });

  it("reports blocked legacy values without exposing them", () => {
    expect(
      isBlockedBetterAuthSecret(
        "local-development-only-overgarden-better-auth-secret-fixed",
      ),
    ).toBe(true);
    expect(
      hasUsableBetterAuthSecret(
        productionEnv({ BETTER_AUTH_SECRETS: "invalid" }),
      ),
    ).toBe(false);
  });
});
