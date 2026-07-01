import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION =
  "ove102-eu-oj-formex-parser-v1";

export const EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS = {
  acceptedMinConfidence: 0.98,
  reviewNeededMinConfidence: 0.9,
  rejectBelowConfidence: 0.9,
} as const;

export type EuCommonCatalogueSupplementType =
  | "agricultural_supplement_a"
  | "vegetable_supplement_h";

export type EuCommonCatalogueConfidenceBucket =
  | "accepted"
  | "review_needed"
  | "rejected";

export type EuCommonCatalogueAdmissionAction = "add" | "delete" | "modify";

export type EuCommonCatalogueRegisterType =
  | "agricultural_common_catalogue"
  | "vegetable_common_catalogue";

export interface EuCommonCatalogueFormexXmlFile {
  fileName: string;
  text: string;
  byteLength: number;
  checksumSha256: string;
}

export interface EuCommonCatalogueParserInput {
  supplementType: EuCommonCatalogueSupplementType;
  supplementLabel: string;
  formexXmlFiles: EuCommonCatalogueFormexXmlFile[];
  sourceUrl: string;
  ojCitation: string | null;
  publicationDate: string | null;
  artifactChecksumSha256: string;
}

export interface EuCommonCatalogueParsedRow {
  supplementType: EuCommonCatalogueSupplementType;
  supplementLabel: string;
  varietyDenomination: string | null;
  speciesOrCrop: string | null;
  countryCode: string | null;
  notifierCode: string | null;
  admissionAction: EuCommonCatalogueAdmissionAction | null;
  marketExtensionDate: string | null;
  registerType: EuCommonCatalogueRegisterType;
  ojCitation: string | null;
  sourceUrl: string;
  publicationDate: string | null;
  artifactChecksumSha256: string;
  parserVersion: string;
  extractionConfidence: number;
  confidenceBucket: EuCommonCatalogueConfidenceBucket;
  statusReasons: string[];
}

export interface EuCommonCatalogueParserResult {
  parserVersion: string;
  thresholds: typeof EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS;
  rows: EuCommonCatalogueParsedRow[];
  totals: {
    parsedRows: number;
    acceptedRows: number;
    reviewNeededRows: number;
    rejectedRows: number;
  };
  bySupplement: EuCommonCatalogueParserSummaryRow<"supplementLabel">[];
  bySpeciesOrCrop: EuCommonCatalogueParserSummaryRow<"speciesOrCrop">[];
  byCountry: EuCommonCatalogueParserSummaryRow<"countryCode">[];
  byNotifier: Array<
    EuCommonCatalogueParserSummaryRow<"notifierCode"> & {
      countryCode: string | null;
    }
  >;
  byConfidenceBucket: Array<{
    bucket: EuCommonCatalogueConfidenceBucket;
    rows: number;
  }>;
  reviewNeeded: string[];
  rejected: string[];
}

export type EuCommonCatalogueParserSummaryRow<
  TField extends
    | "supplementLabel"
    | "speciesOrCrop"
    | "countryCode"
    | "notifierCode",
> = {
  [key in TField]: string;
} & {
  rows: number;
  acceptedRows: number;
  reviewNeededRows: number;
  rejectedRows: number;
};

export function parseEuCommonCatalogueFormex(
  input: EuCommonCatalogueParserInput,
): EuCommonCatalogueParserResult {
  assertOfficialEuCommonCatalogueSourceUrl(input.sourceUrl);

  const rows = input.formexXmlFiles.flatMap((file) =>
    parseFormexXmlFile(input, file),
  );

  return {
    parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
    thresholds: EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS,
    rows,
    totals: buildTotals(rows),
    bySupplement: summarizeRows(rows, "supplementLabel"),
    bySpeciesOrCrop: summarizeRows(rows, "speciesOrCrop"),
    byCountry: summarizeRows(rows, "countryCode"),
    byNotifier: summarizeNotifierRows(rows),
    byConfidenceBucket: summarizeConfidenceBuckets(rows),
    reviewNeeded: summarizeStatusRows(rows, "review_needed"),
    rejected: summarizeStatusRows(rows, "rejected"),
  };
}

