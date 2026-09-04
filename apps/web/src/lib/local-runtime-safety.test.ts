import { describe, expect, it } from "vitest";

import {
  assertLoopbackDatabaseEnvironment,
  assertLoopbackLocalRuntimeEnvironment,
} from "./local-runtime-safety";

const LOCAL_ENV = {
  DATABASE_URL: "postgresql://local:secret@127.0.0.1:5432/overgarden",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
  PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
  MEILISEARCH_HOST: "http://127.0.0.1:7700",
} as const;

describe("local runtime safety", () => {
  it("accepts an explicitly loopback-only runtime", () => {
    expect(assertLoopbackLocalRuntimeEnvironment(LOCAL_ENV)).toEqual({
      appOriginClass: "loopback",
      authOriginClass: "loopback",
      databaseHostClass: "loopback",
      objectStoreHostClass: "loopback",
      publicMediaHostClass: "loopback",
      searchHostClass: "loopback",
    });
  });

  it("accepts a loopback database without the five origins it never reads", () => {
    // A database-only proof must not need PUBLIC_SITE_URL to be set. Requiring
    // it made the job queue contract proof fail in CI on an environment that
    // was in no danger of reaching production.
    expect(
      assertLoopbackDatabaseEnvironment({
        DATABASE_URL: LOCAL_ENV.DATABASE_URL,
      }),
    ).toEqual({ databaseHostClass: "loopback" });
  });

  it.each([
    ["a remote host", "postgresql://local:secret@db.example.test/overgarden"],
    ["nothing at all", undefined],
  ] as const)("refuses a database URL naming %s", (_label, value) => {
    expect(() =>
      assertLoopbackDatabaseEnvironment({ DATABASE_URL: value }),
    ).toThrow();
  });

  it("refuses a database-only command inside Vercel Production", () => {
    expect(() =>
      assertLoopbackDatabaseEnvironment({
        DATABASE_URL: LOCAL_ENV.DATABASE_URL,
        VERCEL_ENV: "production",
      }),
    ).toThrow();
  });

  it.each([
    ["DATABASE_URL", "postgresql://local:secret@db.example.test/overgarden"],
    ["R2_ENDPOINT", "https://account.r2.cloudflarestorage.com"],
    ["R2_PUBLIC_BASE_URL", "https://media.over.garden"],
    ["PUBLIC_SITE_URL", "https://over.garden"],
    ["BETTER_AUTH_URL", "https://over.garden"],
    ["MEILISEARCH_HOST", "https://search.example.test"],
  ] as const)(
    "rejects remote %s before any client is created",
    (name, value) => {
      expect(() =>
        assertLoopbackLocalRuntimeEnvironment({
          ...LOCAL_ENV,
          [name]: value,
        }),
      ).toThrow("loopback");
    },
  );

  it("rejects production and incomplete environments", () => {
    expect(() =>
      assertLoopbackLocalRuntimeEnvironment({
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toThrow("Vercel Production");
    expect(() =>
      assertLoopbackLocalRuntimeEnvironment({
        ...LOCAL_ENV,
        R2_ENDPOINT: undefined,
      }),
    ).toThrow("R2_ENDPOINT");
  });
});
