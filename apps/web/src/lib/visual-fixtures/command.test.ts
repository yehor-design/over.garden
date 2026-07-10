import { describe, expect, it } from "vitest";

import {
  createVisualFixtureCommandSummary,
  runVisualFixtureCommand,
} from "./command";

const LOCAL_ENV = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden",
  DATABASE_URL: "postgresql://overgarden:secret@localhost:5432/overgarden",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

const STATUS = {
  version: "ove187-v1",
  expected: {
    actors: 4,
    profiles: 4,
    spaces: 5,
    objects: 30,
    entries: 80,
    media: 16,
  },
  actual: {
    actors: 4,
    profiles: 4,
    spaces: 5,
    objects: 30,
    entries: 80,
    media: 16,
  },
  seeded: true,
} as const;

describe("visual fixture command boundary", () => {
  it("refuses Production before constructing database or object-store clients", async () => {
    let runtimeFactoryCalls = 0;

    await expect(
      runVisualFixtureCommand("seed", {
        env: { ...LOCAL_ENV, VERCEL_ENV: "production" },
        rootDirectory: process.cwd(),
        createRuntime: async () => {
          runtimeFactoryCalls += 1;
          throw new Error("runtime factory must not run");
        },
      }),
    ).rejects.toThrow("Production");

    expect(runtimeFactoryCalls).toBe(0);
  });

  it("serializes only redacted version, environment class, counts, and proof", () => {
    const summary = createVisualFixtureCommandSummary({
      command: "verify",
      environment: {
        databaseHostClass: "loopback",
        databaseName: "overgarden",
        target: "local",
      },
      status: STATUS,
      mediaObjects: 16,
      verification: {
        rerunStable: true,
        resetEmpty: true,
        sentinelSurvived: true,
        mediaSentinelSurvived: true,
        mediaReachable: 16,
      },
    });
    const output = JSON.stringify(summary);

    expect(summary).toMatchObject({
      ok: true,
      command: "verify",
      version: "ove187-v1",
      environment: {
        target: "local",
        databaseHostClass: "loopback",
      },
      counts: STATUS.actual,
      mediaObjects: 16,
      verification: {
        mediaSentinelSurvived: true,
      },
    });
    expect(output).not.toMatch(
      /databaseName|overgarden|localhost|secret|email|owner|quarantine|derivative/i,
    );
  });
});
