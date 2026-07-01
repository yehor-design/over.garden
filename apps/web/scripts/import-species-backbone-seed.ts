import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  speciesBackboneConcepts,
  speciesBackboneSeedDefinition,
  type SpeciesBackboneAliasCandidate,
  type SpeciesBackboneConceptDefinition,
} from "../src/lib/catalog/species-backbone-seed";
import {
  importSpeciesBackboneSeed,
  proveSpeciesBackboneGardenReadback,
  readSpeciesBackboneAliasCurationProof,
  readSpeciesBackboneSourceProvenanceProof,
  readSpeciesBackboneTypeaheadProof,
  type SpeciesBackboneConceptImportSummary,
} from "../src/server/catalog-source/species-backbone-import";

const REQUIRED_SOURCE_SLUGS = [
  "catalogue-of-life-checklistbank",
  "world-flora-online",
  "gbif-backbone",
  "eppo-codes",
  "wikidata",
] as const;

const FORBIDDEN_OUTPUT_MARKERS = [
  '"raw_payload":',
  '"source_only_fields":',
  '"sourceOnlyFields":',
  '"rawPayload":',
  '"allowedProjection":',
  '"allowed_projection":',
  "sourceRecordId",
  "source_record_id",
  "sourceRecordKey",
  "source_record_key",
  "rawPayloadSha256",
  "sourceFileSha256",
  "decimalLatitude",
  "decimalLongitude",
  "poisonCoordinateSentinel",
  "nonProjectedDistributionText",
  "journalBody",
  "ownerUserId",
  "exifGps",
  "sourceFileRowCount",
];

loadEnv({ path: ".env.local" });

const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);

if (!connectionString) {
  throw new Error("Missing supported database connection env");
}

const pool = new Pool({
  connectionString,
  max: 1,
  ssl: resolveDatabaseSslConfig(process.env, resolution),
});
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

async function main() {
  const definition = speciesBackboneSeedDefinition();
  const concepts = speciesBackboneConcepts(definition);
  const imported = await importSpeciesBackboneSeed(db, definition);
  const rerun = await importSpeciesBackboneSeed(db, definition);

  if (imported.importedConcepts !== concepts.length) {
    throw new Error(
      `Species import projected ${imported.importedConcepts} concepts; expected ${concepts.length}.`,
    );
  }
  if (rerun.importedConcepts !== imported.importedConcepts) {
    throw new Error("Re-run import changed the imported concept count.");
  }

  const importedByKey = indexSummaries(imported.concepts);
  const rerunByKey = indexSummaries(rerun.concepts);
  const typeaheadProof = [];
  const blockedAliasProof = [];
  const provenanceProof = [];
  const aliasCurationProof = [];
  const gardenReadbackProof = [];

  for (const concept of concepts) {
    const summary = requiredSummary(importedByKey, concept.key);
    const rerunSummary = requiredSummary(rerunByKey, concept.key);

    if (rerunSummary.catalogItemId !== summary.catalogItemId) {
      throw new Error(`${concept.key} re-run created a different catalog item.`);
    }

    for (const slug of REQUIRED_SOURCE_SLUGS) {
      if (rerunSummary.sourceRecordIds[slug] !== summary.sourceRecordIds[slug]) {
        throw new Error(
          `${concept.key} re-run created a different ${slug} source row.`,
        );
      }
    }

    for (const query of representativeProjectedQueries(concept)) {
      const rows = await readSpeciesBackboneTypeaheadProof(db, query);
      const matchingRows = rows.filter(
        (row) => row.catalogItemId === summary.catalogItemId,
      );
      if (matchingRows.length === 0) {
        throw new Error(
          `${concept.key} is missing from typeahead for query "${query}".`,
        );
      }
      typeaheadProof.push({
        conceptKey: concept.key,
        query,
        matchedDisplays: matchingRows.map((row) => row.displayName),
        canonicalName: summary.canonicalName,
        catalogKind: summary.catalogKind,
      });
    }

    for (const alias of concept.aliasCandidates.filter(
      (candidate) => candidate.status !== "accepted",
    )) {
      const rows = await readSpeciesBackboneTypeaheadProof(
        db,
        alias.displayName,
      );
      assertNoCatalogItemMatch(
        rows,
        summary.catalogItemId,
        `${concept.key} ${alias.status} alias reached typeahead: ${alias.displayName}`,
      );
      blockedAliasProof.push({
        conceptKey: concept.key,
        displayName: alias.displayName,
        status: alias.status,
        projectedToTypeahead: false,
      });
    }

    const sourceRows = await readSpeciesBackboneSourceProvenanceProof(
      db,
      summary.catalogItemId,
    );
    assertRequiredSourceCoverage(concept.key, sourceRows);
    assertRequiredAttributionProof(sourceRows);
    provenanceProof.push({
      conceptKey: concept.key,
      sourceSlugs: sourceRows.map((row) => row.sourceSlug).sort(),
      attributionRequiredSources: sourceRows.filter(
        (row) => row.attributionRequired,
      ).length,
      attributionCreditsPresent: true,
    });

    const aliasRows = await readSpeciesBackboneAliasCurationProof(
      db,
      summary.catalogItemId,
    );
    assertAliasCurationProof(aliasRows, summary.catalogItemId);
    aliasCurationProof.push({
      conceptKey: concept.key,
      statusCounts: countAliasStatuses(aliasRows),
      acceptedProjectedToTypeahead: aliasRows
        .filter((row) => row.status === "accepted")
        .every((row) => row.projectedToTypeahead),
      blockedAliasesHeldForReview: aliasRows
        .filter((row) => row.status !== "accepted")
        .every((row) => !row.projectedToTypeahead),
    });

    const gardenReadback = await proveSpeciesBackboneGardenReadback(
      db,
      summary.catalogItemId,
      concept.projection,
    );
    if (gardenReadback.catalogItemId !== summary.catalogItemId) {
      throw new Error(
        `${concept.key} garden readback did not preserve catalog identity.`,
      );
    }
    if (gardenReadback.catalogSource !== "species_backbone") {
      throw new Error(
        `${concept.key} garden readback did not preserve species source.`,
      );
    }
    gardenReadbackProof.push({
      conceptKey: concept.key,
      canonicalName: gardenReadback.catalogCanonicalName,
      varietyState: gardenReadback.varietyState,
      catalogSource: gardenReadback.catalogSource,
    });
  }

  const output = {
    imported: {
      importedConcepts: imported.importedConcepts,
      sourceRowsImported: imported.sourceRowsImported,
      concepts: imported.concepts.map(redactConceptSummary),
      reindexQueued: imported.reindexQueued,
    },
    idempotencyProof: {
      rerunImportedConcepts: rerun.importedConcepts,
      stableCatalogItems: true,
      stableSourceRows: true,
    },
    typeaheadProof,
    blockedAliasProof,
    provenanceProof,
    aliasCurationProof,
    gardenReadbackProof,
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function representativeProjectedQueries(
  concept: SpeciesBackboneConceptDefinition,
) {
  const queries = concept.projection.aliases.map((alias) => alias.displayName);
  return [...new Set(queries)];
}

function redactConceptSummary(summary: SpeciesBackboneConceptImportSummary) {
  return {
    key: summary.key,
    catalogItemId: summary.catalogItemId,
    catalogKind: summary.catalogKind,
    canonicalName: summary.canonicalName,
    acceptedScientificName: summary.acceptedScientificName,
    publicSlug: summary.publicSlug,
    sourceSlugs: [...new Set(summary.sourceSlugs)].sort(),
    aliasesProjected: summary.aliasesProjected,
    aliasesRecorded: summary.aliasesRecorded,
    aliasStatusCounts: summary.aliasStatusCounts,
  };
}

function indexSummaries(summaries: SpeciesBackboneConceptImportSummary[]) {
  return new Map(summaries.map((summary) => [summary.key, summary]));
}

function requiredSummary(
  summaries: ReadonlyMap<string, SpeciesBackboneConceptImportSummary>,
  key: string,
) {
  const summary = summaries.get(key);
  if (!summary) {
    throw new Error(`Missing import summary for species concept ${key}.`);
  }
  return summary;
}

function assertNoForbiddenOutput(output: unknown) {
  const text = JSON.stringify(output);
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(`Unsafe source-only marker reached output: ${marker}`);
    }
  }
}

