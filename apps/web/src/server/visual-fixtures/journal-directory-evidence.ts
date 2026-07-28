import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureJournalDirectoryQueryEvidence,
  type VisualFixtureManifest,
} from "@/lib/visual-fixtures/manifest";
import {
  buildPublicJournalDirectoryEntriesQuery,
  normalizePublicJournalDirectoryRequest,
  PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
} from "@/server/public-journal-directory-query";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureJournalDirectoryActualResult {
  totalCount: number;
  orderedPublicSlugs: readonly string[];
}

export function assertVisualFixtureJournalDirectoryResults(
  expected: VisualFixtureJournalDirectoryQueryEvidence,
  actual: VisualFixtureJournalDirectoryActualResult,
) {
  if (actual.totalCount !== expected.expectedCount) {
    throw new Error(
      `Journal directory evidence ${expected.id} count diverged from the manifest.`,
    );
  }
  if (
    actual.orderedPublicSlugs.length !==
      expected.expectedOrderedPublicSlugs.length ||
    actual.orderedPublicSlugs.some(
      (slug, index) => slug !== expected.expectedOrderedPublicSlugs[index],
    )
  ) {
    throw new Error(
      `Journal directory evidence ${expected.id} ordering diverged from the manifest.`,
    );
  }
}

export async function verifyVisualFixtureJournalDirectoryEvidence(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
) {
  const eligibleEntryIds = manifest.entries.flatMap((entry) =>
    entry.visibility === "public" &&
    entry.lifecycleState === "active" &&
    entry.publicGoneAt === null &&
    entry.publicSlug !== null &&
    entry.publishedAt !== null
      ? [entry.id]
      : [],
  );

  for (const expected of manifest.journalDirectoryEvidence.queries) {
    const url = new URL(expected.path, "https://visual-fixtures.invalid");
    const locale = url.pathname.startsWith("/bg/")
      ? "bg"
      : url.pathname.startsWith("/ru/")
        ? "ru"
        : "uk";
    const request = normalizePublicJournalDirectoryRequest({
      q: url.searchParams.get("q") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      catalog: url.searchParams.get("catalog") ?? undefined,
      topic: url.searchParams.get("topic") ?? undefined,
      season: url.searchParams.get("season") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    });
    void locale;
    const rows = await buildPublicJournalDirectoryEntriesQuery(
      executor,
      request,
      [],
      eligibleEntryIds,
      "apply",
      "visual_fixture",
    ).execute();
    const actual: VisualFixtureJournalDirectoryActualResult = {
      totalCount: Number(rows[0]?.totalCount ?? 0),
      orderedPublicSlugs: rows
        .slice(0, PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE)
        .map((row) => row.publicSlug),
    };
    assertVisualFixtureJournalDirectoryResults(expected, actual);
  }

  return manifest.journalDirectoryEvidence.queries.length;
}
