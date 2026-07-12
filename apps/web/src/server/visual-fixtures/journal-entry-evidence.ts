import type { Kysely, Transaction } from "kysely";

import type { Database, PlantObjectKind } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureJournalEntryContentLength,
  type VisualFixtureJournalEntryScenarioEvidence,
  type VisualFixtureManifest,
} from "@/lib/visual-fixtures/manifest";
import type { PublicLocale } from "@/lib/public-localization";
import { getPublicJournalEntryLookup } from "@/server/journal-repository";
import { getOwnerJournalEntryControl } from "@/server/owner-journal-entry-control";
import { scopedToUser } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureJournalEntryActualResult {
  status: 200 | 404 | 410;
  contextKind: "object" | "space" | null;
  objectKind: PlantObjectKind | null;
  contentLength: VisualFixtureJournalEntryContentLength | null;
  mediaKeys: readonly string[];
  mentionCount: number;
  hasNewer: boolean;
  hasOlder: boolean;
  ownerControlVisible: boolean;
}

export function assertVisualFixtureJournalEntryEvidenceResult(
  expected: VisualFixtureJournalEntryScenarioEvidence,
  expectedMediaKeys: readonly string[],
  actual: VisualFixtureJournalEntryActualResult,
) {
  if (actual.status !== expected.expectedStatus) {
    throw new Error(
      `Journal entry evidence ${expected.id} returned ${actual.status}, expected ${expected.expectedStatus}.`,
    );
  }
  if (expected.expectedStatus !== 200) return;

  if (
    actual.contextKind !== expected.contextKind ||
    actual.objectKind !== expected.objectKind
  ) {
    throw new Error(
      `Journal entry evidence ${expected.id} context diverged from the manifest.`,
    );
  }
  if (actual.contentLength !== expected.contentLength) {
    throw new Error(
      `Journal entry evidence ${expected.id} content diverged from the manifest.`,
    );
  }

  const expectedSortedMedia = [...expectedMediaKeys].sort();
  const actualSortedMedia = [...actual.mediaKeys].sort();
  if (
    actualSortedMedia.length !== expected.expectedMediaCount ||
    actualSortedMedia.some(
      (mediaKey, index) => mediaKey !== expectedSortedMedia[index],
    )
  ) {
    throw new Error(
      `Journal entry evidence ${expected.id} media diverged from the manifest.`,
    );
  }
  if (actual.mentionCount !== expected.expectedMentionCount) {
    throw new Error(
      `Journal entry evidence ${expected.id} mentions diverged from the manifest.`,
    );
  }
  if (
    actual.hasNewer !== expected.expectedNewer ||
    actual.hasOlder !== expected.expectedOlder
  ) {
    throw new Error(
      `Journal entry evidence ${expected.id} chronology diverged from the manifest.`,
    );
  }

  const shouldShowOwnerControl = expected.access === "owner";
  if (actual.ownerControlVisible !== shouldShowOwnerControl) {
    throw new Error(
      `Journal entry evidence ${expected.id} owner control diverged from the manifest.`,
    );
  }
}

export async function verifyVisualFixtureJournalEntryEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  for (const expected of manifest.journalEntryEvidence.scenarios) {
    const expectedMediaKeys = manifest.media
      .filter((media) => media.entryId === expected.entryId)
      .map((media) => media.derivativeKey);
    const actual = await readJournalEntryEvidence(expected, manifest, executor);
    assertVisualFixtureJournalEntryEvidenceResult(
      expected,
      expectedMediaKeys,
      actual,
    );
  }

  return manifest.journalEntryEvidence.scenarios.length;
}

async function readJournalEntryEvidence(
  expected: VisualFixtureJournalEntryScenarioEvidence,
  manifest: VisualFixtureManifest,
  executor: QueryExecutor,
): Promise<VisualFixtureJournalEntryActualResult> {
  const locale = localeFromPath(expected.path);
  const lookup = await getPublicJournalEntryLookup(
    expected.publicSlug,
    executor,
    locale,
  );
  if (lookup.status === "gone") return emptyResult(410);
  if (lookup.status === "not_found") return emptyResult(404);

  const ownerControl = expected.sessionActorId
    ? await getOwnerJournalEntryControl(
        scopedToUser(expected.sessionActorId),
        expected.publicSlug,
        executor,
      )
    : null;
  const context = lookup.page.context;

  return {
    status: 200,
    contextKind: context.kind,
    objectKind: context.kind === "object" ? context.object.objectKind : null,
    contentLength: contentLength(lookup.page.entry.body),
    mediaKeys: lookup.page.media.map((media) =>
      resolveFixtureMediaKey(media.publicUrl, manifest),
    ),
    mentionCount:
      context.kind === "space" ? context.mentionedObjects.length : 0,
    hasNewer: lookup.page.adjacentEntries.newer !== null,
    hasOlder: lookup.page.adjacentEntries.older !== null,
    ownerControlVisible: ownerControl !== null,
  };
}

function emptyResult(status: 404 | 410): VisualFixtureJournalEntryActualResult {
  return {
    status,
    contextKind: null,
    objectKind: null,
    contentLength: null,
    mediaKeys: [],
    mentionCount: 0,
    hasNewer: false,
    hasOlder: false,
    ownerControlVisible: false,
  };
}

function contentLength(body: string): VisualFixtureJournalEntryContentLength {
  if (body.length < 180) return "short";
  if (body.length > 800) return "long";
  return "normal";
}

function localeFromPath(path: string): PublicLocale {
  if (path.startsWith("/bg/")) return "bg";
  if (path.startsWith("/ru/")) return "ru";
  return "uk";
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
