import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenCatalogFullImportDryRunEvidence,
  buildCatalogFullImportDryRunReport,
  buildCatalogFullImportDryRunReportWithLiveInventory,
  buildDryRunTargetDefinitions,
  parseCatalogFullImportDryRunArgs,
  validateCatalogFullImportDryRunOptions,
  type CatalogFullImportDryRunFetch,
  type CatalogFullImportDryRunTargetDefinition,
} from "./full-import-dry-run";

const LOCAL_OPTIONS = validateCatalogFullImportDryRunOptions({
  environment: "local",
  confirmEnvironment: "local",
  targets: [],
});

function fakeFetch(
  fixtures: Record<
    string,
    { body: string; contentType: string; status?: number }
  >,
): CatalogFullImportDryRunFetch {
  return async (url) => {
    const fixture = fixtures[url];
    if (!fixture) {
      return new Response("missing fixture", { status: 404 });
    }

    return new Response(fixture.body, {
      status: fixture.status ?? 200,
      headers: {
        "content-type": fixture.contentType,
      },
    });
  };
}

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

    expect(
      validateCatalogFullImportDryRunOptions(
        parseCatalogFullImportDryRunArgs([
          "--environment",
          "local",
          "--confirm-environment",
          "local",
          "--target",
          "eu-official-journal-common-catalogue",
        ]),
      ),
    ).toMatchObject({
      environment: "local",
      confirmEnvironment: "local",
      targets: ["eu-official-journal-common-catalogue"],
    });
  });

  it("builds the OVE-101 EUR-Lex/OJ inventory target without product projection", async () => {
    const dgSanteUrl =
      "https://food.ec.europa.eu/plants/plant-reproductive-material/plant-variety-catalogues-databases-information-systems_en";
    const hUrl = "https://eur-lex.europa.eu/eli/C/2026/830/oj";
    const aUrl = "https://eur-lex.europa.eu/eli/C/2026/829/oj";
    const report = await buildCatalogFullImportDryRunReportWithLiveInventory({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["eu-official-journal-common-catalogue"],
      }),
      generatedAt: "2026-07-01T19:00:00.000Z",
      fetchImpl: fakeFetch({
        [dgSanteUrl]: {
          contentType: "text/html; charset=UTF-8",
          body: `
            <a href="https://eur-lex.europa.eu/eli/C/2025/6217/oj">Supplement A 2025/11</a>
            <a href="${hUrl}">Supplement H 2026/1</a>
            <a href="${aUrl}">Supplement A 2026/1</a>
            <a href="https://eur-lex.europa.eu/eli/C/2025/6786/oj">Supplement H 2025/12</a>
          `,
        },
        [hUrl]: {
          contentType: "text/html; charset=UTF-8",
          body: `
            <meta about="http://data.europa.eu/eli/C/2026/830/oj/eng" property="eli:title" content="Common catalogue of varieties of vegetable species Supplement H 2026/1" lang="en"/>
            <a href="https://eur-lex.europa.eu/eli/C/2026/830/oj/eng/pdf">PDF</a>
            <a href="http://data.europa.eu/eli/C/2026/830/oj">ELI</a>
            <p>CELEX:C/2026/00830</p>
            <p>OJ C, C/2026/830, 12.2.2026</p>
            <a href="download-notice.html?legalContentId=cellar:ee6e6ad2-07b3-11f1-825d-01aa75ed71a1">Download notice</a>
          `,
        },
        [aUrl]: {
          contentType: "text/html; charset=UTF-8",
          body: `
            <meta about="http://data.europa.eu/eli/C/2026/829/oj/eng" property="eli:title" content="Common catalogue of varieties of agricultural plant species Supplement A 2026/1" lang="en"/>
            <a href="https://eur-lex.europa.eu/eli/C/2026/829/oj/eng/pdf">PDF</a>
            <a href="http://data.europa.eu/eli/C/2026/829/oj">ELI</a>
            <p>CELEX:C/2026/00829</p>
            <p>OJ C, C/2026/829, 12.2.2026</p>
            <a href="download-notice.html?legalContentId=cellar:3a91b08a-07b4-11f1-825d-01aa75ed71a1">Download notice</a>
          `,
        },
        "https://eur-lex.europa.eu/legal-content/EN/TXT/XML/?uri=CELEX:C/2026/00830":
          {
            contentType: "text/xml; charset=UTF-8",
            body: `<?xml version="1.0" encoding="UTF-8"?><NOTICE><WORK><IDENTIFIER>C/2026/00830</IDENTIFIER></WORK></NOTICE>`,
          },
        "https://eur-lex.europa.eu/legal-content/EN/TXT/XML/?uri=CELEX:C/2026/00829":
          {
            contentType: "text/xml; charset=UTF-8",
            body: `<?xml version="1.0" encoding="UTF-8"?><NOTICE><WORK><IDENTIFIER>C/2026/00829</IDENTIFIER></WORK></NOTICE>`,
          },
      }),
    });

    expect(report.targets).toHaveLength(1);
    expect(report.targets[0]).toMatchObject({
      key: "eu-official-journal-common-catalogue",
      importerIssue: "OVE-101",
      downstreamIssue: "OVE-85",
      projectionScope: "raw_quarantine_only",
      sources: ["eu-oj-eur-lex-common-catalogue"],
      counts: {
        sourceRowsWouldRead: 2,
        rawRowsWouldCapture: 2,
        productConceptsWouldProject: 0,
        aliasesWouldProject: 0,
        reviewNeededRows: 0,
        rejectedRows: 0,
        blockedRows: 0,
        attributionRequiredSources: 1,
      },
      projectionGuard: {
        status: "passed",
        checkedProjectionRequests: 0,
      },
    });
    expect(report.targets[0].sourceInventory).toMatchObject({
      issue: "OVE-101",
      status: "passed",
      discoverySource: {
        fetched: true,
        httpStatus: 200,
        candidateLinksFound: 2,
      },
    });
    expect(report.targets[0].sourceInventory?.candidates).toEqual([
      expect.objectContaining({
        supplementType: "agricultural_supplement_a",
        label: "Supplement A 2026/1",
        publicationDate: "2026-02-12",
        eurLexUrl: aUrl,
        ojUrl: aUrl,
        eliUrl: "http://data.europa.eu/eli/C/2026/829/oj",
        celexUrl:
          "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:C/2026/00829",
        celexId: "C/2026/00829",
        reviewStatus: "ready_for_parser_plan",
      }),
      expect.objectContaining({
        supplementType: "vegetable_supplement_h",
        label: "Supplement H 2026/1",
        publicationDate: "2026-02-12",
        eurLexUrl: hUrl,
        ojUrl: hUrl,
        eliUrl: "http://data.europa.eu/eli/C/2026/830/oj",
        celexUrl:
          "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:C/2026/00830",
        celexId: "C/2026/00830",
        reviewStatus: "ready_for_parser_plan",
      }),
    ]);
    expect(
      report.targets[0].sourceInventory?.candidates.flatMap(
        (candidate) => candidate.artifacts,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "xml_notice",
          role: "preferred_machine_readable",
          fetchStatus: "fetched",
          checksumSha256: expect.any(String),
        }),
        expect.objectContaining({
          format: "pdf",
          role: "authentic_oj_fallback",
          fetchStatus: "available_not_fetched",
          checksumSha256: null,
        }),
      ]),
    );
  });

  it("reports unavailable EUR-Lex XML artifacts as review-needed", async () => {
    const dgSanteUrl =
      "https://food.ec.europa.eu/plants/plant-reproductive-material/plant-variety-catalogues-databases-information-systems_en";
    const hUrl = "https://eur-lex.europa.eu/eli/C/2026/830/oj";
    const report = await buildCatalogFullImportDryRunReportWithLiveInventory({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["eu-official-journal-common-catalogue"],
      }),
      generatedAt: "2026-07-01T19:00:00.000Z",
      fetchImpl: fakeFetch({
        [dgSanteUrl]: {
          contentType: "text/html; charset=UTF-8",
          body: `<a href="${hUrl}">Supplement H 2026/1</a>`,
        },
        [hUrl]: {
          contentType: "text/html; charset=UTF-8",
          body: `
            <meta property="eli:title" content="Common catalogue of varieties of vegetable species Supplement H 2026/1"/>
            <a href="http://data.europa.eu/eli/C/2026/830/oj">ELI</a>
            <p>CELEX:C/2026/00830</p>
            <p>OJ C, C/2026/830, 12.2.2026</p>
          `,
        },
        "https://eur-lex.europa.eu/legal-content/EN/TXT/XML/?uri=CELEX:C/2026/00830":
          {
            contentType: "text/html",
            status: 404,
            body: "not found",
          },
      }),
    });

    expect(report.targets[0].sourceInventory).toMatchObject({
      status: "review_needed",
      reviewNeeded: expect.arrayContaining([
        expect.stringContaining("agricultural_supplement_a"),
        expect.stringContaining("Supplement H 2026/1"),
      ]),
    });
    expect(report.targets[0].sourceInventory?.candidates[0]).toMatchObject({
      reviewStatus: "review_needed",
      artifacts: expect.arrayContaining([
        expect.objectContaining({
          format: "xml_notice",
          fetchStatus: "review_needed",
          httpStatus: 404,
        }),
      ]),
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