export function extractFormexXmlFilesFromZip(
  zipBuffer: Buffer,
): EuCommonCatalogueFormexXmlFile[] {
  const centralDirectoryEntries = readCentralDirectoryEntries(zipBuffer);
  if (centralDirectoryEntries) {
    return centralDirectoryEntries.flatMap((entry) =>
      entry.fileName.endsWith(".fmx.xml")
        ? [readZipEntry(zipBuffer, entry)]
        : [],
    );
  }

  const files: EuCommonCatalogueFormexXmlFile[] = [];
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const flags = zipBuffer.readUInt16LE(offset + 6);
    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (flags & 0x08) {
      throw new Error(
        "Unsupported Formex ZIP: local file header uses a data descriptor.",
      );
    }
    if (dataEnd > zipBuffer.length) {
      throw new Error("Unsupported Formex ZIP: local file data is truncated.");
    }

    const fileName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString();
    const compressedData = zipBuffer.subarray(dataStart, dataEnd);
    const fileBuffer =
      compressionMethod === 0
        ? compressedData
        : compressionMethod === 8
          ? inflateRawSync(compressedData)
          : null;

    if (!fileBuffer) {
      throw new Error(
        `Unsupported Formex ZIP compression method ${compressionMethod}.`,
      );
    }

    if (fileName.endsWith(".fmx.xml")) {
      files.push({
        fileName,
        text: fileBuffer.toString("utf8"),
        byteLength: fileBuffer.length,
        checksumSha256: createHash("sha256").update(fileBuffer).digest("hex"),
      });
    }

    offset = dataEnd;
  }

  return files;
}

interface FormexZipCentralDirectoryEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readCentralDirectoryEntries(
  zipBuffer: Buffer,
): FormexZipCentralDirectoryEntry[] | null {
  const eocdOffset = findEndOfCentralDirectoryOffset(zipBuffer);
  if (eocdOffset === null) return null;

  const entries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const centralDirectorySize = zipBuffer.readUInt32LE(eocdOffset + 12);
  if (centralDirectoryOffset + centralDirectorySize > zipBuffer.length) {
    throw new Error("Unsupported Formex ZIP: central directory is truncated.");
  }

  const directoryEntries: FormexZipCentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > zipBuffer.length) {
      throw new Error(
        "Unsupported Formex ZIP: central directory entry is truncated.",
      );
    }
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      throw new Error(
        "Unsupported Formex ZIP: invalid central directory entry.",
      );
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 30);
    const fileCommentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    if (fileNameEnd > zipBuffer.length) {
      throw new Error(
        "Unsupported Formex ZIP: central directory filename is truncated.",
      );
    }

    directoryEntries.push({
      fileName: zipBuffer.subarray(fileNameStart, fileNameEnd).toString(),
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    offset = fileNameEnd + extraFieldLength + fileCommentLength;
  }

  return directoryEntries;
}

