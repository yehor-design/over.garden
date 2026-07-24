import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureManifest,
  type VisualFixtureWorkspaceScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";
import {
  buildGardenWorkspaceInventorySummaryQuery,
  buildGardenWorkspaceRecentEntriesQuery,
  buildGardenWorkspaceSpaceSummariesQuery,
} from "@/server/garden-workspace-repository";
import { buildMyPlantObjectsQuery } from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureGardenWorkspaceEvidenceResult {
  spaceCount: number;
  objectCount: number;
  plantCount: number;
  animalCount: number;
  recentCount: number;
  spaceIds: readonly string[];
  objectIds: readonly string[];
  recentEntryIds: readonly string[];
}

export function assertVisualFixtureGardenWorkspaceEvidenceResult(
  expected: VisualFixtureWorkspaceScenarioEvidence,
  actual: VisualFixtureGardenWorkspaceEvidenceResult,
) {
  if (
    actual.spaceCount !== expected.expectedSpaceCount ||
    actual.objectCount !== expected.expectedObjectCount ||
    actual.plantCount !== expected.expectedPlantCount ||
    actual.animalCount !== expected.expectedAnimalCount ||
    actual.recentCount !== expected.expectedRecentCount
  ) {
    throw new Error(
      `Garden workspace evidence ${expected.id} counts diverged from the manifest.`,
    );
  }
  if (!sameOrderedValues(actual.spaceIds, expected.expectedSpaceIds)) {
    throw new Error(
      `Garden workspace evidence ${expected.id} spaces diverged from the manifest.`,
    );
  }
  if (!sameOrderedValues(actual.objectIds, expected.expectedObjectIds)) {
    throw new Error(
      `Garden workspace evidence ${expected.id} objects diverged from the manifest.`,
    );
  }
  if (
    !sameOrderedValues(actual.recentEntryIds, expected.expectedRecentEntryIds)
  ) {
    throw new Error(
      `Garden workspace evidence ${expected.id} continuity diverged from the manifest.`,
    );
  }
}

export async function verifyVisualFixtureGardenWorkspaceEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  const ownerScenarios = manifest.workspaceEvidence.scenarios.filter(
    (scenario) => scenario.ownerActorId !== null,
  );

  for (const expected of ownerScenarios) {
    const actual = await readGardenWorkspaceEvidence(
      expected,
      manifest.workspaceEvidence.recentLimit,
      executor,
    );
    assertVisualFixtureGardenWorkspaceEvidenceResult(expected, actual);
  }

  return ownerScenarios.length;
}

async function readGardenWorkspaceEvidence(
  expected: VisualFixtureWorkspaceScenarioEvidence,
  recentLimit: number,
  executor: QueryExecutor,
): Promise<VisualFixtureGardenWorkspaceEvidenceResult> {
  if (!expected.ownerActorId) {
    throw new Error("Owner workspace evidence requires a synthetic owner.");
  }
  const scope = scopedToUser(expected.ownerActorId);
  const [inventory, spaces, objects, recent] = await Promise.all([
    buildGardenWorkspaceInventorySummaryQuery(
      executor,
      scope,
    ).executeTakeFirst(),
    buildGardenWorkspaceSpaceSummariesQuery(executor, scope, {
      limit: 25,
      offset: 0,
    }).execute(),
    buildMyPlantObjectsQuery(executor, scope, 20, 0).execute(),
    buildGardenWorkspaceRecentEntriesQuery(
      executor,
      scope,
      recentLimit,
    ).execute(),
  ]);

  return {
    spaceCount: normalizeCount(spaces[0]?.totalCount),
    objectCount: normalizeCount(inventory?.totalCount),
    plantCount: normalizeCount(inventory?.plantCount),
    animalCount: normalizeCount(inventory?.animalCount),
    recentCount: recent.length,
    spaceIds: spaces.map((space) => space.id),
    objectIds: objects.map((object) => object.id),
    recentEntryIds: recent.map((entry) => entry.id),
  };
}

function normalizeCount(value: number | string | bigint | null | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function sameOrderedValues(
  actual: readonly string[],
  expected: readonly string[],
) {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}
