import type { Kysely, Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureKnowledgeEvidenceRule,
  type VisualFixtureManifest,
} from "@/lib/visual-fixtures/manifest";
import { buildPublicKnowledgeEvidenceEntryIdsQuery } from "@/server/public-knowledge-evidence-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureKnowledgeActualResult {
  entryIds: readonly string[];
  objectIds: readonly string[];
}

export function assertVisualFixtureKnowledgeEvidenceResults(
  label: string,
  expected: VisualFixtureKnowledgeEvidenceRule,
  actual: VisualFixtureKnowledgeActualResult,
) {
  const entriesMatch =
    actual.entryIds.length === expected.expectedCount &&
    actual.entryIds.every(
      (entryId, index) => entryId === expected.expectedEntryIds[index],
    );
  const objectsMatch =
    actual.objectIds.length === expected.expectedObjectIds.length &&
    actual.objectIds.every(
      (objectId, index) => objectId === expected.expectedObjectIds[index],
    );

  if (!entriesMatch || !objectsMatch) {
    throw new Error(
      `Knowledge evidence ${label} diverged from the fixture manifest.`,
    );
  }
}

export async function verifyVisualFixtureKnowledgeEvidence(
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
  const cases: Array<{
    label: string;
    rule: VisualFixtureKnowledgeEvidenceRule;
  }> = [
    ...manifest.knowledgeEvidence.guides.map((guide) => ({
      label: `guide:${guide.slug}`,
      rule: guide.evidence,
    })),
    ...manifest.knowledgeEvidence.answers.map((answer) => ({
      label: `answer:${answer.slug}`,
      rule: answer.evidence,
    })),
    ...manifest.knowledgeEvidence.topics.map((topic) => ({
      label: `topic:${topic.slug}`,
      rule: {
        topicSlugs: [topic.slug],
        catalogSlugs: [],
        expectedCount: topic.expectedEntryIds.length,
        expectedEntryIds: topic.expectedEntryIds,
        expectedObjectIds: topic.expectedObjectIds,
      },
    })),
  ];

  for (const fixtureCase of cases) {
    const rows = await buildPublicKnowledgeEvidenceEntryIdsQuery(
      executor,
      fixtureCase.rule,
      eligibleEntryIds,
    ).execute();
    assertVisualFixtureKnowledgeEvidenceResults(
      fixtureCase.label,
      fixtureCase.rule,
      {
        entryIds: rows.map((row) => row.entryId),
        objectIds: [...new Set(rows.map((row) => row.objectId))],
      },
    );
  }

  return cases.length;
}
