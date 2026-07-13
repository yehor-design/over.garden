import { readFile } from "node:fs/promises";

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
  R2_ENDPOINT: "http://localhost:9000",
  R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

const STATUS = {
  version: "ove187-v7",
  expected: {
    actors: 8,
    profiles: 8,
    profileFollows: 9,
    profileBlocks: 1,
    profileReports: 1,
    engagementComments: 24,
    engagementBookmarks: 16,
    engagementFollows: 8,
    engagementCommentReports: 2,
    notificationReceipts: 2,
    notificationPreferences: 2,
    wishlistItems: 14,
    spaces: 10,
    catalogItems: 19,
    catalogNames: 29,
    objects: 30,
    lineagePendingIdentities: 1,
    lineageEdges: 1,
    entries: 81,
    objectMentions: 2,
    topics: 7,
    topicSignals: 40,
    media: 16,
  },
  actual: {
    actors: 8,
    profiles: 8,
    profileFollows: 9,
    profileBlocks: 1,
    profileReports: 1,
    engagementComments: 24,
    engagementBookmarks: 16,
    engagementFollows: 8,
    engagementCommentReports: 2,
    notificationReceipts: 2,
    notificationPreferences: 2,
    wishlistItems: 14,
    spaces: 10,
    catalogItems: 19,
    catalogNames: 29,
    objects: 30,
    lineagePendingIdentities: 1,
    lineageEdges: 1,
    entries: 81,
    objectMentions: 2,
    topics: 7,
    topicSignals: 40,
    media: 16,
  },
  seeded: true,
} as const;

describe("visual fixture command boundary", () => {
  it("runs every fixture CLI with the React Server condition", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };

    for (const command of ["seed", "reset", "verify"]) {
      expect(packageJson.scripts[`visual:fixtures:${command}`]).toMatch(
        /^NODE_OPTIONS=--conditions=react-server /,
      );
    }
  });

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
        objectStoreHostClass: "loopback",
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
        journalDirectoryCases: 11,
        knowledgeEvidenceCases: 10,
        passportEvidenceCases: 14,
        journalEntryEvidenceCases: 17,
        profileEvidenceCases: 10,
        workspaceEvidenceCases: 8,
        socialEvidenceCases: 15,
      },
    });
    const output = JSON.stringify(summary);

    expect(summary).toMatchObject({
      ok: true,
      command: "verify",
      version: "ove187-v7",
      environment: {
        target: "local",
        databaseHostClass: "loopback",
        objectStoreHostClass: "loopback",
      },
      counts: STATUS.actual,
      mediaObjects: 16,
      verification: {
        mediaSentinelSurvived: true,
        journalDirectoryCases: 11,
        knowledgeEvidenceCases: 10,
        passportEvidenceCases: 14,
        journalEntryEvidenceCases: 17,
        workspaceEvidenceCases: 8,
        socialEvidenceCases: 15,
      },
    });
    expect(output).not.toMatch(
      /databaseName|overgarden|localhost|secret|email|owner|quarantine|derivative/i,
    );
  });
});
