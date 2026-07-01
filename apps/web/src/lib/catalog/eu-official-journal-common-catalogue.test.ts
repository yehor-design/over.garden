import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
  parseEuCommonCatalogueFormex,
} from "./eu-common-catalogue-parser";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
  euOfficialJournalCommonCatalogueDefinitionFromParserResults,
  euOfficialJournalCommonCataloguePayloadChecksum,
  euOfficialJournalCommonCatalogueSnapshotChecksum,
} from "./eu-official-journal-common-catalogue";

const OJ_SOURCE_URL = "https://eur-lex.europa.eu/eli/C/2026/830/oj";

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildParserResult() {
  const formexXml = `
    <GENERAL>
      <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Allium cepa</HT> L. - Onion</TXT></NP></TI></TITLE>
      <TBL NO.SEQ="0001" COLS="3"><CORPUS>
        <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Cincinnati</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
        <ROW><CELL COL="1">Cincinnati</CELL><CELL COL="2">BG 3 b</CELL><CELL COL="3">(add.)</CELL></ROW>
        <ROW><CELL COL="1">Header Inferred</CELL><CELL COL="2">BG 4 b</CELL><CELL COL="3"><IE/></CELL></ROW>
        <ROW><CELL COL="1">Broken</CELL><CELL COL="2"><IE/></CELL><CELL COL="3">(add.)</CELL></ROW>
      </CORPUS></TBL>
    </GENERAL>
  `;

  return parseEuCommonCatalogueFormex({
    supplementType: "vegetable_supplement_h",
    supplementLabel: "Supplement H 2026/1",
    formexXmlFiles: [
      {
        fileName: "C_202600830EN.000301.fmx.xml",
        text: formexXml,
        byteLength: Buffer.byteLength(formexXml),
        checksumSha256: checksum(formexXml),
      },
    ],
    sourceUrl: OJ_SOURCE_URL,
    ojCitation: "OJ C, C/2026/830, 12.2.2026",
    publicationDate: "2026-02-12",
    artifactChecksumSha256: "b".repeat(64),
  });
}

describe("EU Official Journal Common Catalogue projection model", () => {
  it("builds source-backed product projection only for accepted EUR-Lex rows", () => {
    const definition =
      euOfficialJournalCommonCatalogueDefinitionFromParserResults({
        parserResults: [buildParserResult()],
        fetchedAt: "2026-07-01T00:00:00.000Z",
        verifiedAt: "2026-07-01T00:00:00.000Z",
      });

    expect(definition).toMatchObject({
      sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
      extractionVersion:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
    });
    expect(definition.snapshots).toHaveLength(1);

    const snapshot = definition.snapshots[0];
    expect(snapshot.source).toMatchObject({
      slug: "eu-oj-eur-lex-common-catalogue",
      version: "C/2026/830:vegetable_supplement_h:2026-02-12",
      url: OJ_SOURCE_URL,
      publicationDate: "2026-02-12",
      artifactChecksumSha256: "b".repeat(64),
    });
    expect(snapshot.records.map((record) => record.projectionStatus)).toEqual([
      "projected",
      "quarantined",
      "rejected",
    ]);

    const projected = snapshot.records[0];
    expect(projected.id).toMatch(/^EUR-Lex:ELI:C\/2026\/830:row:[a-f0-9]{16}$/);
    expect(projected.projection).toMatchObject({
      canonicalName: "Cincinnati",
      normalizedName: "cincinnati",
      status: "seeded",
      source: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
      sourceId: projected.id,
      catalogKind: "plant_variety",
      locale: "en",
      aliases: [
        {
          displayName: "Cincinnati",
          normalizedName: "cincinnati",
          locale: "en",
          isPrimary: true,
        },
      ],
      provenance: {
        sourceVersion: "C/2026/830:vegetable_supplement_h:2026-02-12",
        sourceUrl: OJ_SOURCE_URL,
        publicationDate: "2026-02-12",
        extractionVersion:
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
        parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
        normalizedByOverGardenCaveat:
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT,
        legalValueCaveat:
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
      },
    });

    const allowedProjection = JSON.stringify(projected.allowedProjection);
    expect(allowedProjection).toContain("source-backed");
    expect(allowedProjection).toContain("Official Journal");
    expect(allowedProjection).not.toContain("rawPayload");
    expect(allowedProjection).not.toContain("sourceOnlyFields");
    expect(allowedProjection).not.toContain("notifierCode");
    expect(allowedProjection).not.toContain("artifactChecksumSha256");
  });

  it("keeps review-needed and rejected rows source-only with stable checksums", () => {
    const definition =
      euOfficialJournalCommonCatalogueDefinitionFromParserResults({
        parserResults: [buildParserResult()],
        fetchedAt: "2026-07-01T00:00:00.000Z",
        verifiedAt: "2026-07-01T00:00:00.000Z",
      });
    const rerunDefinition =
      euOfficialJournalCommonCatalogueDefinitionFromParserResults({
        parserResults: [buildParserResult()],
        fetchedAt: "2026-07-01T01:00:00.000Z",
        verifiedAt: "2026-07-01T01:00:00.000Z",
      });
    const snapshot = definition.snapshots[0];
    const rerunSnapshot = rerunDefinition.snapshots[0];
    const quarantined = snapshot.records[1];
    const rejected = snapshot.records[2];

    expect(quarantined.projection).toBeNull();
    expect(rejected.projection).toBeNull();
    expect(JSON.stringify(quarantined.rawPayload)).toContain("Header Inferred");
    expect(JSON.stringify(quarantined.sourceOnlyFields)).toContain(
      "admission action inferred from table header",
    );
    expect(JSON.stringify(quarantined.allowedProjection)).toContain(
      "review_needed",
    );
    expect(JSON.stringify(rejected.allowedProjection)).toContain("rejected");
    expect(JSON.stringify(rejected.sourceOnlyFields)).toContain(
      "missing notifier or admission field",
    );

    expect(euOfficialJournalCommonCatalogueSnapshotChecksum(snapshot)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(euOfficialJournalCommonCatalogueSnapshotChecksum(snapshot)).toBe(
      euOfficialJournalCommonCatalogueSnapshotChecksum(rerunSnapshot),
    );
    expect(
      euOfficialJournalCommonCataloguePayloadChecksum(quarantined),
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(euOfficialJournalCommonCataloguePayloadChecksum(rejected)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(
      euOfficialJournalCommonCataloguePayloadChecksum(quarantined),
    ).not.toBe(euOfficialJournalCommonCataloguePayloadChecksum(rejected));
  });
});
