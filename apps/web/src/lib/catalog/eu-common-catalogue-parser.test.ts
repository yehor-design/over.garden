import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
  extractFormexXmlFilesFromZip,
  parseEuCommonCatalogueFormex,
} from "./eu-common-catalogue-parser";

const OJ_A_SOURCE_URL = "https://eur-lex.europa.eu/eli/C/2026/829/oj";
const OJ_H_SOURCE_URL = "https://eur-lex.europa.eu/eli/C/2026/830/oj";

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildStoredZipWithDataDescriptor(fileName: string, text: string) {
  const fileNameBuffer = Buffer.from(fileName);
  const dataBuffer = Buffer.from(text);
  const localHeader = Buffer.alloc(30);

  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x08, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(fileNameBuffer.length, 26);

  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(dataBuffer.length, 8);
  descriptor.writeUInt32LE(dataBuffer.length, 12);

  const centralDirectoryOffset =
    localHeader.length +
    fileNameBuffer.length +
    dataBuffer.length +
    descriptor.length;
  const centralDirectory = Buffer.alloc(46);
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt16LE(0x08, 8);
  centralDirectory.writeUInt16LE(0, 10);
  centralDirectory.writeUInt32LE(dataBuffer.length, 20);
  centralDirectory.writeUInt32LE(dataBuffer.length, 24);
  centralDirectory.writeUInt16LE(fileNameBuffer.length, 28);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(
    centralDirectory.length + fileNameBuffer.length,
    12,
  );
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([
    localHeader,
    fileNameBuffer,
    dataBuffer,
    descriptor,
    centralDirectory,
    fileNameBuffer,
    endOfCentralDirectory,
  ]);
}

