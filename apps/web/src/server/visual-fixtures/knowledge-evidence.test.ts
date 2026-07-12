import { describe, expect, it } from "vitest";

import type { VisualFixtureKnowledgeEvidenceRule } from "@/lib/visual-fixtures/manifest";
import {
  assertVisualFixtureKnowledgeEvidenceResults,
  type VisualFixtureKnowledgeActualResult,
} from "./knowledge-evidence";

const expected: VisualFixtureKnowledgeEvidenceRule = {
  topicSlugs: ["care-checks"],
  catalogSlugs: [],
  expectedCount: 2,
  expectedEntryIds: ["entry-1", "entry-2"],
  expectedObjectIds: ["object-1", "object-2"],
};

describe("visual fixture knowledge evidence verifier", () => {
  it("accepts exact entry ordering and object coverage", () => {
    const actual: VisualFixtureKnowledgeActualResult = {
      entryIds: ["entry-1", "entry-2"],
      objectIds: ["object-1", "object-2"],
    };

    expect(() =>
      assertVisualFixtureKnowledgeEvidenceResults("guide", expected, actual),
    ).not.toThrow();
  });

  it("fails closed on count, order, or stale object drift", () => {
    expect(() =>
      assertVisualFixtureKnowledgeEvidenceResults("guide", expected, {
        entryIds: ["entry-2", "entry-1"],
        objectIds: ["object-1", "object-2"],
      }),
    ).toThrow("guide");
    expect(() =>
      assertVisualFixtureKnowledgeEvidenceResults("guide", expected, {
        entryIds: ["entry-1", "entry-2"],
        objectIds: ["object-1"],
      }),
    ).toThrow("guide");
  });
});
