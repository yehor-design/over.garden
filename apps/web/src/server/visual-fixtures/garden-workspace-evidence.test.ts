import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  assertVisualFixtureGardenWorkspaceEvidenceResult,
  type VisualFixtureGardenWorkspaceEvidenceResult,
} from "./garden-workspace-evidence";

const DENSE = requireDenseWorkspaceEvidence();

describe("visual fixture garden workspace evidence verifier", () => {
  it("accepts exact owner-scoped counts and deterministic ordering", () => {
    expect(() =>
      assertVisualFixtureGardenWorkspaceEvidenceResult(DENSE, exactResult()),
    ).not.toThrow();
  });

  it("rejects stale counts and cross-actor rows", () => {
    expect(() =>
      assertVisualFixtureGardenWorkspaceEvidenceResult(DENSE, {
        ...exactResult(),
        objectCount: DENSE.expectedObjectCount - 1,
      }),
    ).toThrow(/counts/);

    expect(() =>
      assertVisualFixtureGardenWorkspaceEvidenceResult(DENSE, {
        ...exactResult(),
        objectIds: [
          ...DENSE.expectedObjectIds.slice(0, -1),
          "00000000-0000-4000-8000-999999999999",
        ],
      }),
    ).toThrow(/objects/);

    expect(() =>
      assertVisualFixtureGardenWorkspaceEvidenceResult(DENSE, {
        ...exactResult(),
        recentEntryIds: [...DENSE.expectedRecentEntryIds].reverse(),
      }),
    ).toThrow(/continuity/);
  });
});

function exactResult(): VisualFixtureGardenWorkspaceEvidenceResult {
  return {
    spaceCount: DENSE.expectedSpaceCount,
    objectCount: DENSE.expectedObjectCount,
    plantCount: DENSE.expectedPlantCount,
    animalCount: DENSE.expectedAnimalCount,
    recentCount: DENSE.expectedRecentCount,
    spaceIds: DENSE.expectedSpaceIds,
    objectIds: DENSE.expectedObjectIds,
    recentEntryIds: DENSE.expectedRecentEntryIds,
  };
}

function requireDenseWorkspaceEvidence() {
  const scenario = VISUAL_FIXTURE_MANIFEST.workspaceEvidence.scenarios.find(
    (candidate) => candidate.state === "dense",
  );
  if (!scenario) throw new Error("Dense workspace evidence is missing.");
  return scenario;
}
