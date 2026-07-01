import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenCatalogFullImportDryRunEvidence,
  buildCatalogFullImportDryRunReport,
  buildDryRunTargetDefinitions,
  parseCatalogFullImportDryRunArgs,
  validateCatalogFullImportDryRunOptions,
  type CatalogFullImportDryRunTargetDefinition,
} from "./full-import-dry-run";

const LOCAL_OPTIONS = validateCatalogFullImportDryRunOptions({
  environment: "local",
  confirmEnvironment: "local",
  targets: [],
});

describe("OVE-80 catalog full-import dry-run", () => {
  it("builds one normalized redacted report for the existing proof importers", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: LOCAL_OPTIONS,
      generatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(report.schemaVersion).toBe("ove80.catalogFullImportDryRun.v1");
    expect(report.issue).toBe("OVE-80");
    expect(report.environment).toMatchObject({
      name: "local",
      preflightOnly: true,
      mutation: "blocked_by_design",
      evidenceSafety: "linear_safe_redacted",
    });
    expect(report.readinessGate.issue).toBe("OVE-79");
    expect(report.targets.map((target) => target.key)).toEqual([
      "catalog-source-sample",
      "ua-register-variety",
      "species-backbone",
      "breed-seed",
      "bg-official-variety",
      "genebank-long-tail",
    ]);
    expect(report.totals.targets).toBe(6);
    expect(report.totals.productConceptsWouldProject).toBe(15185);
    expect(report.totals.rawRowsWouldCapture).toBe(15203);
    expect(report.totals.blockedRows).toBeGreaterThan(0);
    expect(
      report.targets.every(
        (target) =>
          target.projectionGuard.status === "passed" &&
          target.leakCheck.status === "passed",
      ),
    ).toBe(true);
    expect(report.leakCheck).toBe("passed");
  });

  it("blocks accidental non-local mutation by requiring explicit preflight-only mode", () => {
    expect(() =>
      validateCatalogFullImportDryRunOptions({
        environment: "production",
        confirmEnvironment: "production",
        preflightOnly: false,
        targets: ["ua-register-variety"],
      }),
    ).toThrow(/Non-local dry-run requires --preflight-only/);

    expect(() =>
      validateCatalogFullImportDryRunOptions({
        environment: "preview",
        confirmEnvironment: "production",
        preflightOnly: true,
        targets: ["ua-register-variety"],
      }),
    ).toThrow(/must exactly match/);

    expect(
      validateCatalogFullImportDryRunOptions(
        parseCatalogFullImportDryRunArgs([
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--preflight-only",
          "--target",
          "vernacular-alias-expansion",
        ]),
      ),
    ).toMatchObject({
      environment: "production",
      confirmEnvironment: "production",
      preflightOnly: true,
      targets: ["vernacular-alias-expansion"],
    });
  });

  it("fails closed if forbidden evidence markers appear in a report", () => {
    expect(() =>
      assertNoForbiddenCatalogFullImportDryRunEvidence({
        rawPayload: {
          occurrenceCoordinates: {
            decimalLatitude: 50.45,
            decimalLongitude: 30.52,
          },
        },
      }),
    ).toThrow(/forbidden marker/);

    expect(() =>
      assertNoForbiddenCatalogFullImportDryRunEvidence({
        sourceRecordKey: "RegisterVarietis:83070006",
      }),
    ).toThrow(/sourceRecordKey/);
  });

  it("reports duplicate-risk clusters before production proof", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: LOCAL_OPTIONS,
      generatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(report.duplicateRisk.clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal: "solanum-lycopersicum-boundary",
          riskLevel: "review_needed",
          requiredGate: "OVE-89",
          members: expect.arrayContaining([
            expect.objectContaining({
              target: "species-backbone",
              conceptRole: "species backbone",
            }),
            expect.objectContaining({
              target: "genebank-long-tail",
              conceptRole: "variety candidate under tomato species",
            }),
          ]),
        }),
      ]),
    );
  });

  it("reports the OVE-82 planned species backbone as a multi-concept target", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["species-backbone"],
      }),
      generatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(report.targets[0]).toMatchObject({
      key: "species-backbone",
      downstreamIssue: "OVE-82",
      projectionScope: "full_import_wave",
      sources: [
        "catalogue-of-life-checklistbank",
        "world-flora-online",
        "gbif-backbone",
        "eppo-codes",
        "wikidata",
      ],
      counts: expect.objectContaining({
        sourceRowsWouldRead: 20,
        rawRowsWouldCapture: 20,
        productConceptsWouldProject: 4,
      }),
    });
  });

  it("reports the OVE-83 vernacular alias expansion as an explicit dry-run target", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["vernacular-alias-expansion"],
      }),
      generatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(report.targets[0]).toMatchObject({
      key: "vernacular-alias-expansion",
      packageScript: "catalog:sources:import-species-backbone",
      sourceSet: "OVE-83 reviewed vernacular alias expansion",
      importerIssue: "OVE-83",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      counts: {
        sourceRowsWouldRead: 31,
        rawRowsWouldCapture: 0,
        productConceptsWouldProject: 0,
        aliasesWouldProject: 21,
        reviewNeededRows: 2,
        rejectedRows: 4,
        blockedRows: 10,
        attributionRequiredSources: 4,
      },
    });
    expect(report.targets[0].sources).toEqual(
      expect.arrayContaining([
        "wikidata",
        "eppo-codes",
        "overgarden-curation",
        "overgarden-generated",
      ]),
    );
    expect(report.targets[0].sources).toHaveLength(4);
    expect(report.targets[0].readinessVerdicts.map((row) => row.slug)).toEqual([
      "eppo-codes",
      "wikidata",
    ]);
    expect(report.targets[0].projectionGuard).toEqual({
      status: "passed",
      checkedProjectionRequests: 2,
    });
    expect(report.duplicateRisk.clusters).toEqual([
      expect.objectContaining({
        signal: "reviewed-vernacular-alias-collisions",
        requiredGate: "OVE-89",
      }),
    ]);
  });

  it("reports the OVE-81 UA register target as a full approved import wave", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["ua-register-variety"],
      }),
      generatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(report.targets[0]).toMatchObject({
      key: "ua-register-variety",
      sourceSet: "OVE-81 UA State Register official variety wave",
      importerIssue: "OVE-81",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sources: ["ua-state-register"],
      counts: expect.objectContaining({
        sourceRowsWouldRead: 15177,
        rawRowsWouldCapture: 15177,
        productConceptsWouldProject: 15177,
        aliasesWouldProject: 61105,
        reviewNeededRows: 0,
        rejectedRows: 0,
      }),
    });
    expect(report.duplicateRisk.clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal: "ua-register-duplicate-denominations",
          riskLevel: "review_needed",
          requiredGate: "OVE-89",
        }),
      ]),
    );
  });

  it("enforces OVE-79 source verdicts before full projection", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["bg-official-variety"],
      }),
      generatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(report.targets[0]).toMatchObject({
      key: "bg-official-variety",
      projectionScope: "bounded_existing_proof",
      readinessVerdicts: [
        expect.objectContaining({
          slug: "eu-common-catalogue",
          productProjectionAllowed: false,
        }),
      ],
    });

    const unsafeFullProjection = {
      ...buildDryRunTargetDefinitions().find(
        (definition) => definition.key === "bg-official-variety",
      ),
      projectionScope: "full_import_wave",
    } as CatalogFullImportDryRunTargetDefinition;

    expect(() =>
      buildCatalogFullImportDryRunReport({
        options: validateCatalogFullImportDryRunOptions({
          environment: "local",
          confirmEnvironment: "local",
          targets: ["bg-official-variety"],
        }),
        generatedAt: "2026-07-01T13:00:00.000Z",
        targetDefinitions: [unsafeFullProjection],
      }),
    ).toThrow(/cannot project eu-common-catalogue/);

    const rejectedVendorTarget: CatalogFullImportDryRunTargetDefinition = {
      key: "catalog-source-sample",
      packageScript: "catalog:sources:dry-run",
      sourceSet: "Rejected vendor marketplace path",
      importerIssue: "OVE-80",
      downstreamIssue: "blocked",
      projectionScope: "full_import_wave",
      sourceSlugs: ["vendor-marketplace-paths"],
      readinessSourceSlugs: ["vendor-marketplace-paths"],
      rowCounts: {
        sourceRowsWouldRead: 1,
        rawRowsWouldCapture: 1,
        productConceptsWouldProject: 1,
        aliasesWouldProject: 0,
        reviewNeededRows: 0,
        rejectedRows: 1,
        blockedRows: 1,
        attributionRequiredSources: 0,
      },
      parserVersions: ["test"],
      projectionRequests: [],
      duplicateSignals: [],
    };

    expect(() =>
      buildCatalogFullImportDryRunReport({
        options: validateCatalogFullImportDryRunOptions({
          environment: "local",
          confirmEnvironment: "local",
          targets: ["catalog-source-sample"],
        }),
        generatedAt: "2026-07-01T13:00:00.000Z",
        targetDefinitions: [rejectedVendorTarget],
      }),
    ).toThrow(/does not allow raw quarantine/);
  });
});