function findEndOfCentralDirectoryOffset(zipBuffer: Buffer): number | null {
  const minimumEocdSize = 22;
  const maximumCommentSize = 0xffff;
  const lowerBound = Math.max(
    0,
    zipBuffer.length - minimumEocdSize - maximumCommentSize,
  );

  for (
    let offset = zipBuffer.length - minimumEocdSize;
    offset >= lowerBound;
    offset -= 1
  ) {
    if (zipBuffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  return null;
}

function readZipEntry(
  zipBuffer: Buffer,
  entry: FormexZipCentralDirectoryEntry,
): EuCommonCatalogueFormexXmlFile {
  const localHeaderOffset = entry.localHeaderOffset;
  if (localHeaderOffset + 30 > zipBuffer.length) {
    throw new Error("Unsupported Formex ZIP: local file header is truncated.");
  }
  if (zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("Unsupported Formex ZIP: invalid local file header.");
  }

  const fileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > zipBuffer.length) {
    throw new Error("Unsupported Formex ZIP: local file data is truncated.");
  }

  const compressedData = zipBuffer.subarray(dataStart, dataEnd);
  const fileBuffer = decompressZipEntry(
    compressedData,
    entry.compressionMethod,
  );

  return {
    fileName: entry.fileName,
    text: fileBuffer.toString("utf8"),
    byteLength: fileBuffer.length,
    checksumSha256: createHash("sha256").update(fileBuffer).digest("hex"),
  };
}

function decompressZipEntry(
  compressedData: Buffer,
  compressionMethod: number,
): Buffer {
  if (compressionMethod === 0) return compressedData;
  if (compressionMethod === 8) return inflateRawSync(compressedData);

  throw new Error(
    `Unsupported Formex ZIP compression method ${compressionMethod}.`,
  );
}

function parseFormexXmlFile(
  input: EuCommonCatalogueParserInput,
  file: EuCommonCatalogueFormexXmlFile,
): EuCommonCatalogueParsedRow[] {
  const rows: EuCommonCatalogueParsedRow[] = [];
  let speciesOrCrop: string | null = null;
  const eventPattern = /<TITLE\b[\s\S]*?<\/TITLE>|<TBL\b[\s\S]*?<\/TBL>/g;

  for (const eventMatch of file.text.matchAll(eventPattern)) {
    const xml = eventMatch[0];

    if (xml.startsWith("<TITLE")) {
      const title = normalizeTitleText(xml);
      if (isSpeciesOrCropTitle(xml, title)) {
        speciesOrCrop = title;
      }
      continue;
    }

    rows.push(...parseFormexTable(input, xml, speciesOrCrop));
  }

  return rows;
}

function parseFormexTable(
  input: EuCommonCatalogueParserInput,
  tableXml: string,
  speciesOrCrop: string | null,
): EuCommonCatalogueParsedRow[] {
  const headerXml = readFirstMatch(
    tableXml,
    /<ROW\b[^>]*TYPE="HEADER"[\s\S]*?<\/ROW>/,
  );
  const headerAction = headerXml
    ? readAdmissionAction(readCellXml(headerXml, "3"))
    : null;
  const rows: EuCommonCatalogueParsedRow[] = [];
  const rowPattern = /<ROW\b(?![^>]*TYPE="HEADER")[^>]*>[\s\S]*?<\/ROW>/g;

  for (const rowMatch of tableXml.matchAll(rowPattern)) {
    const rowXml = rowMatch[0];
    const varietyDenomination = normalizeText(readCellXml(rowXml, "1"));
    const notifierCode = normalizeText(readCellXml(rowXml, "2"));
    const actionCellXml = readCellXml(rowXml, "3");
    const rowAction = readAdmissionAction(actionCellXml);
    const admissionAction = rowAction ?? headerAction;
    const countryCode = readCountryCode(notifierCode);
    const marketExtensionDate = readMarketExtensionDate(actionCellXml);
    const statusReasons = buildStatusReasons({
      varietyDenomination,
      speciesOrCrop,
      notifierCode,
      countryCode,
      admissionAction,
      rowAction,
      headerAction,
    });
    const extractionConfidence = scoreExtractionConfidence(statusReasons);
    const confidenceBucket = bucketConfidence(extractionConfidence);

    rows.push({
      supplementType: input.supplementType,
      supplementLabel: input.supplementLabel,
      varietyDenomination,
      speciesOrCrop,
      countryCode,
      notifierCode,
      admissionAction,
      marketExtensionDate,
      registerType:
        input.supplementType === "agricultural_supplement_a"
          ? "agricultural_common_catalogue"
          : "vegetable_common_catalogue",
      ojCitation: input.ojCitation,
      sourceUrl: input.sourceUrl,
      publicationDate: input.publicationDate,
      artifactChecksumSha256: input.artifactChecksumSha256,
      parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
      extractionConfidence,
      confidenceBucket,
      statusReasons,
    });
  }

  return rows;
}

function assertOfficialEuCommonCatalogueSourceUrl(sourceUrl: string) {
  const allowedSourcePrefixes = [
    "https://eur-lex.europa.eu/eli/",
    "http://data.europa.eu/eli/",
    "https://data.europa.eu/eli/",
  ];

  if (!allowedSourcePrefixes.some((prefix) => sourceUrl.startsWith(prefix))) {
    throw new Error(
      "EU Common Catalogue parser accepts only official EUR-Lex or data.europa.eu ELI source URLs.",
    );
  }
}

function isSpeciesOrCropTitle(
  titleXml: string,
  normalizedTitle: string | null,
) {
  if (!normalizedTitle) return false;
  if (titleXml.includes('TYPE="ITALIC"')) return true;

  return /^[A-Z][a-z]+ [a-z]+(?:\s|$)/.test(normalizedTitle);
}

function normalizeTitleText(titleXml: string): string | null {
  return normalizeText(
    readFirstMatch(titleXml, /<TXT\b[^>]*>[\s\S]*?<\/TXT>/) ?? titleXml,
  );
}

function buildStatusReasons(input: {
  varietyDenomination: string | null;
  speciesOrCrop: string | null;
  notifierCode: string | null;
  countryCode: string | null;
  admissionAction: EuCommonCatalogueAdmissionAction | null;
  rowAction: EuCommonCatalogueAdmissionAction | null;
  headerAction: EuCommonCatalogueAdmissionAction | null;
}) {
  const reasons: string[] = [];

  if (!input.varietyDenomination) reasons.push("missing variety denomination");
  if (!input.speciesOrCrop) reasons.push("missing species or crop title");
  if (!input.notifierCode) reasons.push("missing notifier or admission field");
  if (input.notifierCode && !input.countryCode) {
    reasons.push("missing notifier country code");
  }
  if (!input.admissionAction) reasons.push("missing admission action");
  if (
    input.admissionAction &&
    !input.rowAction &&
    input.headerAction === input.admissionAction
  ) {
    reasons.push("admission action inferred from table header");
  }

  return reasons;
}

function scoreExtractionConfidence(statusReasons: readonly string[]) {
  const hasHardReject = statusReasons.some((reason) =>
    [
      "missing variety denomination",
      "missing species or crop title",
      "missing notifier or admission field",
      "missing notifier country code",
      "missing admission action",
    ].includes(reason),
  );

  if (hasHardReject) return 0.5;
  if (statusReasons.length > 0) return 0.94;
  return 0.99;
}

function bucketConfidence(
  confidence: number,
): EuCommonCatalogueConfidenceBucket {
  if (
    confidence >=
    EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS.acceptedMinConfidence
  ) {
    return "accepted";
  }
  if (
    confidence >=
    EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS.reviewNeededMinConfidence
  ) {
    return "review_needed";
  }
  return "rejected";
}

function readCellXml(rowXml: string, col: string): string | null {
  const pattern = new RegExp(
    `<CELL\\b(?=[^>]*\\bCOL="${col}")[^>]*>[\\s\\S]*?<\\/CELL>`,
  );
  return readFirstMatch(rowXml, pattern);
}

function readAdmissionAction(
  xml: string | null,
): EuCommonCatalogueAdmissionAction | null {
  const text = normalizeText(xml);
  if (!text) return null;
  if (/\badd\.?\b/i.test(text) || /\(add\.\)/i.test(text)) return "add";
  if (/\bdel\.?\b/i.test(text) || /\(del\.\)/i.test(text)) return "delete";
  if (/\bmod\.?\b/i.test(text) || /\(mod\.\)/i.test(text)) return "modify";
  return null;
}

function readCountryCode(notifierCode: string | null): string | null {
  return notifierCode?.match(/^([A-Z]{2})(?:\s|$)/)?.[1] ?? null;
}

function readMarketExtensionDate(xml: string | null): string | null {
  const isoDate = /<DATE\b[^>]*ISO="(\d{8})"/.exec(xml ?? "")?.[1] ?? null;
  if (!isoDate) return null;

  return `${isoDate.slice(0, 4)}-${isoDate.slice(4, 6)}-${isoDate.slice(6, 8)}`;
}

function buildTotals(rows: readonly EuCommonCatalogueParsedRow[]) {
  return {
    parsedRows: rows.length,
    acceptedRows: rows.filter((row) => row.confidenceBucket === "accepted")
      .length,
    reviewNeededRows: rows.filter(
      (row) => row.confidenceBucket === "review_needed",
    ).length,
    rejectedRows: rows.filter((row) => row.confidenceBucket === "rejected")
      .length,
  };
}

function summarizeRows<
  TField extends "supplementLabel" | "speciesOrCrop" | "countryCode",
>(
  rows: readonly EuCommonCatalogueParsedRow[],
  field: TField,
): EuCommonCatalogueParserSummaryRow<TField>[] {
  const byField = new Map<string, EuCommonCatalogueParsedRow[]>();

  for (const row of rows) {
    const value = row[field];
    if (!value) continue;
    byField.set(value, [...(byField.get(value) ?? []), row]);
  }

  return [...byField.entries()]
    .map(([value, fieldRows]) => ({
      [field]: value,
      ...buildBucketCounts(fieldRows),
    }))
    .sort(sortSummaryRows) as EuCommonCatalogueParserSummaryRow<TField>[];
}

function summarizeNotifierRows(
  rows: readonly EuCommonCatalogueParsedRow[],
): Array<
  EuCommonCatalogueParserSummaryRow<"notifierCode"> & {
    countryCode: string | null;
  }
> {
  const byNotifier = new Map<string, EuCommonCatalogueParsedRow[]>();

  for (const row of rows) {
    if (!row.notifierCode) continue;
    byNotifier.set(row.notifierCode, [
      ...(byNotifier.get(row.notifierCode) ?? []),
      row,
    ]);
  }

  return [...byNotifier.entries()]
    .map(([notifierCode, notifierRows]) => ({
      notifierCode,
      countryCode: notifierRows[0]?.countryCode ?? null,
      ...buildBucketCounts(notifierRows),
    }))
    .sort(sortSummaryRows);
}

function summarizeConfidenceBuckets(
  rows: readonly EuCommonCatalogueParsedRow[],
) {
  return (["accepted", "review_needed", "rejected"] as const).map((bucket) => ({
    bucket,
    rows: rows.filter((row) => row.confidenceBucket === bucket).length,
  }));
}

function summarizeStatusRows(
  rows: readonly EuCommonCatalogueParsedRow[],
  bucket: "review_needed" | "rejected",
) {
  return rows
    .filter((row) => row.confidenceBucket === bucket)
    .slice(0, 25)
    .map((row) =>
      [
        row.supplementLabel,
        row.speciesOrCrop ?? "unknown species",
        row.varietyDenomination ?? "unknown variety",
        row.notifierCode ?? "unknown notifier",
        row.statusReasons.join("; "),
      ].join(" | "),
    );
}

function buildBucketCounts(rows: readonly EuCommonCatalogueParsedRow[]) {
  return {
    rows: rows.length,
    acceptedRows: rows.filter((row) => row.confidenceBucket === "accepted")
      .length,
    reviewNeededRows: rows.filter(
      (row) => row.confidenceBucket === "review_needed",
    ).length,
    rejectedRows: rows.filter((row) => row.confidenceBucket === "rejected")
      .length,
  };
}

function sortSummaryRows<
  TRow extends {
    rows: number;
  },
>(left: TRow, right: TRow) {
  if (left.rows !== right.rows) return right.rows - left.rows;
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function readFirstMatch(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[0] ?? null;
}

function normalizeText(xml: string | null): string | null {
  if (!xml) return null;

  const text = decodeXmlEntities(xml.replace(/<[^>]+>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0 ? text : null;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}
