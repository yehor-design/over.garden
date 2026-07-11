import { describe, expect, it } from "vitest";

import { resolveVisualFixturePublicJournalDirectoryMode } from "./public-journal-directory-scenarios";

const enabledEnv = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden_visual",
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1/overgarden_visual",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000/overgarden",
};

describe("visual fixture public journal directory scenarios", () => {
  it.each(["loading", "error", "corpus"] as const)(
    "enables the %s state only in an isolated fixture environment",
    (mode) => {
      expect(
        resolveVisualFixturePublicJournalDirectoryMode(
          { __visualJournals: mode },
          enabledEnv,
        ),
      ).toBe(mode);
      expect(
        resolveVisualFixturePublicJournalDirectoryMode(
          { __visualJournals: mode },
          {},
        ),
      ).toBeNull();
    },
  );

  it("rejects unknown and repeated state-forcing parameters", () => {
    expect(
      resolveVisualFixturePublicJournalDirectoryMode(
        { __visualJournals: "ready" },
        enabledEnv,
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicJournalDirectoryMode(
        { __visualJournals: ["loading", "error"] },
        enabledEnv,
      ),
    ).toBeNull();
  });
});
