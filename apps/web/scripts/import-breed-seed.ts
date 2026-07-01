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
import { breedSeedDefinition } from "../src/lib/catalog/breed-seed";
import {
  importBreedSeed,
  proveBreedSeedGardenReadback,
  readBreedSeedAliasCurationProof,
  readBreedSeedSourceProvenanceProof,
  readBreedSeedTypeaheadProof,
  type BreedSeedAliasCurationProof,
  type BreedSeedImportedConceptSummary,
} from "../src/server/catalog-source/breed-seed-import";

const FORBIDDEN_OUTPUT_MARKERS = [
  '"raw_payload":',
  '"source_only_fields":',
  '"rawPayload":',
  '"sourceOnlyFields":',
  '"allowedProjection":',
  '"allowed_projection":',
  "dadIsEfabisInternalValidation",
  "vboId",
  "dadIsRef",
  "efabisRef",
  "latinNameDispute",
  "restrictedFields",
  "sourceRecordId",
  "source_record_id",
  "sourceRecordKey",
  "source_record_key",
  "coordinates",
  "latitude",
  "longitude",
  "journalBody",
  "ownerUserId",
  "exifGps",
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
  const definition = breedSeedDefinition();
  const imported = await importBreedSeed(db, definition);
  const rerun = await importBreedSeed(db, definition);

  assertRerunStable(imported.concepts, rerun.concepts);

  const carpathian = requireConcept(imported.concepts, "Карпатська бджола");
  const ukrainianSteppe = requireConcept(
    imported.concepts,
    "Українська степова бджола",
  );
  const ukrainianGrey = requireConcept(
    imported.concepts,
    "Ukrainian Grey (Cattle)",
  );
  const bulgarianRhodope = requireConcept(
    imported.concepts,
    "Bulgarian Rhodope (Cattle)",
  );

  const carpathianTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Карпатська",
  );
  const ukrainianSteppeTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Українська степова",
  );
  const vboAnimalTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Ukrainian Grey",
  );
  const blockedLatinTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Apis mellifera carpatica",
  );
  const blockedLocalizedVboTypeaheadProof = await readBreedSeedTypeaheadProof(
    db,
    "Українська сіра",
  );

  const carpathianProvenanceProof = await readBreedSeedSourceProvenanceProof(
    db,
    carpathian.catalogItemId,
  );
  const vboProvenanceProof = await readBreedSeedSourceProvenanceProof(
    db,
    ukrainianGrey.catalogItemId,
  );
  const aliasCurationProof = await Promise.all(
    imported.concepts.map(async (concept) => ({
      canonicalName: concept.canonicalName,
      rows: await readBreedSeedAliasCurationProof(db, concept.catalogItemId),
    })),
  );
  const carpathianReadbackProof = await proveBreedSeedGardenReadback(
    db,
    carpathian.catalogItemId,
    {
      objectKind: "bee_colony",
      proofLabel: "OVE-86 Carpathian colony",
      entryTitle: "OVE-86 official bee breed proof",
    },
  );
  const vboAnimalReadbackProof = await proveBreedSeedGardenReadback(
    db,
    ukrainianGrey.catalogItemId,
    {
      objectKind: "animal",
      proofLabel: "OVE-86 Ukrainian Grey cattle",
      entryTitle: "OVE-86 VBO animal breed proof",
    },
  );

  assertProvenanceProof(carpathianProvenanceProof, "ua-official-bee-breeds");
  assertProvenanceProof(vboProvenanceProof, "vertebrate-breed-ontology");
  assertCatalogItemMatch(
    carpathianTypeaheadProof,
    carpathian.catalogItemId,
    "Imported Carpathian breed is missing by Ukrainian official/common name.",
  );
  assertCatalogItemMatch(
    ukrainianSteppeTypeaheadProof,
    ukrainianSteppe.catalogItemId,
    "Imported Ukrainian Steppe bee breed is missing from typeahead.",
  );
  assertCatalogItemMatch(
    vboAnimalTypeaheadProof,
    ukrainianGrey.catalogItemId,
    "Imported VBO animal breed is missing from typeahead.",
  );
  assertNoCatalogItemMatch(
    blockedLatinTypeaheadProof,
    carpathian.catalogItemId,
    "Review-needed Latin bee breed mapping reached typeahead.",
  );
  assertNoCatalogItemMatch(
    blockedLocalizedVboTypeaheadProof,
    ukrainianGrey.catalogItemId,
    "Review-needed localized VBO breed alias reached typeahead.",
  );
  assertBreedReadback(carpathianReadbackProof, carpathian, "bee_colony");
  assertBreedReadback(vboAnimalReadbackProof, ukrainianGrey, "animal");
  for (const proof of aliasCurationProof) {
    assertAliasCurationProof(proof.rows, proof.canonicalName);
  }

  const output = {
    imported: redactImportSummary(imported),
    idempotencyProof: {
      stableConceptCount: rerun.concepts.length,
      stableCatalogIdentities: true,
    },
    carpathianTypeaheadProof,
    ukrainianSteppeTypeaheadProof,
    vboAnimalTypeaheadProof,
    blockedLatinTypeaheadProof,
    blockedLocalizedVboTypeaheadProof,
    carpathianProvenanceProof: redactProvenanceProof(carpathianProvenanceProof),
    vboProvenanceProof: redactProvenanceProof(vboProvenanceProof),
    aliasCurationProof: aliasCurationProof.map((proof) => ({
      canonicalName: proof.canonicalName,
      rows: redactAliasCurationProof(proof.rows),
    })),
    carpathianReadbackProof,
    vboAnimalReadbackProof,
    vboConceptsCovered: [
      ukrainianGrey.canonicalName,
      bulgarianRhodope.canonicalName,
    ],
    leakCheck: "passed",
  };
  assertNoForbiddenOutput(output);

  console.log(JSON.stringify(output, null, 2));
}

