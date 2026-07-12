import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureManifest,
  type VisualFixtureProfileScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";
import { getProfileViewerState } from "@/server/profile-interaction-repository";
import {
  getPublicProfileEvidencePageByHandle,
  getPublicProfileEvidencePreviewByUserId,
} from "@/server/public-profile-repository";
import { scopedToUser } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureProfileActualResult {
  status: 200 | 404;
  publicObjectCount: number;
  publicEntryCount: number;
  objectIds: readonly string[];
  journalEntryIds: readonly string[];
  followerCount: number | null;
  followingCount: number | null;
  hasAvatar: boolean;
}

export function assertVisualFixtureProfileEvidenceResult(
  expected: VisualFixtureProfileScenarioEvidence,
  actual: VisualFixtureProfileActualResult,
) {
  if (actual.status !== expected.expectedStatus) {
    throw new Error(
      `Profile evidence ${expected.id} returned ${actual.status}, expected ${expected.expectedStatus}.`,
    );
  }
  if (expected.expectedStatus !== 200) return;

  if (
    actual.publicObjectCount !== expected.expectedPublicObjectCount ||
    actual.publicEntryCount !== expected.expectedPublicEntryCount
  ) {
    throw new Error(
      `Profile evidence ${expected.id} public counts diverged from the manifest.`,
    );
  }
  if (
    !sameOrderedValues(actual.objectIds, expected.expectedObjectIds) ||
    !sameOrderedValues(actual.journalEntryIds, expected.expectedJournalEntryIds)
  ) {
    throw new Error(
      `Profile evidence ${expected.id} ordered evidence diverged from the manifest.`,
    );
  }
  if (
    actual.followerCount !== expected.expectedFollowerCount ||
    actual.followingCount !== expected.expectedFollowingCount
  ) {
    throw new Error(
      `Profile evidence ${expected.id} relationship counts diverged from the manifest.`,
    );
  }
  if (actual.hasAvatar !== expected.expectedAvatar) {
    throw new Error(
      `Profile evidence ${expected.id} avatar state diverged from the manifest.`,
    );
  }
}

export async function verifyVisualFixtureProfileEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  for (const expected of manifest.profileEvidence.scenarios) {
    const actual = await readProfileEvidence(expected, executor);
    assertVisualFixtureProfileEvidenceResult(expected, actual);
  }
  return manifest.profileEvidence.scenarios.length;
}

async function readProfileEvidence(
  expected: VisualFixtureProfileScenarioEvidence,
  executor: QueryExecutor,
): Promise<VisualFixtureProfileActualResult> {
  if (!expected.profileActorId) return emptyResult();

  if (expected.access === "owner") {
    const page = await getPublicProfileEvidencePreviewByUserId(
      expected.profileActorId,
      "uk",
      executor,
    );
    return page ? serializePage(page) : emptyResult();
  }

  if (expected.sessionActorId) {
    const viewer = await getProfileViewerState(
      scopedToUser(expected.sessionActorId),
      expected.handle,
      executor,
    );
    if (viewer.kind === "blocked" || viewer.kind === "unavailable") {
      return emptyResult();
    }
  }

  const page = await getPublicProfileEvidencePageByHandle(
    expected.handle,
    "uk",
    executor,
  );
  return page ? serializePage(page) : emptyResult();
}

function serializePage(
  page: NonNullable<
    Awaited<ReturnType<typeof getPublicProfileEvidencePageByHandle>>
  >,
): VisualFixtureProfileActualResult {
  return {
    status: 200,
    publicObjectCount: page.summary.publicObjectCount,
    publicEntryCount: page.summary.publicEntryCount,
    objectIds: page.objects.map((object) => object.objectId),
    journalEntryIds: page.journals.map((journal) => journal.entryId),
    followerCount: page.summary.relationships?.followers ?? null,
    followingCount: page.summary.relationships?.following ?? null,
    hasAvatar: page.avatarUrl !== null,
  };
}

function emptyResult(): VisualFixtureProfileActualResult {
  return {
    status: 404,
    publicObjectCount: 0,
    publicEntryCount: 0,
    objectIds: [],
    journalEntryIds: [],
    followerCount: null,
    followingCount: null,
    hasAvatar: false,
  };
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
