import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenCatalogSeedRolloutEvidence,
  buildCatalogSeedRolloutEvidence,
  buildSafeSeedCommandSummary,
  CATALOG_SEED_ROLLOUT_COMMANDS,
  CATALOG_SEED_ROLLOUT_REQUIRED_QUERIES,
  extractJsonObjectFromCommandOutput,
  parseCatalogSeedRolloutArgs,
  validateCatalogSeedRolloutOptions,
} from "./seed-rollout-proof";

describe("catalog seed rollout proof", () => {
  it("requires explicit matching environment confirmation", () => {
    expect(() =>
      validateCatalogSeedRolloutOptions(
        parseCatalogSeedRolloutArgs([
          "--environment",
          "production",
          "--confirm-environment",
          "staging",
          "--base-url",
          "https://over.garden",
          "--allow-non-local-mutation",
        ]),
      ),
    ).toThrow("--confirm-environment must exactly match --environment");
  });

  it("blocks non-local mutation unless the operator explicitly allows it", () => {
    expect(() =>
      validateCatalogSeedRolloutOptions(
        parseCatalogSeedRolloutArgs([
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--base-url",
          "https://over.garden",
        ]),
      ),
    ).toThrow("Non-local rollout proof requires");
  });

  it("rejects local proofs pointed at deployed origins", () => {
    expect(() =>
      validateCatalogSeedRolloutOptions(
        parseCatalogSeedRolloutArgs([
          "--environment",
          "local",
          "--confirm-environment",
          "local",
          "--base-url",
          "https://over.garden",
        ]),
      ),
    ).toThrow("Local rollout proof must use a local app base URL");
  });

  it("extracts JSON after dotenv output that contains braces", () => {
    expect(
      extractJsonObjectFromCommandOutput(
        '◇ injected env // tip: suppress logs { quiet: true }\n{\n  "ok": true\n}\n',
      ),
    ).toEqual({ ok: true });
  });

  it("builds redacted seed command summaries from verbose importer output", () => {
    const summary = buildSafeSeedCommandSummary(
      CATALOG_SEED_ROLLOUT_COMMANDS[0],
      {
        imported: {
          catalogItemId: "00000000-0000-4000-8000-000000057001",
          canonicalName: "Ботсадівський",
          catalogKind: "plant_variety",
          publicSlug: "botsadivskyi-ua-register-83070006",
          aliasesProjected: 4,
          reindexQueued: true,
          sourceRecordId: "must-not-survive",
          rawPayloadSha256: "must-not-survive",
        },
        idempotencyProof: {
          rerunCatalogItemId: "00000000-0000-4000-8000-000000057001",
          rerunSourceRecordId: "must-not-survive",
        },
        provenanceProof: {
          sourceRecordKey: "must-not-survive",
        },
        leakCheck: "passed",
      },
    );

    expect(summary).toEqual({
      key: "ua-register-variety",
      packageScript: "catalog:sources:import-ua-register-variety",
      sourceSet: "OVE-81 UA State Register official variety wave",
      expectedCanonicalName: "Ботсадівський",
      catalogItemId: "00000000-0000-4000-8000-000000057001",
      publicSlug: "botsadivskyi-ua-register-83070006",
      canonicalName: "Ботсадівський",
      catalogKind: "plant_variety",
      source: "ua_state_register",
      aliasesProjected: 4,
      reindexQueued: true,
      stableProductIdentityOnRerun: true,
      sourceProofRecorded: true,
      leakCheck: "passed",
    });
    expect(JSON.stringify(summary)).not.toContain("sourceRecord");
    expect(JSON.stringify(summary)).not.toContain("rawPayload");
  });

  it("builds redacted seed summaries from multi-concept species importer output", () => {
    const summary = buildSafeSeedCommandSummary(
      CATALOG_SEED_ROLLOUT_COMMANDS[1],
      {
        imported: {
          importedConcepts: 4,
          reindexQueued: true,
          concepts: [
            {
              key: "solanum-lycopersicum",
              catalogItemId: "00000000-0000-4000-8000-000000058003",
              canonicalName: "Solanum lycopersicum L.",
              catalogKind: "species",
              publicSlug: "solanum-lycopersicum-species-backbone",
              aliasesProjected: 9,
              sourceRecordIds: {
                wikidata: "must-not-survive",
              },
            },
          ],
        },
        idempotencyProof: {
          stableCatalogItems: true,
          stableSourceRows: true,
        },
        provenanceProof: [
          {
            sourceRecordKey: "must-not-survive",
          },
        ],
        leakCheck: "passed",
      },
    );

    expect(summary).toMatchObject({
      key: "species-backbone",
      expectedCanonicalName: "Solanum lycopersicum L.",
      catalogItemId: "00000000-0000-4000-8000-000000058003",
      canonicalName: "Solanum lycopersicum L.",
      catalogKind: "species",
      source: "species_backbone",
      aliasesProjected: 9,
      reindexQueued: true,
      stableProductIdentityOnRerun: true,
      sourceProofRecorded: true,
      leakCheck: "passed",
    });
    expect(JSON.stringify(summary)).not.toContain("sourceRecord");
  });

  it("builds redacted seed summaries from multi-concept breed importer output", () => {
    const summary = buildSafeSeedCommandSummary(
      CATALOG_SEED_ROLLOUT_COMMANDS[2],
      {
        imported: {
          conceptsImported: 5,
          aliasesProjected: 13,
          reindexQueued: true,
          concepts: [
            {
              catalogItemId: "00000000-0000-4000-8000-000000060003",
              canonicalName: "Карпатська бджола",
              catalogKind: "breed",
              publicSlug: "karpatska-bdzhola-ua-official-breed",
              aliasesProjected: 3,
              sourceRecordId: "must-not-survive",
            },
            {
              catalogItemId: "00000000-0000-4000-8000-000000060013",
              canonicalName: "Ukrainian Grey (Cattle)",
              catalogKind: "breed",
              publicSlug: "ukrainian-grey-cattle-vbo-breed",
              aliasesProjected: 2,
              sourceRecordId: "must-not-survive",
            },
          ],
        },
        idempotencyProof: {
          stableConceptCount: 5,
          stableCatalogIdentities: true,
        },
        carpathianProvenanceProof: {
          sourceName: "Official Ukrainian bee breed legal text",
        },
        vboProvenanceProof: {
          sourceName: "Vertebrate Breed Ontology",
        },
        leakCheck: "passed",
      },
    );

    expect(summary).toMatchObject({
      key: "breed-seed",
      expectedCanonicalName: "Карпатська бджола",
      catalogItemId: "00000000-0000-4000-8000-000000060003",
      canonicalName: "Карпатська бджола",
      catalogKind: "breed",
      source: "ua_official_bee_breed",
      aliasesProjected: 13,
      reindexQueued: true,
      stableProductIdentityOnRerun: true,
      sourceProofRecorded: true,
      leakCheck: "passed",
    });
    expect(JSON.stringify(summary)).not.toContain("sourceRecord");
  });

  it("fails closed when importer output omits or misreports catalog kind", () => {
    expect(() =>
      buildSafeSeedCommandSummary(CATALOG_SEED_ROLLOUT_COMMANDS[1], {
        imported: {
          catalogItemId: "00000000-0000-4000-8000-000000058003",
          canonicalName: "Solanum lycopersicum L.",
          catalogKind: "plant_variety",
          publicSlug: "solanum-lycopersicum-species-backbone",
        },
        idempotencyProof: {
          rerunCatalogItemId: "00000000-0000-4000-8000-000000058003",
        },
        provenanceProof: {},
        leakCheck: "passed",
      }),
    ).toThrow("catalog kind mismatch");

    expect(() =>
      buildSafeSeedCommandSummary(CATALOG_SEED_ROLLOUT_COMMANDS[1], {
        imported: {
          catalogItemId: "00000000-0000-4000-8000-000000058003",
          canonicalName: "Solanum lycopersicum L.",
          publicSlug: "solanum-lycopersicum-species-backbone",
        },
        idempotencyProof: {
          rerunCatalogItemId: "00000000-0000-4000-8000-000000058003",
        },
        provenanceProof: {},
        leakCheck: "passed",
      }),
    ).toThrow("catalog kind mismatch");
  });

  it("fails closed when final evidence contains forbidden internal markers", () => {
    expect(() =>
      assertNoForbiddenCatalogSeedRolloutEvidence({
        leakCheck: "passed",
        sourceRecordId: "00000000-0000-4000-8000-000000057002",
      }),
    ).toThrow("forbidden marker");
  });

  it("builds environment-specific redacted rollout evidence", () => {
    const options = validateCatalogSeedRolloutOptions(
      parseCatalogSeedRolloutArgs([
        "--environment",
        "local",
        "--confirm-environment",
        "local",
        "--base-url",
        "http://localhost:3000",
      ]),
    );
    const evidence = buildCatalogSeedRolloutEvidence({
      options,
      codeState: {
        commitSha: "244a239d2fb5784d0c0064ca0e38b056f6cef14b",
        branch: "main",
        workingTree: "clean",
      },
      seedResults: [
        {
          key: "ua-register-variety",
          packageScript: "catalog:sources:import-ua-register-variety",
          sourceSet: "OVE-81 UA State Register official variety wave",
          expectedCanonicalName: "Ботсадівський",
          catalogItemId: "00000000-0000-4000-8000-000000057001",
          publicSlug: "botsadivskyi-ua-register-83070006",
          canonicalName: "Ботсадівський",
          catalogKind: "plant_variety",
          source: "ua_state_register",
          aliasesProjected: 4,
          reindexQueued: true,
          stableProductIdentityOnRerun: true,
          sourceProofRecorded: true,
          leakCheck: "passed",
        },
      ],
      appSmoke: {
        baseUrl: "http://localhost:3000",
        leakCheck: "passed",
        cases: [
          {
            query: "Ботсадівський",
            suggestionCount: 1,
            selectedResultText: "Ботсадівський",
            canonicalName: "Ботсадівський",
            catalogKind: "plant_variety",
            objectKind: "plant",
            varietyState: "selected",
            duplicateSameConceptSuggestionsAbsent: true,
            readbackIdentityPreserved: true,
            readbackPageStatus: 200,
          },
        ],
      },
      generatedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ove78.catalogSeedRolloutProof.v1",
      issue: "OVE-78",
    });
    expect(evidence.environment).toMatchObject({
      name: "local",
      baseUrl: "http://localhost:3000",
      databaseWriteScope: "explicit_local_environment",
    });
    expect(CATALOG_SEED_ROLLOUT_REQUIRED_QUERIES).toEqual(
      expect.arrayContaining([
        "Kaiser",
        "7 ФОР 7",
        "ЕС ЯСМІНІС КЛП",
        "помідори",
        "домати",
        "огірок звичайний",
        "common sunflower",
        "sweet basil",
        "Bulgarian Carrot",
        "Odessa Market",
      ]),
    );
    expect(JSON.stringify(evidence)).not.toMatch(/rawPayload|sourceRecord/);
  });
});