function requireConcept(
  concepts: BreedSeedImportedConceptSummary[],
  canonicalName: string,
) {
  const concept = concepts.find(
    (candidate) => candidate.canonicalName === canonicalName,
  );
  if (!concept)
    throw new Error(`Missing imported breed concept: ${canonicalName}`);
  return concept;
}

function assertRerunStable(
  imported: BreedSeedImportedConceptSummary[],
  rerun: BreedSeedImportedConceptSummary[],
) {
  if (rerun.length !== imported.length) {
    throw new Error("Re-run changed the number of imported breed concepts.");
  }

  for (const concept of imported) {
    const rerunConcept = rerun.find(
      (candidate) => candidate.canonicalName === concept.canonicalName,
    );
    if (!rerunConcept) {
      throw new Error(`Re-run lost breed concept ${concept.canonicalName}.`);
    }
    if (rerunConcept.catalogItemId !== concept.catalogItemId) {
      throw new Error(
        `Re-run changed catalog item for ${concept.canonicalName}.`,
      );
    }
    if (rerunConcept.sourceRecordId !== concept.sourceRecordId) {
      throw new Error(
        `Re-run changed source row for ${concept.canonicalName}.`,
      );
    }
  }
}

function assertCatalogItemMatch(
  rows: Array<{ catalogItemId: string; catalogKind: string }>,
  catalogItemId: string,
  message: string,
) {
  if (
    !rows.some(
      (row) =>
        row.catalogItemId === catalogItemId && row.catalogKind === "breed",
    )
  ) {
    throw new Error(message);
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

function assertProvenanceProof(
  row:
    | Awaited<ReturnType<typeof readBreedSeedSourceProvenanceProof>>
    | undefined,
  expectedSourceSlug: string,
) {
  if (!row) throw new Error(`Missing provenance for ${expectedSourceSlug}.`);
  if (row.catalogKind !== "breed") {
    throw new Error("Breed provenance proof did not preserve catalog kind.");
  }
  if (row.sourceSlug !== expectedSourceSlug) {
    throw new Error(
      `Breed provenance proof source mismatch: expected ${expectedSourceSlug}.`,
    );
  }
  if (!Array.isArray(row.allowedUsage)) {
    throw new Error("Breed provenance proof did not expose allowed usage.");
  }
  if (!row.allowedUsage.includes("canonical_product_projection")) {
    throw new Error("Breed provenance proof is missing projection usage.");
  }
}

function assertBreedReadback(
  readback: Awaited<ReturnType<typeof proveBreedSeedGardenReadback>>,
  concept: BreedSeedImportedConceptSummary,
  expectedObjectKind: "bee_colony" | "animal",
) {
  if (readback.catalogItemId !== concept.catalogItemId) {
    throw new Error("Garden readback proof did not preserve breed identity.");
  }
  if (readback.objectKind !== expectedObjectKind) {
    throw new Error(
      `Garden readback proof expected ${expectedObjectKind}, got ${readback.objectKind}.`,
    );
  }
  if (readback.catalogKind !== "breed") {
    throw new Error("Garden readback proof did not preserve breed kind.");
  }
  if (readback.catalogCanonicalName !== concept.canonicalName) {
    throw new Error("Garden readback proof did not preserve canonical name.");
  }
}

function assertAliasCurationProof(
  rows: BreedSeedAliasCurationProof[],
  canonicalName: string,
) {
  const accepted = rows.filter((row) => row.status === "accepted");
  const reviewNeeded = rows.filter((row) => row.status === "review_needed");

  if (accepted.length < 2) {
    throw new Error(
      `Breed alias proof for ${canonicalName} is missing aliases.`,
    );
  }
  if (reviewNeeded.length < 1) {
    throw new Error(
      `Breed alias proof for ${canonicalName} is missing held aliases.`,
    );
  }
  if (reviewNeeded.some((row) => row.projectedToTypeahead)) {
    throw new Error("Review-needed breed aliases reached typeahead.");
  }
  if (!rows.every((row) => row.canonicalName === canonicalName)) {
    throw new Error(
      `Breed alias proof for ${canonicalName} contains another concept.`,
    );
  }
}

function redactImportSummary<
  T extends {
    sourceIds?: unknown;
    sourceRecordId?: unknown;
    sourceRecordKey?: unknown;
    sourceRecordIds?: unknown;
    concepts?: BreedSeedImportedConceptSummary[];
  },
>(value: T) {
  const redacted = { ...value };
  delete redacted.sourceIds;
  delete redacted.sourceRecordId;
  delete redacted.sourceRecordKey;
  delete redacted.sourceRecordIds;
  if (redacted.concepts) {
    redacted.concepts = redacted.concepts.map((concept) => ({
      catalogItemId: concept.catalogItemId,
      catalogKind: concept.catalogKind,
      sourceSlug: concept.sourceSlug,
      sourceVersion: concept.sourceVersion,
      canonicalName: concept.canonicalName,
      publicSlug: concept.publicSlug,
      source: concept.source,
      sourceId: concept.sourceId,
      expectedObjectKind: concept.expectedObjectKind,
      aliasesProjected: concept.aliasesProjected,
      aliasesRecorded: concept.aliasesRecorded,
      aliasStatusCounts: concept.aliasStatusCounts,
    })) as T["concepts"];
  }
  return redacted;
}

function redactProvenanceProof(
  row: Awaited<ReturnType<typeof readBreedSeedSourceProvenanceProof>>,
) {
  if (!row) return null;
  return {
    catalogItemId: row.catalogItemId,
    canonicalName: row.canonicalName,
    catalogKind: row.catalogKind,
    status: row.status,
    source: row.source,
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceVersion: row.sourceVersion,
    sourceUrl: row.sourceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attributionRequired: row.attributionRequired,
    attributionText: row.attributionText,
    allowedUsage: row.allowedUsage,
    snapshotSha256: row.snapshotSha256,
    parserVersion: row.parserVersion,
    fetchedAt: row.fetchedAt,
    verifiedAt: row.verifiedAt,
    projectionStatus: row.projectionStatus,
  };
}

function redactAliasCurationProof(rows: BreedSeedAliasCurationProof[]) {
  return rows.map((row) => ({
    catalogItemId: row.catalogItemId,
    catalogItemNameId: row.catalogItemNameId,
    canonicalName: row.canonicalName,
    displayName: row.displayName,
    locale: row.locale,
    script: row.script,
    aliasKind: row.aliasKind,
    status: row.status,
    sourceSlug: row.sourceSlug,
    sourceMethod: row.sourceMethod,
    confidence: row.confidence,
    license: row.license,
    attributionRequired: row.attributionRequired,
    projectedToTypeahead: row.projectedToTypeahead,
    projectionNotes: row.projectionNotes,
  }));
}

function assertNoForbiddenOutput(output: unknown) {
  const text = JSON.stringify(output);
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(`Unsafe source-only marker reached output: ${marker}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
