import { describe, expect, it } from "vitest";

import {
  readManifest,
  validateManifest,
  type Manifest,
} from "./verify-catalog-sources";

function cloneManifest(): Manifest {
  return structuredClone(readManifest());
}

describe("catalog source readiness manifest", () => {
  it("validates the OVE-79 full-import wave contract", () => {
    const manifest = cloneManifest();

    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.fullImportReadiness.issue).toBe("OVE-79");
    expect(manifest.fullImportReadiness.verificationDate).toBe("2026-07-01");
    expect(manifest.fullImportReadiness.sourceVerdicts).toHaveLength(
      manifest.sources.length,
    );
    expect(
      manifest.fullImportReadiness.importWaves.raw_quarantine_allowed,
    ).toEqual(
      expect.arrayContaining([
        "ua-state-register",
        "catalogue-of-life-checklistbank",
        "iasas-bg-official-variety-list",
        "eu-oj-eur-lex-common-catalogue",
        "eol-vernaculars",
      ]),
    );
    expect(
      manifest.fullImportReadiness.importWaves.product_projection_allowed,
    ).toEqual(
      expect.arrayContaining([
        "ua-state-register",
        "catalogue-of-life-checklistbank",
        "world-flora-online",
        "gbif-backbone",
        "eppo-codes",
        "wikidata",
        "grin-global",
        "vertebrate-breed-ontology",
        "eu-oj-eur-lex-common-catalogue",
      ]),
    );
  });

  it("fails closed on full EPPO corpus work without an official closure manifest", () => {
    const manifest = cloneManifest();
    const contract = manifest.fullImportReadiness.eppoFullCorpusContract;
    const eppo = manifest.fullImportReadiness.sourceVerdicts.find(
      (source) => source.slug === "eppo-codes",
    );

    expect(contract).toMatchObject({
      issue: "OVE-253",
      terminalState: "blocked_manifest",
      rawCorpusAcquisitionAllowed: false,
      productProjectionAllowed: false,
      blocks: ["OVE-254", "OVE-255"],
    });
    expect(eppo).toMatchObject({
      rawQuarantineAllowed: true,
      productProjectionAllowed: true,
      productProjectionMode: "codes_and_safe_aliases",
      importWaves: ["raw_quarantine_allowed", "product_projection_allowed"],
    });
  });

  it("keeps rejected and legally blocked sources out of product projection", () => {
    const manifest = cloneManifest();
    const verdictBySlug = new Map(
      manifest.fullImportReadiness.sourceVerdicts.map((source) => [
        source.slug,
        source,
      ]),
    );

    expect(verdictBySlug.get("vendor-marketplace-paths")).toMatchObject({
      rawQuarantineAllowed: false,
      productProjectionAllowed: false,
      productProjectionMode: "rejected",
      importWaves: ["legal_blocked", "rejected"],
    });
    expect(verdictBySlug.get("genesys-pgr")).toMatchObject({
      rawQuarantineAllowed: false,
      productProjectionAllowed: false,
      productProjectionMode: "internal_validation_only",
      importWaves: ["legal_blocked"],
    });
    expect(verdictBySlug.get("eu-common-catalogue")).toMatchObject({
      rawQuarantineAllowed: true,
      productProjectionAllowed: false,
      productProjectionMode: "blocked_until_export_reuse_gate",
    });
    expect(verdictBySlug.get("eu-oj-eur-lex-common-catalogue")).toMatchObject({
      rawQuarantineAllowed: true,
      productProjectionAllowed: true,
      productProjectionMode: "bulk_official_varieties",
      nextIssueDependency: "OVE-103",
    });
  });

  it("records the OVE-100 EUR-Lex legal-source projection policy", () => {
    const manifest = cloneManifest();
    const source = manifest.sources.find(
      (item) => item.slug === "eu-oj-eur-lex-common-catalogue",
    );
    const legacyPortal = manifest.sources.find(
      (item) => item.slug === "eu-common-catalogue",
    );
    const iasas = manifest.sources.find(
      (item) => item.slug === "iasas-bg-official-variety-list",
    );

    expect(source).toMatchObject({
      verdict: "USE",
      allowedUsage: ["raw_snapshot", "canonical_product_projection"],
      attributionRequired: true,
      legalValueCaveat: expect.stringContaining("no legal value"),
      productProjectionPolicy: {
        requiredSourceUrlPrefixes: [
          "https://eur-lex.europa.eu/eli/",
          "https://data.europa.eu/eli/",
          "http://data.europa.eu/eli/",
        ],
        requiredProductSources: ["eu_oj_eur_lex_common_catalogue"],
        exactBlockerLanguage: expect.stringContaining("IASAS PDFs"),
      },
    });
    expect(source?.parserPrerequisites).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sourceUrl"),
        expect.stringContaining("Reject or quarantine"),
      ]),
    );
    expect(source?.liveChecks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        "eur-lex-legal-notice-authenticity",
        "eur-lex-legal-documents-reuse",
        "dg-sante-common-catalogue-oj-updates",
        "eu-plant-variety-portal-legal-caveat-for-oj-path",
        "eur-lex-common-catalogue-oj-sample",
      ]),
    );
    expect(legacyPortal?.allowedUsage).toEqual(["raw_snapshot"]);
    expect(iasas?.allowedUsage).toEqual(["raw_snapshot"]);
  });

  it("records the OVE-84 BG official variety bulk gate as blocked with exact evidence needs", () => {
    const manifest = cloneManifest();
    const gate = manifest.fullImportReadiness.bgOfficialVarietyBulkGate;

    expect(gate).toMatchObject({
      issue: "OVE-84",
      decision: "blocked",
      fullRawImportAllowed: false,
      productProjectionAllowed: false,
      boundedProofProjectionAllowed: true,
      attributionRequired: true,
    });
    expect(gate.sourceSlugs).toEqual([
      "iasas-bg-official-variety-list",
      "eu-common-catalogue",
    ]);
    expect(gate.allowedProductProjectionFields).toEqual([]);
    expect(gate.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No approved structured"),
        expect.stringContaining("information purposes only"),
      ]),
    );
    expect(gate.nextEvidenceNeeded).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stable official export/API"),
        expect.stringContaining("legal reuse basis"),
      ]),
    );
    expect(gate.parserPolicy).toMatchObject({
      bulkParserApproved: false,
      acceptedRowMinimumConfidence: 0.98,
      reviewRequiredBelowConfidence: 0.98,
      rejectBelowConfidence: 0.9,
    });
    expect(gate.guardContract).toMatchObject({
      boundedGateIssue: "OVE-61",
      blockedBulkGateIssue: "OVE-84",
      requiredBeforeIssue: "OVE-85",
    });
  });

  it("records the OVE-87 PGR/genebank gate without opening broad genebank projection", () => {
    const manifest = cloneManifest();
    const gate = manifest.fullImportReadiness.pgrGenebankBulkGate;
    const grin = manifest.sources.find(
      (source) => source.slug === "grin-global",
    );
    const verdictBySlug = new Map(
      manifest.fullImportReadiness.sourceVerdicts.map((source) => [
        source.slug,
        source,
      ]),
    );

    expect(gate).toMatchObject({
      issue: "OVE-87",
      decision: "partially_allowed",
      rawQuarantineAllowedSourceSlugs: ["grin-global"],
      productCandidateAllowedSourceSlugs: ["grin-global"],
      internalValidationOnlySourceSlugs: ["genesys-pgr", "eurisco"],
      legalBlockedSourceSlugs: ["genesys-pgr", "eurisco"],
      guardContract: {
        requiredBeforeIssue: "OVE-88",
        allowedProductSource: "grin_genebank_candidate",
      },
    });
    expect(gate.guardContract.requiredSourceRecordKeyPrefixes).toEqual([
      "GRIN:NPGS:OVE62:",
      "GRIN:NPGS:OVE88:",
    ]);
    expect(grin?.productProjectionPolicy).toMatchObject({
      requiredProvenanceFields: [
        "sourceVersion",
        "sourceRecordKey",
        "sourceUrl",
        "productSource",
        "productSourceId",
      ],
      requiredSourceUrlPrefixes: ["https://npgsweb.ars-grin.gov/gringlobal/"],
      requiredProductSources: ["grin_genebank_candidate"],
      exactBlockerLanguage: expect.stringContaining("OVE-87-cleared"),
    });
    expect(grin?.liveChecks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        "grin-accession-search",
        "grin-accession-detail-probe",
        "grin-taxonomy-search",
      ]),
    );
    expect(verdictBySlug.get("grin-global")).toMatchObject({
      rawQuarantineAllowed: true,
      productProjectionAllowed: true,
      productProjectionMode: "curator_promotion_only",
      nextIssueDependency: "OVE-88",
    });
    expect(verdictBySlug.get("genesys-pgr")).toMatchObject({
      rawQuarantineAllowed: false,
      productProjectionAllowed: false,
      productProjectionMode: "internal_validation_only",
      nextIssueDependency: "Later PGR legal-permission gate",
    });
    expect(verdictBySlug.get("eurisco")).toMatchObject({
      rawQuarantineAllowed: false,
      productProjectionAllowed: false,
      productProjectionMode: "internal_validation_only",
      nextIssueDependency: "Later PGR legal-permission gate",
    });
  });

  it("fails closed when a source is missing its full-import verdict", () => {
    const manifest = cloneManifest();
    manifest.fullImportReadiness.sourceVerdicts =
      manifest.fullImportReadiness.sourceVerdicts.filter(
        (source) => source.slug !== "gbif-backbone",
      );

    expect(() => validateManifest(manifest)).toThrow(
      "sourceVerdicts must cover every manifest source",
    );
  });

  it("fails closed when a product projection lacks canonical product usage", () => {
    const manifest = cloneManifest();
    const genesys = manifest.fullImportReadiness.sourceVerdicts.find(
      (source) => source.slug === "genesys-pgr",
    );
    if (!genesys) throw new Error("Missing genesys-pgr verdict");

    genesys.productProjectionAllowed = true;
    genesys.productProjectionFields = ["restricted accession name"];
    genesys.importWaves.push("product_projection_allowed");
    manifest.fullImportReadiness.importWaves.product_projection_allowed.push(
      "genesys-pgr",
    );

    expect(() => validateManifest(manifest)).toThrow(
      "canonical_product_projection",
    );
  });

  it("fails closed when the OVE-84 BG bulk gate claims projection before sources are cleared", () => {
    const manifest = cloneManifest();
    const gate = manifest.fullImportReadiness.bgOfficialVarietyBulkGate;
    gate.decision = "allowed";
    gate.fullRawImportAllowed = true;
    gate.productProjectionAllowed = true;
    gate.parserPolicy.bulkParserApproved = true;
    gate.allowedProductProjectionFields = ["official variety denomination"];

    expect(() => validateManifest(manifest)).toThrow(
      "canonical_product_projection",
    );
  });

  it("fails closed when the OVE-87 PGR gate opens Genesys or EURISCO", () => {
    const manifest = cloneManifest();
    const gate = manifest.fullImportReadiness.pgrGenebankBulkGate;
    const genesysGate = gate.gateVerdicts.find(
      (source) => source.slug === "genesys-pgr",
    );
    if (!genesysGate) throw new Error("Missing genesys-pgr gate verdict");

    genesysGate.fullRawImportAllowed = true;
    genesysGate.productProjectionAllowed = true;
    genesysGate.productProjectionMode = "curator_promotion_only";
    genesysGate.allowedCandidateProjectionFields = [
      "restricted candidate name",
    ];
    gate.rawQuarantineAllowedSourceSlugs.push("genesys-pgr");
    gate.productCandidateAllowedSourceSlugs.push("genesys-pgr");

    expect(() => validateManifest(manifest)).toThrow(
      "cannot raw-import blocked genesys-pgr",
    );
  });
});
