import { describe, expect, it } from "vitest";

import { euOfficialJournalCommonCatalogueFixtureDefinition } from "../../../scripts/verify-stable-registry-pack-adapters";

import { bgOfficialVarietyDefinition } from "@/lib/catalog/bg-official-variety";
import { breedSeedDefinition } from "@/lib/catalog/breed-seed";
import { genebankLongTailDefinition } from "@/lib/catalog/genebank-long-tail";
import { uaStateRegisterFixtureDefinition } from "@/lib/catalog/ua-state-register-variety";

import { adaptBgOfficialVarietyPack } from "./bg-official-variety-import";
import { adaptBreedSeedPack } from "./breed-seed-import";
import { adaptEuOfficialJournalCommonCataloguePack } from "./eu-official-journal-common-catalogue-import";
import { adaptGenebankLongTailPack } from "./genebank-long-tail-import";
import { adaptUaStateRegisterPack } from "./ua-state-register-import";
import {
  PACK_ROW_CLASSIFICATIONS,
  type PackAdapterResult,
  type PackArtifact,
} from "./pack-artifact-contract";

/**
 * Each source family's recorded conversion behavior.
 *
 * These are regression pins, not aspirations: they record what the converted
 * adapter actually produces so a later change to the shared contract cannot
 * silently relax one family's rights or parent handling.
 */

function validated(result: PackAdapterResult): PackArtifact {
  expect(result.status).toBe("validated");
  if (result.status !== "validated") throw new Error("adapter refused");
  return result;
}

function assertTotalClassification(artifact: PackArtifact) {
  const summed = PACK_ROW_CLASSIFICATIONS.reduce(
    (total, key) => total + artifact.counts[key],
    0,
  );
  expect(summed).toBe(artifact.rows.length);
  for (const row of artifact.rows) {
    expect(PACK_ROW_CLASSIFICATIONS).toContain(row.classification);
  }
}

/** No adapter may emit precise location, a raw payload, or a source-only field. */
function assertNoForbiddenEvidence(artifact: PackArtifact) {
  const serialized = JSON.stringify(artifact);
  expect(serialized).not.toMatch(/latitude|longitude|coordinates/iu);
  expect(serialized).not.toMatch(/rawPayload|sourceOnlyFields/u);
  expect(serialized).not.toMatch(/\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,}/u);
}

describe("UA State Register adapter", () => {
  const artifact = validated(
    adaptUaStateRegisterPack({
      definitions: [uaStateRegisterFixtureDefinition()],
      audit: {
        sourceRowsRead: 1,
        rawRowsCaptured: 1,
        productConceptsProjected: 1,
        aliasesProjected: 0,
        reviewNeededRows: 0,
        rejectedRows: 0,
        duplicateCanonicalNameClusters: 0,
      },
    }),
  );

  it("emits a cleared plant-variety pack bound to the declared botanical taxon", () => {
    expect(artifact.sourceSlug).toBe("ua-state-register");
    expect(artifact.sourceRights).toBe("use");
    expect(artifact.packKind).toBe("plant_variety");
    expect(artifact.rows[0]?.parentCandidate).toEqual({
      scientificName: "Prunus armeniaca L.",
      evidenceClass: "declared_by_source",
    });
    expect(artifact.rows[0]?.classification).toBe("clean");
    assertTotalClassification(artifact);
    assertNoForbiddenEvidence(artifact);
  });

  it("replays to the same digest", () => {
    const replay = validated(
      adaptUaStateRegisterPack({
        definitions: [uaStateRegisterFixtureDefinition()],
        audit: {
          sourceRowsRead: 1,
          rawRowsCaptured: 1,
          productConceptsProjected: 1,
          aliasesProjected: 0,
          reviewNeededRows: 0,
          rejectedRows: 0,
          duplicateCanonicalNameClusters: 0,
        },
      }),
    );
    expect(replay.artifactDigest).toBe(artifact.artifactDigest);
  });
});

describe("BG official variety adapter", () => {
  const artifact = validated(
    adaptBgOfficialVarietyPack(bgOfficialVarietyDefinition()),
  );

  it("preserves the conditional-rights branch rather than promoting rows", () => {
    expect(artifact.sourceSlug).toBe("eu-common-catalogue");
    expect(artifact.sourceRights).toBe("use_with_conditions");
    // USE-WITH-CONDITIONS means no row of this family is ever `clean`.
    expect(artifact.counts.clean).toBe(0);
    expect(artifact.rows.length).toBeGreaterThan(0);
    assertTotalClassification(artifact);
    assertNoForbiddenEvidence(artifact);
  });

  it("keeps the quarantined proof row held and aliasless", () => {
    const definition = bgOfficialVarietyDefinition();
    const blocked = artifact.rows.find(
      (row) => row.sourceRecordKey === definition.blockedRecordKey,
    );
    expect(blocked).toBeDefined();
    expect(blocked?.aliases).toEqual([]);
  });
});

