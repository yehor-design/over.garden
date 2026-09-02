import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isWalkingSkeletonRequestHostAllowed,
  resolveWalkingSkeletonEnvironment,
  tryResolveWalkingSkeletonEnvironment,
} from "./environment";

const LOCAL_ENV = {
  NODE_ENV: "development",
  WALKING_SKELETON_ENABLED: "true",
  DATABASE_URL:
    "postgresql://overgarden:local-password@localhost:5432/overgarden",
  R2_ENDPOINT: "http://localhost:9000",
  R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
} as const;

describe("walking-skeleton environment guard", () => {
  it("binds the canonical development listener to IPv4 loopback", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts?: { dev?: unknown } };

    expect(packageJson.scripts?.dev).toBe("next dev --hostname 127.0.0.1");
  });

  it("accepts only an explicitly enabled loopback environment", () => {
    expect(resolveWalkingSkeletonEnvironment(LOCAL_ENV)).toEqual({
      databaseHostClass: "loopback",
      databaseName: "overgarden",
      objectStoreHostClass: "loopback",
      target: "local",
    });
  });

  it("stays disabled unless the diagnostic gate is explicitly enabled", () => {
    expect(
      tryResolveWalkingSkeletonEnvironment({
        ...LOCAL_ENV,
        WALKING_SKELETON_ENABLED: "false",
      }),
    ).toBeNull();
  });

  it.each([
    { NODE_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "development" },
    { VERCEL: "1", VERCEL_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: undefined },
    { VERCEL_ENV: "custom" },
  ])("rejects production-like runtime signals %#", (runtime) => {
    expect(
      tryResolveWalkingSkeletonEnvironment({ ...LOCAL_ENV, ...runtime }),
    ).toBeNull();
  });

  it.each(["PUBLIC_SITE_URL", "BETTER_AUTH_URL"] as const)(
    "requires %s to resolve to a loopback origin",
    (name) => {
      expect(
        tryResolveWalkingSkeletonEnvironment({
          ...LOCAL_ENV,
          [name]: "https://staging.example.test",
        }),
      ).toBeNull();
      expect(
        tryResolveWalkingSkeletonEnvironment({
          ...LOCAL_ENV,
          [name]: undefined,
        }),
      ).toBeNull();
    },
  );

  it("refuses non-loopback database, storage, and canonical origins", () => {
    expect(
      tryResolveWalkingSkeletonEnvironment({
        ...LOCAL_ENV,
        DATABASE_URL:
          "postgresql://fixture:secret@db.example.test:5432/overgarden",
      }),
    ).toBeNull();
    expect(
      tryResolveWalkingSkeletonEnvironment({
        ...LOCAL_ENV,
        R2_ENDPOINT: "https://storage.example.test",
      }),
    ).toBeNull();
    expect(
      tryResolveWalkingSkeletonEnvironment({
        ...LOCAL_ENV,
        PUBLIC_SITE_URL: "https://over.garden",
      }),
    ).toBeNull();
  });

  it("accepts only loopback request hosts, including ports and IPv6", () => {
    expect(isWalkingSkeletonRequestHostAllowed("localhost:3000")).toBe(true);
    expect(isWalkingSkeletonRequestHostAllowed("http://127.0.0.1:3000")).toBe(
      true,
    );
    expect(isWalkingSkeletonRequestHostAllowed("[::1]:3000")).toBe(true);
    expect(isWalkingSkeletonRequestHostAllowed("0.0.0.0:3000")).toBe(false);
    expect(isWalkingSkeletonRequestHostAllowed("preview.example.test")).toBe(
      false,
    );
    expect(isWalkingSkeletonRequestHostAllowed(null)).toBe(false);
  });

  it.each([
    ["DATABASE_URL", "postgresql://fixture:secret@0.0.0.0:5432/overgarden"],
    ["R2_ENDPOINT", "http://0.0.0.0:9000"],
    ["R2_PUBLIC_BASE_URL", "http://0.0.0.0:9000/overgarden-public"],
    ["PUBLIC_SITE_URL", "http://0.0.0.0:3000"],
    ["BETTER_AUTH_URL", "http://0.0.0.0:3000"],
  ] as const)("rejects bind-all addresses for %s", (name, value) => {
    expect(
      tryResolveWalkingSkeletonEnvironment({
        ...LOCAL_ENV,
        [name]: value,
      }),
    ).toBeNull();
  });
});
