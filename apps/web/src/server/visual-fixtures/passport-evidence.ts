import type { Kysely, Transaction } from "kysely";

import type { Database, PlantObjectKind, VarietyState } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureManifest,
  type VisualFixturePassportIdentityState,
  type VisualFixturePassportScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";
import { getPlantObjectPage } from "@/server/journal-repository";
import { getPublicObjectPassportLookup } from "@/server/public-object-passport-repository";
import { scopedToUser } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixturePassportActualResult {
  status: 200 | 404 | 410;
  objectKind: PlantObjectKind | null;
  identityState: VisualFixturePassportIdentityState | null;
  timelineEntryIds: readonly string[];
  mediaKeys: readonly string[];
}

export function assertVisualFixturePassportEvidenceResult(
  expected: VisualFixturePassportScenarioEvidence,
  expectedMediaKeys: readonly string[],
  actual: VisualFixturePassportActualResult,
) {
  if (actual.status !== expected.expectedStatus) {
    throw new Error(
      `Passport evidence ${expected.id} returned ${actual.status}, expected ${expected.expectedStatus}.`,
    );
  }

  if (expected.expectedStatus !== 200) return;

  if (
    actual.objectKind !== expected.objectKind ||
    actual.identityState !== expected.identityState
  ) {
    throw new Error(
      `Passport evidence ${expected.id} identity diverged from the manifest.`,
    );
  }

  if (
    actual.timelineEntryIds.length !== expected.expectedTimelineCount ||
    actual.timelineEntryIds.some(
      (entryId, index) => entryId !== expected.expectedTimelineEntryIds[index],
    )
  ) {
    throw new Error(
      `Passport evidence ${expected.id} timeline diverged from the manifest.`,
    );
  }

  const expectedSortedMediaKeys = [...expectedMediaKeys].sort();
  const actualSortedMediaKeys = [...actual.mediaKeys].sort();
  if (
    actualSortedMediaKeys.length !== expected.expectedMediaAspects.length ||
    actualSortedMediaKeys.some(
      (mediaKey, index) => mediaKey !== expectedSortedMediaKeys[index],
    )
  ) {
    throw new Error(
      `Passport evidence ${expected.id} media diverged from the manifest.`,
    );
  }
}

export async function verifyVisualFixturePassportEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  for (const expected of manifest.passportEvidence.scenarios) {
    const expectedMediaKeys = expectedPassportMediaKeys(expected, manifest);
    const actual =
      expected.access === "guest-public"
        ? await readPublicPassportEvidence(expected, manifest, executor)
        : await readOwnerPassportEvidence(expected, executor);

    assertVisualFixturePassportEvidenceResult(
      expected,
      expectedMediaKeys,
      actual,
    );
  }

  return manifest.passportEvidence.scenarios.length;
}

async function readPublicPassportEvidence(
  expected: VisualFixturePassportScenarioEvidence,
  manifest: VisualFixtureManifest,
  executor: QueryExecutor,
): Promise<VisualFixturePassportActualResult> {
  const lookup = await getPublicObjectPassportLookup(
    expected.objectId,
    executor,
  );
  if (lookup.status === "gone") return emptyResult(410);
  if (lookup.status === "not_found") return emptyResult(404);

  const timeline = [
    ...lookup.page.journalPreview,
    ...lookup.page.journalContinuation,
  ];

  return {
    status: 200,
    objectKind: lookup.page.object.objectKind,
    identityState: resolvePassportIdentityState(
      lookup.page.object.varietyState,
      Boolean(lookup.page.object.catalogCanonicalName),
    ),
    timelineEntryIds: timeline.map((entry) => entry.id),
    mediaKeys: lookup.page.galleryMediaPublicUrls.map((publicUrl) =>
      resolveFixtureMediaKey(publicUrl, manifest),
    ),
  };
}

async function readOwnerPassportEvidence(
  expected: VisualFixturePassportScenarioEvidence,
  executor: QueryExecutor,
): Promise<VisualFixturePassportActualResult> {
  const page = await getPlantObjectPage(
    scopedToUser(expected.ownerActorId),
    expected.objectId,
    executor,
  );
  if (!page) return emptyResult(404);

  return {
    status: 200,
    objectKind: page.plantObject.object_kind,
    identityState: resolvePassportIdentityState(
      page.plantObject.variety_state,
      Boolean(page.plantObject.catalog_item_id),
    ),
    timelineEntryIds: page.entries.map((entry) => entry.id),
    mediaKeys: page.gallery_media.map((media) => media.derivativeKey),
  };
}

function emptyResult(status: 404 | 410): VisualFixturePassportActualResult {
  return {
    status,
    objectKind: null,
    identityState: null,
    timelineEntryIds: [],
    mediaKeys: [],
  };
}

function resolvePassportIdentityState(
  varietyState: VarietyState,
  hasCatalogIdentity: boolean,
): VisualFixturePassportIdentityState {
  if (varietyState === "selected" && hasCatalogIdentity) return "confirmed";
  if (varietyState === "user_added" || varietyState === "free_text") {
    return "provisional";
  }
  return "unknown";
}

function expectedPassportMediaKeys(
  expected: VisualFixturePassportScenarioEvidence,
  manifest: VisualFixtureManifest,
) {
  const timelineIds = new Set(expected.expectedTimelineEntryIds);
  return manifest.media
    .filter((media) => timelineIds.has(media.entryId))
    .map((media) => media.derivativeKey);
}

function resolveFixtureMediaKey(
  publicUrl: string,
  manifest: VisualFixtureManifest,
) {
  const pathname = decodeURIComponent(new URL(publicUrl).pathname);
  const match = manifest.media.find((media) =>
    pathname.endsWith(`/${media.derivativeKey}`),
  );
  return match?.derivativeKey ?? `unrecognized:${pathname}`;
}
