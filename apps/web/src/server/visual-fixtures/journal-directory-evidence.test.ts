import { describe, expect, it } from "vitest";

import {
  assertVisualFixtureJournalDirectoryResults,
  type VisualFixtureJournalDirectoryActualResult,
} from "./journal-directory-evidence";

const query = {
  id: "default",
  label: "Default",
  path: "/journals",
  expectedCount: 2,
  expectedOrderedEntryIds: [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ],
  expectedOrderedPublicSlugs: ["first", "second"],
};

describe("visual fixture journal directory evidence verifier", () => {
  it("accepts exact canonical count and ordering without requiring public IDs in cards", () => {
    const actual: VisualFixtureJournalDirectoryActualResult = {
      totalCount: 2,
      orderedPublicSlugs: ["first", "second"],
    };

    expect(() =>
      assertVisualFixtureJournalDirectoryResults(query, actual),
    ).not.toThrow();
  });

  it("fails closed on count, order, or stale/private discoverability drift", () => {
    expect(() =>
      assertVisualFixtureJournalDirectoryResults(query, {
        totalCount: 3,
        orderedPublicSlugs: ["first", "private-stale"],
      }),
    ).toThrow("default");
    expect(() =>
      assertVisualFixtureJournalDirectoryResults(query, {
        totalCount: 2,
        orderedPublicSlugs: ["second", "first"],
      }),
    ).toThrow("default");
  });
});
