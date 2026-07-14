import { describe, expect, it, vi } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  executeVisualJournalCreationEvidence,
  type JournalCreationDependencies,
  type VisualJournalCreationSnapshot,
} from "./journal-creation-evidence";

describe("visual journal creation evidence orchestration", () => {
  it("runs the first-create duplicate scenario concurrently with exact ids", async () => {
    const scenario = scenarioFor("first-entry", "duplicate");
    const before = snapshotFor(scenario, false);
    const after = snapshotFor(scenario, true);
    const dependencies = dependenciesFor([before, after]);

    const result = await executeVisualJournalCreationEvidence(
      "run",
      scenario,
      dependencies,
    );

    expect(dependencies.resetScenario).toHaveBeenCalledOnce();
    expect(dependencies.createFirst).toHaveBeenCalledTimes(2);
    expect(dependencies.createFirst).toHaveBeenCalledWith(
      { userId: scenario.ownerActorId, sessionId: null },
      expect.objectContaining({
        clientMutationId: scenario.clientMutationId,
        internalDeterministicIds: {
          spaceId: scenario.expectedSpaceId,
          plantObjectId: scenario.expectedObjectId,
          entryId: scenario.expectedEntryId,
        },
      }),
    );
    expect(result.canonicalCreateCalls).toBe(2);
    expect(result.duplicateStable).toBe(true);
  });

  it("runs the follow-up duplicate scenario concurrently with one stable mutation", async () => {
    const scenario = scenarioFor("follow-up", "duplicate");
    const before = snapshotFor(scenario, false);
    const after = snapshotFor(scenario, true);
    const dependencies = dependenciesFor([before, after]);

    const result = await executeVisualJournalCreationEvidence(
      "run",
      scenario,
      dependencies,
    );

    expect(dependencies.resetScenario).toHaveBeenCalledOnce();
    expect(dependencies.createFollowUp).toHaveBeenCalledTimes(2);
    expect(dependencies.createFollowUp).toHaveBeenCalledWith(
      { userId: scenario.ownerActorId, sessionId: null },
      expect.objectContaining({
        clientMutationId: scenario.clientMutationId,
        internalDeterministicIds: {
          entryId: scenario.expectedEntryId,
        },
        plantObjectId: scenario.expectedObjectId,
      }),
    );
    expect(result.canonicalCreateCalls).toBe(2);
    expect(result.duplicateStable).toBe(true);
  });

  it("keeps offline evidence out of server tables", async () => {
    const scenario = scenarioFor("first-entry", "offline");
    const empty = snapshotFor(scenario, false);
    const dependencies = dependenciesFor([empty, empty]);

    const result = await executeVisualJournalCreationEvidence(
      "run",
      scenario,
      dependencies,
    );

    expect(dependencies.createFirst).not.toHaveBeenCalled();
    expect(dependencies.createFollowUp).not.toHaveBeenCalled();
    expect(dependencies.seedMedia).not.toHaveBeenCalled();
    expect(result.canonicalCreateCalls).toBe(0);
  });

  it("reports a persisted duplicate scenario as stable during read-only verify", async () => {
    const scenario = scenarioFor("follow-up", "duplicate");
    const written = snapshotFor(scenario, true);
    const dependencies = dependenciesFor([written]);

    const result = await executeVisualJournalCreationEvidence(
      "verify",
      scenario,
      dependencies,
    );

    expect(dependencies.createFollowUp).not.toHaveBeenCalled();
    expect(result.canonicalCreateCalls).toBe(0);
    expect(result.duplicateStable).toBe(true);
  });

  it("publishes only after the canonical private follow-up is created", async () => {
    const scenario = scenarioFor("follow-up", "publish");
    const before = snapshotFor(scenario, false);
    const after = snapshotFor(scenario, true);
    const dependencies = dependenciesFor([before, after]);

    await executeVisualJournalCreationEvidence("run", scenario, dependencies);

    expect(dependencies.createFollowUp).toHaveBeenCalledOnce();
    expect(dependencies.publish).toHaveBeenCalledWith(
      { userId: scenario.ownerActorId, sessionId: null },
      {
        entryId: scenario.expectedEntryId,
        disclosureAccepted: true,
      },
    );
  });
});

function scenarioFor(
  flow: "first-entry" | "follow-up",
  state: "duplicate" | "offline" | "publish",
) {
  const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
    (candidate) => candidate.flow === flow && candidate.state === state,
  );
  if (!scenario) throw new Error(`Missing ${flow}:${state} scenario.`);
  return scenario;
}

function dependenciesFor(snapshots: VisualJournalCreationSnapshot[]) {
  const readSnapshot = vi.fn();
  for (const snapshot of snapshots)
    readSnapshot.mockResolvedValueOnce(snapshot);

  const dependencies = {
    database: {} as JournalCreationDependencies["database"],
    createFirst: vi.fn(async (_scope, input) => canonicalResult(input)),
    createFollowUp: vi.fn(async (_scope, input) => canonicalResult(input)),
    publish: vi.fn(async () => ({}) as never),
    readSnapshot,
    resetScenario: vi.fn(async () => undefined),
    seedMedia: vi.fn(async () => undefined),
  } satisfies JournalCreationDependencies;
  return dependencies;
}

function canonicalResult(input: {
  internalDeterministicIds?: {
    spaceId?: string;
    plantObjectId?: string;
    entryId: string;
  };
  plantObjectId?: string;
}) {
  const ids = input.internalDeterministicIds!;
  const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
    (candidate) => candidate.expectedEntryId === ids.entryId,
  );
  if (!scenario) throw new Error("Missing canonical result scenario.");
  return {
    space: { id: ids.spaceId ?? scenario.expectedSpaceId },
    plantObject: {
      id: ids.plantObjectId ?? input.plantObjectId ?? "fixture-object",
    },
    entry: { id: ids.entryId },
  } as never;
}

function snapshotFor(
  scenario: ReturnType<typeof scenarioFor>,
  written: boolean,
): VisualJournalCreationSnapshot {
  const hasContext = scenario.flow === "follow-up" || written;
  return {
    actorExists: true,
    space: hasContext
      ? {
          id: scenario.expectedSpaceId,
          displayName: scenario.spaceName,
          locationVisibility: scenario.locationVisibility,
          coarseRegionCode: scenario.coarseRegionCode,
        }
      : null,
    plantObject: hasContext
      ? {
          id: scenario.expectedObjectId,
          spaceId: scenario.expectedSpaceId,
          displayName: scenario.objectName,
          objectKind: scenario.objectKind,
          varietyState: "unknown",
        }
      : null,
    entry: written
      ? {
          id: scenario.expectedEntryId,
          plantObjectId: scenario.expectedObjectId,
          title: scenario.entryTitle,
          body: scenario.entryBody,
          entryDate: scenario.entryDate,
          visibility: scenario.expectedEntryVisibility,
          clientMutationId: scenario.clientMutationId,
        }
      : null,
    mediaAssetIds: written ? [...scenario.expectedMediaAssetIds] : [],
    matchingMutationCount: written ? 1 : 0,
    preconditionEntryCount: scenario.preconditionEntryIds.length,
  };
}