function assertNoCatalogItemMatch(
  rows: Array<{ catalogItemId: string }>,
  catalogItemId: string,
  message: string,
) {
  if (rows.some((row) => row.catalogItemId === catalogItemId)) {
    throw new Error(message);
  }
}

function assertAliasCurationProof(
  rows: Array<{
    catalogItemId: string;
    displayName: string;
    status: string;
    sourceSlug: string;
    sourceMethod: string;
    projectedToTypeahead: boolean;
  }>,
  catalogItemId: string,
) {
  const acceptedRows = rows.filter((row) => row.status === "accepted");
  const blockedRows = rows.filter((row) => row.status !== "accepted");
  if (acceptedRows.length === 0) {
    throw new Error("Missing accepted alias curation proof.");
  }
  if (blockedRows.length === 0) {
    throw new Error("Missing blocked alias curation proof.");
  }

  for (const row of acceptedRows) {
    if (
      row.catalogItemId !== catalogItemId ||
      row.sourceMethod !== "source_backed" ||
      !row.projectedToTypeahead
    ) {
      throw new Error(
        `Accepted alias curation proof is invalid for ${row.displayName}.`,
      );
    }
  }

  for (const row of blockedRows) {
    if (row.projectedToTypeahead) {
      throw new Error(
        `Blocked alias curation proof is invalid for ${row.displayName}.`,
      );
    }
  }
}

function assertRequiredSourceCoverage(
  conceptKey: string,
  rows: Array<{ sourceSlug: string }>,
) {
  for (const slug of REQUIRED_SOURCE_SLUGS) {
    if (!rows.some((row) => row.sourceSlug === slug)) {
      throw new Error(`Missing ${conceptKey} provenance row for ${slug}.`);
    }
  }
}

function assertRequiredAttributionProof(
  rows: Array<{
    sourceSlug: string;
    attributionRequired: boolean;
    licenseUrl: string | null;
    attributionText: string | null;
  }>,
) {
  const missingCreditRows = rows.filter(
    (row) =>
      row.attributionRequired && (!row.licenseUrl || !row.attributionText),
  );

  if (missingCreditRows.length > 0) {
    throw new Error(
      `Attribution-required source provenance is missing credits for ${missingCreditRows
        .map((row) => row.sourceSlug)
        .join(", ")}.`,
    );
  }
}

function countAliasStatuses(
  rows: Array<{ status: SpeciesBackboneAliasCandidate["status"] | string }>,
) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
