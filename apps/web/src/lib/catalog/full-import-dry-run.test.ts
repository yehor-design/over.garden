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
    { body: string | Buffer; contentType: string; status?: number }
  >,
): CatalogFullImportDryRunFetch {
  return async (url) => {
    const fixture = fixtures[url];
    if (!fixture) {
      return new Response("missing fixture", { status: 404 });
    }

    const body =
      typeof fixture.body === "string"
        ? fixture.body
        : new Uint8Array(fixture.body);

    return new Response(body, {
      status: fixture.status ?? 200,
      headers: {
        "content-type": fixture.contentType,
      },
    });
  };
}

function buildStoredZip(files: Record<string, string>) {
  const buffers = Object.entries(files).map(([fileName, text]) => {
    const fileNameBuffer = Buffer.from(fileName);
    const dataBuffer = Buffer.from(text);
    const header = Buffer.alloc(30);

    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(dataBuffer.length, 18);
    header.writeUInt32LE(dataBuffer.length, 22);
    header.writeUInt16LE(fileNameBuffer.length, 26);
    header.writeUInt16LE(0, 28);

    return Buffer.concat([header, fileNameBuffer, dataBuffer]);
  });

  return Buffer.concat(buffers);
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
    expect(report.totals.productConceptsWouldProject).toBe(15191);
    expect(report.totals.rawRowsWouldCapture).toBe(15217);
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

  it("builds the OVE-103 EUR-Lex/OJ parser QA target with accepted-row projection counts", async () => {
    const dgSanteUrl =
      "https://food.ec.europa.eu/plants/plant-reproductive-material/plant-variety-catalogues-databases-information-systems_en";
    const hUrl = "https://eur-lex.europa.eu/eli/C/2026/830/oj";
    const aUrl = "https://eur-lex.europa.eu/eli/C/2026/829/oj";
    const hFormexZipUrl =
      "http://publications.europa.eu/resource/oj/C_202600830.ENG.fmx4.OJABA_C_202600830_ENG.fmx4.zip";
    const aFormexZipUrl =
      "http://publications.europa.eu/resource/oj/C_202600829.ENG.fmx4.OJABA_C_202600829_ENG.fmx4.zip";
    const aFormexXml = `
      <GENERAL>
        <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Beta vulgaris</HT> L. - Sugar beet</TXT></NP></TI></TITLE>
        <TBL NO.SEQ="0001" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Asase Smart</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Asase Smart</CELL><CELL COL="2">HU 101361</CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
        <TBL NO.SEQ="0002" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Balear</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">mod.</HT></CELL></ROW>
          <ROW><CELL COL="1">Balear</CELL><CELL COL="2">LT 119</CELL><CELL COL="3"><IE/></CELL></ROW>
        </CORPUS></TBL>
        <TBL NO.SEQ="0003" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Broken</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Broken</CELL><CELL COL="2"><IE/></CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
      </GENERAL>
    `;
    const hFormexXml = `
      <GENERAL>
        <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Allium cepa</HT> L. &gt;&gt; Cepa Group - Onion, Echalion</TXT></NP></TI></TITLE>
        <TBL NO.SEQ="0001" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Cincinnati</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Cincinnati</CELL><CELL COL="2">BG 3 b</CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
      </GENERAL>
    `;
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
            body: `<?xml version="1.0" encoding="UTF-8"?><NOTICE><WORK><IDENTIFIER>C/2026/00830</IDENTIFIER></WORK><MANIFESTATION><URI>${hFormexZipUrl}</URI></MANIFESTATION></NOTICE>`,
          },
        "https://eur-lex.europa.eu/legal-content/EN/TXT/XML/?uri=CELEX:C/2026/00829":
          {
            contentType: "text/xml; charset=UTF-8",
            body: `<?xml version="1.0" encoding="UTF-8"?><NOTICE><WORK><IDENTIFIER>C/2026/00829</IDENTIFIER></WORK><MANIFESTATION><URI>${aFormexZipUrl}</URI></MANIFESTATION></NOTICE>`,
          },
        [aFormexZipUrl]: {
          contentType: "application/zip",
          body: buildStoredZip({
            "C_202600829EN.000401.fmx.xml": aFormexXml,
          }),
        },
        [hFormexZipUrl]: {
          contentType: "application/zip",
          body: buildStoredZip({
            "C_202600830EN.000301.fmx.xml": hFormexXml,
          }),
        },
      }),
    });

    expect(report.targets).toHaveLength(1);
    expect(report.targets[0]).toMatchObject({
      key: "eu-official-journal-common-catalogue",
      importerIssue: "OVE-103",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sources: ["eu-oj-eur-lex-common-catalogue"],
      counts: {
        sourceRowsWouldRead: 4,
        rawRowsWouldCapture: 4,
        productConceptsWouldProject: 2,
        aliasesWouldProject: 2,
        reviewNeededRows: 1,
        rejectedRows: 1,
        blockedRows: 2,
        attributionRequiredSources: 1,
      },
      projectionGuard: {
        status: "passed",
        checkedProjectionRequests: 2,
      },
    });
    expect(report.targets[0].sourceInventory).toMatchObject({
      issue: "OVE-102",
      status: "review_needed",
      discoverySource: {
        fetched: true,
        httpStatus: 200,
        candidateLinksFound: 2,
      },
      parserQa: {
        parserVersion: "ove102-eu-oj-formex-parser-v1",
        totals: {
          parsedRows: 4,
          acceptedRows: 2,
          reviewNeededRows: 1,
          rejectedRows: 1,
        },
        byConfidenceBucket: [
          { bucket: "accepted", rows: 2 },
          { bucket: "review_needed", rows: 1 },
          { bucket: "rejected", rows: 1 },
        ],
        sampleRows: expect.arrayContaining([
          expect.objectContaining({
            varietyDenomination: "Asase Smart",
            speciesOrCrop: "Beta vulgaris L. - Sugar beet",
            countryCode: "HU",
            confidenceBucket: "accepted",
          }),
          expect.objectContaining({
            varietyDenomination: "Cincinnati",
            speciesOrCrop: "Allium cepa L. >> Cepa Group - Onion, Echalion",
            countryCode: "BG",
            confidenceBucket: "accepted",
          }),
          expect.objectContaining({
            varietyDenomination: "Broken",
            confidenceBucket: "rejected",
            statusReasons: ["missing notifier or admission field"],
          }),
        ]),
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
        reviewStatus: "parser_qa_reported",
        parserQa: expect.objectContaining({
          totals: {
            parsedRows: 3,
            acceptedRows: 1,
            reviewNeededRows: 1,
            rejectedRows: 1,
          },
        }),
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
        reviewStatus: "parser_qa_reported",
        parserQa: expect.objectContaining({
          totals: {
            parsedRows: 1,
            acceptedRows: 1,
            reviewNeededRows: 0,
            rejectedRows: 0,
          },
        }),
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
          format: "formex_zip",
          role: "preferred_machine_readable",
          fetchStatus: "fetched",
          parseStatus: "parser_qa_parsed",
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

  it("builds the OVE-85 BG official-varieties target from EUR-Lex/OJ parser QA", async () => {
    const dgSanteUrl =
      "https://food.ec.europa.eu/plants/plant-reproductive-material/plant-variety-catalogues-databases-information-systems_en";
    const hUrl = "https://eur-lex.europa.eu/eli/C/2026/830/oj";
    const hFormexZipUrl =
      "http://publications.europa.eu/resource/oj/C_202600830.ENG.fmx4.OJABA_C_202600830_ENG.fmx4.zip";
    const hFormexXml = `
      <GENERAL>
        <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Allium cepa</HT> L. - Onion</TXT></NP></TI></TITLE>
        <TBL NO.SEQ="0001" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Cincinnati</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Cincinnati</CELL><CELL COL="2">BG 3 b</CELL><CELL COL="3">(add.)</CELL></ROW>
          <ROW><CELL COL="1">Header Inferred BG</CELL><CELL COL="2">BG 4 b</CELL><CELL COL="3"><IE/></CELL></ROW>
          <ROW><CELL COL="1"><IE/></CELL><CELL COL="2">BG 7 b</CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
      </GENERAL>
    `;
    const report = await buildCatalogFullImportDryRunReportWithLiveInventory({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["bg-official-varieties"],
      }),
      generatedAt: "2026-07-01T20:00:00.000Z",
      fetchImpl: fakeFetch({
        [dgSanteUrl]: {
          contentType: "text/html; charset=UTF-8",
          body: `<a href="${hUrl}">Supplement H 2026/1</a>`,
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
        "https://eur-lex.europa.eu/legal-content/EN/TXT/XML/?uri=CELEX:C/2026/00830":
          {
            contentType: "text/xml; charset=UTF-8",
            body: `<?xml version="1.0" encoding="UTF-8"?><NOTICE><WORK><IDENTIFIER>C/2026/00830</IDENTIFIER></WORK><MANIFESTATION><URI>${hFormexZipUrl}</URI></MANIFESTATION></NOTICE>`,
          },
        [hFormexZipUrl]: {
          contentType: "application/zip",
          body: buildStoredZip({
            "C_202600830EN.000301.fmx.xml": hFormexXml,
          }),
        },
      }),
    });

    expect(report.downstreamUsage.requiredBeforeIssues).toContain("OVE-85");
    expect(report.targets).toHaveLength(1);
    expect(report.targets[0]).toMatchObject({
      key: "bg-official-varieties",
      packageScript: "catalog:sources:import-eu-oj-common-catalogue",
      sourceSet:
        "OVE-85 BG official varieties via EUR-Lex Official Journal rows",
      importerIssue: "OVE-85",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sources: ["eu-oj-eur-lex-common-catalogue"],
      counts: {
        sourceRowsWouldRead: 3,
        rawRowsWouldCapture: 3,
        productConceptsWouldProject: 1,
        aliasesWouldProject: 1,
        reviewNeededRows: 1,
        rejectedRows: 1,
        blockedRows: 2,
        attributionRequiredSources: 1,
      },
      projectionGuard: {
        status: "passed",
        checkedProjectionRequests: 2,
      },
    });
    expect(report.targets[0].sourceInventory?.parserQa?.byCountry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          countryCode: "BG",
          rows: 3,
          acceptedRows: 1,
          reviewNeededRows: 1,
          rejectedRows: 1,
        }),
      ]),
    );
    expect(report.duplicateRisk.clusters).toEqual([
      expect.objectContaining({
        signal: "eu-oj-bg-official-variety-denominations",
        requiredGate: "OVE-89",
      }),
    ]);
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

  it("reports the OVE-86 approved breed expansion with VBO readiness and blocked aliases", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["breed-seed"],
      }),
      generatedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(report.targets[0]).toMatchObject({
      key: "breed-seed",
      packageScript: "catalog:sources:import-breed-seed",
      sourceSet: "OVE-86 approved bee and VBO breed expansion",
      importerIssue: "OVE-86",
      downstreamIssue: "OVE-86",
      projectionScope: "full_import_wave",
      sources: ["ua-official-bee-breeds", "vertebrate-breed-ontology"],
      readinessVerdicts: [
        expect.objectContaining({
          slug: "vertebrate-breed-ontology",
          productProjectionAllowed: true,
          productProjectionMode: "breed_backbone_limited",
        }),
      ],
      counts: {
        sourceRowsWouldRead: 5,
        rawRowsWouldCapture: 5,
        productConceptsWouldProject: 5,
        aliasesWouldProject: 13,
        reviewNeededRows: 8,
        rejectedRows: 0,
        blockedRows: 8,
        attributionRequiredSources: 2,
      },
      projectionGuard: {
        status: "passed",
        checkedProjectionRequests: 10,
      },
    });
  });

  it("reports the OVE-88 GRIN genebank bulk quarantine target", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["genebank-long-tail"],
      }),
      generatedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(report.targets[0]).toMatchObject({
      key: "genebank-long-tail",
      packageScript: "catalog:sources:import-genebank-long-tail",
      sourceSet: "OVE-88 GRIN/NPGS genebank bulk candidate quarantine",
      importerIssue: "OVE-88",
      downstreamIssue: "OVE-88",
      projectionScope: "full_import_wave",
      sources: ["grin-global"],
      counts: {
        sourceRowsWouldRead: 12,
        rawRowsWouldCapture: 12,
        productConceptsWouldProject: 3,
        aliasesWouldProject: 9,
        reviewNeededRows: 3,
        rejectedRows: 2,
        blockedRows: 5,
        attributionRequiredSources: 0,
      },
      projectionGuard: {
        status: "passed",
        checkedProjectionRequests: 6,
      },
    });
  });

  it("reports the OVE-87 PGR/genebank bulk gate without mutating source rows", () => {
    const report = buildCatalogFullImportDryRunReport({
      options: validateCatalogFullImportDryRunOptions({
        environment: "local",
        confirmEnvironment: "local",
        targets: ["pgr-genebank-bulk-gate"],
      }),
      generatedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(report.downstreamUsage.requiredBeforeIssues).toContain("OVE-87");
    expect(report.targets[0]).toMatchObject({
      key: "pgr-genebank-bulk-gate",
      packageScript: "catalog:sources:verify",
      sourceSet: "OVE-87 PGR source-use gate",
      importerIssue: "OVE-87",
      downstreamIssue: "OVE-88",
      projectionScope: "raw_quarantine_only",
      sources: ["grin-global", "genesys-pgr", "eurisco"],
      readinessVerdicts: [
        expect.objectContaining({
          slug: "grin-global",
          rawQuarantineAllowed: true,
          productProjectionAllowed: true,
          productProjectionMode: "curator_promotion_only",
        }),
        expect.objectContaining({
          slug: "genesys-pgr",
          rawQuarantineAllowed: false,
          productProjectionAllowed: false,
          productProjectionMode: "internal_validation_only",
        }),
        expect.objectContaining({
          slug: "eurisco",
          rawQuarantineAllowed: false,
          productProjectionAllowed: false,
          productProjectionMode: "internal_validation_only",
        }),
      ],
      counts: {
        sourceRowsWouldRead: 3,
        rawRowsWouldCapture: 0,
        productConceptsWouldProject: 0,
        aliasesWouldProject: 0,
        reviewNeededRows: 1,
        rejectedRows: 0,
        blockedRows: 2,
        attributionRequiredSources: 2,
      },
      projectionGuard: {
        status: "passed",
        checkedProjectionRequests: 0,
      },
    });
    expect(report.totals).toMatchObject({
      targets: 1,
      readinessSources: 3,
      rawRowsWouldCapture: 0,
      productConceptsWouldProject: 0,
    });
    expect(report.leakCheck).toBe("passed");
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
