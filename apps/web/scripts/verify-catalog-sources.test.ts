import { describe, expect, it } from "vitest";

import { readManifest, validateManifest, type Manifest } from "./verify-catalog-sources";

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
      ]),
    );
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
});