describe("OVE-102 EU Common Catalogue Formex parser", () => {
  it("extracts Publications Office Formex ZIP entries with data descriptors", () => {
    const formexXml = "<GENERAL><TITLE><TXT>Smoke</TXT></TITLE></GENERAL>";
    const zip = buildStoredZipWithDataDescriptor(
      "C_202600830EN.000301.fmx.xml",
      formexXml,
    );

    expect(extractFormexXmlFilesFromZip(zip)).toEqual([
      {
        fileName: "C_202600830EN.000301.fmx.xml",
        text: formexXml,
        byteLength: Buffer.byteLength(formexXml),
        checksumSha256: checksum(formexXml),
      },
    ]);
  });

  it("parses agricultural Supplement A rows with accepted, review-needed, and rejected buckets", () => {
    const formexXml = `
      <GENERAL>
        <TITLE><TI><NP><NO.P>I.</NO.P><TXT><HT TYPE="BOLD">Beet</HT></TXT></NP></TI></TITLE>
        <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Beta vulgaris</HT> L. - Sugar beet</TXT></NP></TI></TITLE>
        <TBL NO.SEQ="0001" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Asase Smart</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Asase Smart</CELL><CELL COL="2">HU 101361</CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
        <TBL NO.SEQ="0002" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Balear</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">mod.</HT></CELL></ROW>
          <ROW><CELL COL="1">Balear</CELL><CELL COL="2">BE 221</CELL><CELL COL="3">(del.)</CELL></ROW>
          <ROW><CELL COL="1">Balear</CELL><CELL COL="2">LT 119</CELL><CELL COL="3"><IE/></CELL></ROW>
        </CORPUS></TBL>
        <TBL NO.SEQ="0003" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Eurostar</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">del.</HT></CELL></ROW>
          <ROW><CELL COL="1">Eurostar</CELL><CELL COL="2">RO 2132</CELL><CELL COL="3"><P>(del.)</P><P>Market extension date=<DATE ISO="20270630">30/06/2027</DATE></P></CELL></ROW>
        </CORPUS></TBL>
        <TBL NO.SEQ="0004" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Broken</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Broken</CELL><CELL COL="2"><IE/></CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
      </GENERAL>
    `;
    const result = parseEuCommonCatalogueFormex({
      supplementType: "agricultural_supplement_a",
      supplementLabel: "Supplement A 2026/1",
      formexXmlFiles: [
        {
          fileName: "C_202600829EN.000401.fmx.xml",
          text: formexXml,
          byteLength: Buffer.byteLength(formexXml),
          checksumSha256: checksum(formexXml),
        },
      ],
      sourceUrl: OJ_A_SOURCE_URL,
      ojCitation: "OJ C, C/2026/829, 12.2.2026",
      publicationDate: "2026-02-12",
      artifactChecksumSha256: "a".repeat(64),
    });

    expect(result.parserVersion).toBe(
      EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
    );
    expect(result.totals).toEqual({
      parsedRows: 5,
      acceptedRows: 3,
      reviewNeededRows: 1,
      rejectedRows: 1,
    });
    expect(result.bySupplement).toEqual([
      {
        supplementLabel: "Supplement A 2026/1",
        rows: 5,
        acceptedRows: 3,
        reviewNeededRows: 1,
        rejectedRows: 1,
      },
    ]);
    expect(result.bySpeciesOrCrop[0]).toMatchObject({
      speciesOrCrop: "Beta vulgaris L. - Sugar beet",
      rows: 5,
    });
    expect(result.byCountry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ countryCode: "HU", rows: 1 }),
        expect.objectContaining({ countryCode: "LT", reviewNeededRows: 1 }),
      ]),
    );
    expect(result.byNotifier).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notifierCode: "HU 101361",
          countryCode: "HU",
        }),
        expect.objectContaining({ notifierCode: "LT 119", countryCode: "LT" }),
      ]),
    );
    expect(result.byConfidenceBucket).toEqual([
      { bucket: "accepted", rows: 3 },
      { bucket: "review_needed", rows: 1 },
      { bucket: "rejected", rows: 1 },
    ]);

    const acceptedRow = result.rows.find(
      (row) => row.varietyDenomination === "Asase Smart",
    );
    expect(acceptedRow).toMatchObject({
      supplementType: "agricultural_supplement_a",
      varietyDenomination: "Asase Smart",
      speciesOrCrop: "Beta vulgaris L. - Sugar beet",
      countryCode: "HU",
      notifierCode: "HU 101361",
      admissionAction: "add",
      marketExtensionDate: null,
      registerType: "agricultural_common_catalogue",
      ojCitation: "OJ C, C/2026/829, 12.2.2026",
      sourceUrl: OJ_A_SOURCE_URL,
      publicationDate: "2026-02-12",
      artifactChecksumSha256: "a".repeat(64),
      parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
      extractionConfidence: 0.99,
      confidenceBucket: "accepted",
      statusReasons: [],
    });

    expect(
      result.rows.find(
        (row) =>
          row.varietyDenomination === "Balear" && row.notifierCode === "LT 119",
      ),
    ).toMatchObject({
      admissionAction: "modify",
      extractionConfidence: 0.94,
      confidenceBucket: "review_needed",
      statusReasons: ["admission action inferred from table header"],
    });
    expect(
      result.rows.find((row) => row.varietyDenomination === "Eurostar"),
    ).toMatchObject({
      marketExtensionDate: "2027-06-30",
    });
    expect(
      result.rows.find((row) => row.varietyDenomination === "Broken"),
    ).toMatchObject({
      confidenceBucket: "rejected",
      statusReasons: ["missing notifier or admission field"],
    });
  });

  it("parses vegetable Supplement H rows with notifier country and register type", () => {
    const formexXml = `
      <GENERAL>
        <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Allium cepa</HT> L. &gt;&gt; Cepa Group - Onion, Echalion</TXT></NP></TI></TITLE>
        <TBL NO.SEQ="0003" COLS="3"><CORPUS>
          <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Cincinnati</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
          <ROW><CELL COL="1">Cincinnati</CELL><CELL COL="2">BG 3 b</CELL><CELL COL="3">(add.)</CELL></ROW>
        </CORPUS></TBL>
      </GENERAL>
    `;
    const result = parseEuCommonCatalogueFormex({
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
      sourceUrl: OJ_H_SOURCE_URL,
      ojCitation: "OJ C, C/2026/830, 12.2.2026",
      publicationDate: "2026-02-12",
      artifactChecksumSha256: "b".repeat(64),
    });

    expect(result.totals).toEqual({
      parsedRows: 1,
      acceptedRows: 1,
      reviewNeededRows: 0,
      rejectedRows: 0,
    });
    expect(result.rows[0]).toMatchObject({
      supplementType: "vegetable_supplement_h",
      supplementLabel: "Supplement H 2026/1",
      varietyDenomination: "Cincinnati",
      speciesOrCrop: "Allium cepa L. >> Cepa Group - Onion, Echalion",
      countryCode: "BG",
      notifierCode: "BG 3 b",
      admissionAction: "add",
      registerType: "vegetable_common_catalogue",
      sourceUrl: OJ_H_SOURCE_URL,
      artifactChecksumSha256: "b".repeat(64),
      confidenceBucket: "accepted",
    });
  });

  it("rejects IASAS-only source URLs before rows can be upgraded", () => {
    expect(() =>
      parseEuCommonCatalogueFormex({
        supplementType: "vegetable_supplement_h",
        supplementLabel: "Supplement H 2026/1",
        formexXmlFiles: [
          {
            fileName: "iasas.xml",
            text: "<GENERAL />",
            byteLength: 11,
            checksumSha256: "c".repeat(64),
          },
        ],
        sourceUrl: "https://iasas.government.bg/cms/2026",
        ojCitation: null,
        publicationDate: null,
        artifactChecksumSha256: "d".repeat(64),
      }),
    ).toThrow(/official EUR-Lex or data\.europa\.eu ELI source URLs/);
  });
});