describe("EU Official Journal adapter", () => {
  const artifact = validated(
    adaptEuOfficialJournalCommonCataloguePack(
      euOfficialJournalCommonCatalogueFixtureDefinition(),
    ),
  );

  it("emits a cleared EUR-Lex pack that keeps non-projected rows held", () => {
    expect(artifact.sourceSlug).toBe("eu-oj-eur-lex-common-catalogue");
    expect(artifact.sourceRights).toBe("use");
    expect(artifact.rows.length).toBeGreaterThan(0);
    assertTotalClassification(artifact);
    assertNoForbiddenEvidence(artifact);
  });
});

describe("breed adapter", () => {
  const artifact = validated(adaptBreedSeedPack(breedSeedDefinition()));

  it("keeps the breed pack kind and binds each breed to its animal species", () => {
    expect(artifact.packKind).toBe("breed");
    expect(artifact.rows.length).toBeGreaterThan(0);
    for (const row of artifact.rows) {
      expect(row.parentCandidate.scientificName).toBeTruthy();
      expect(row.parentCandidate.evidenceClass).toBe("declared_by_source");
    }
    assertTotalClassification(artifact);
    assertNoForbiddenEvidence(artifact);
  });

  it("never emits a disputed Latin candidate as the official denomination", () => {
    for (const row of artifact.rows) {
      expect(
        row.aliases.every(
          (alias) => alias.displayName !== row.officialDenomination,
        ),
      ).toBe(true);
    }
  });
});

describe("genebank long-tail adapter", () => {
  const artifact = validated(
    adaptGenebankLongTailPack(genebankLongTailDefinition()),
  );

  it("preserves the promotable, held, review-needed, and blocked distinction", () => {
    expect(artifact.sourceSlug).toBe("grin-global");
    expect(artifact.rows.length).toBeGreaterThan(0);
    const definition = genebankLongTailDefinition();
    for (const key of definition.blockedRecordKeys) {
      const row = artifact.rows.find(
        (candidate) => candidate.sourceRecordKey === key,
      );
      expect(row?.classification).toBe("rights_blocked");
    }
    // A candidate accession is never `clean` on arrival; curation owns that.
    for (const key of definition.heldRecordKeys) {
      const row = artifact.rows.find(
        (candidate) => candidate.sourceRecordKey === key,
      );
      expect(row?.classification).not.toBe("clean");
    }
    assertTotalClassification(artifact);
    assertNoForbiddenEvidence(artifact);
  });
});

describe("cross-family artifact shape", () => {
  it("gives all five families one schema version and one digest shape", () => {
    const artifacts = [
      validated(
        adaptUaStateRegisterPack({
          definitions: [uaStateRegisterFixtureDefinition()],
          audit: {
            sourceRowsRead: 1,
            rawRowsCaptured: 1,
            productConceptsProjected: 1,
            aliasesProjected: 0,
            reviewNeededRows: 0,
            rejectedRows: 0,
            duplicateCanonicalNameClusters: 0,
          },
        }),
      ),
      validated(adaptBgOfficialVarietyPack(bgOfficialVarietyDefinition())),
      validated(
        adaptEuOfficialJournalCommonCataloguePack(
          euOfficialJournalCommonCatalogueFixtureDefinition(),
        ),
      ),
      validated(adaptBreedSeedPack(breedSeedDefinition())),
      validated(adaptGenebankLongTailPack(genebankLongTailDefinition())),
    ];

    const digests = new Set(artifacts.map((one) => one.artifactDigest));
    expect(digests.size).toBe(artifacts.length);
    for (const artifact of artifacts) {
      expect(artifact.schemaVersion).toBe("ove327.packArtifact.v1");
      expect(artifact.artifactDigest).toMatch(/^[a-f0-9]{64}$/u);
      // No family needed a private escape field to be expressed.
      for (const row of artifact.rows) {
        expect(Object.keys(row).sort()).toEqual([
          "aliases",
          "classification",
          "locale",
          "normalizedDenomination",
          "officialDenomination",
          "parentCandidate",
          "publicSlug",
          "sourceRecordKey",
        ]);
      }
    }
  });
});
