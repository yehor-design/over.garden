import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";

/**
 * The public EPPO archive read model (OVE-256, retained by ADR-0025 D2).
 *
 * It reads `stable_registry_public_eppo_records`, the derived projection of a
 * completed EPPO observed capture, joined to the capture that produced it. It
 * never selects a raw payload, a source-only field, a checksum, or a
 * coordinate, and a visible record is source evidence, never an approved
 * OverGarden catalog identity. The table keeps the prefix it was created with
 * in migration `0025`; the Stable Registry release model that once sat beside
 * this archive is retired.
 */

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const EPPO_ARCHIVE_PAGE_SIZE = 20;

export type EppoArchiveKind = "all" | "plant" | "animal";
export type EppoArchiveEvidenceState =
  | "source_record_not_approved"
  | "superseded_source_evidence";

export interface EppoArchiveRequest {
  kind: EppoArchiveKind;
  query: string;
  cursor: string | null;
}

export interface ParsedEppoArchiveRequest {
  request: EppoArchiveRequest;
  error: "invalid_query" | "invalid_cursor" | null;
}

export interface EppoArchiveCursor {
  name: string;
  key: string;
}

export interface PublicEppoSourceRecord {
  eppoCode: string;
  objectKind: Exclude<EppoArchiveKind, "all">;
  displayName: string;
  scientificName: string | null;
  taxonomicRank: string | null;
  parentDisplayName: string | null;
  aliases: string[];
  evidenceState: EppoArchiveEvidenceState;
  href: string;
  qualityClass: PublicProjectionQualityClass;
  observedAt: string;
  source: PublicEppoSourceCredit;
}

export interface PublicEppoSourceCredit {
  name: string;
  url: string;
  license: string;
  licenseUrl: string | null;
  attribution: string | null;
}

export interface EppoArchivePage {
  request: EppoArchiveRequest;
  records: PublicEppoSourceRecord[];
  nextCursor: string | null;
  qualityClass: PublicProjectionQualityClass;
}

interface PublicEppoRow {
  eppoCode: string;
  objectKind: string;
  displayName: string;
  scientificName: string | null;
  taxonomicRank: string | null;
  parentDisplayName: string | null;
  safeAliases: string[];
  evidenceState: string;
  observedAt: Date | string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionText: string | null;
}

export function parseEppoArchiveRequest(input: {
  kind?: string | string[] | null;
  q?: string | string[] | null;
  cursor?: string | string[] | null;
}): ParsedEppoArchiveRequest {
  const kind = firstValue(input.kind);
  const normalizedKind = normalizeKind(kind);
  const query = normalizeQuery(firstValue(input.q));
  const cursor = normalizeCursor(firstValue(input.cursor));

  return {
    request: {
      kind: normalizedKind.value,
      query: query.value,
      cursor: cursor.value,
    },
    error:
      query.invalid || normalizedKind.invalid
        ? "invalid_query"
        : cursor.invalid
          ? "invalid_cursor"
          : null,
  };
}

export function encodeEppoArchiveCursor(cursor: EppoArchiveCursor): string {
  const payload = JSON.stringify({ name: cursor.name, key: cursor.key });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeEppoArchiveCursor(
  value: string | null,
): EppoArchiveCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<EppoArchiveCursor>;
    if (
      typeof candidate.name !== "string" ||
      typeof candidate.key !== "string" ||
      candidate.name.length > 240 ||
      candidate.key.length > 120 ||
      !candidate.name ||
      !candidate.key ||
      containsUnsafePublicText(candidate.name) ||
      containsUnsafePublicText(candidate.key)
    ) {
      return null;
    }
    return { name: candidate.name, key: candidate.key };
  } catch {
    return null;
  }
}

export async function listPublicEppoSourcePage(
  request: EppoArchiveRequest,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<EppoArchivePage> {
  if (executor === db) {
    return db.transaction().execute(async (transaction) => {
      await configurePublicReadDeadline(transaction);
      return listPublicEppoSourcePage(request, locale, transaction);
    });
  }

  const rows = await buildPublicEppoSourceQuery(executor, request).execute();
  const records = rows
    .map((row) => serializePublicEppoSourceRecord(row, locale))
    .filter((row): row is PublicEppoSourceRecord => row !== null);
  const visible = records.slice(0, EPPO_ARCHIVE_PAGE_SIZE);
  const tail = visible.at(-1);

  return {
    request,
    records: visible,
    nextCursor:
      records.length > EPPO_ARCHIVE_PAGE_SIZE && tail
        ? encodeEppoArchiveCursor({
            name: normalizeCursorName(tail.displayName),
            key: tail.eppoCode,
          })
        : null,
    qualityClass: "partial",
  };
}

export async function findPublicEppoSourceRecord(
  eppoCode: string,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<PublicEppoSourceRecord | null> {
  const normalizedCode = eppoCode.trim().toUpperCase();
  if (!/^[0-9A-Z]{5,6}$/u.test(normalizedCode)) return null;
  if (executor === db) {
    return db.transaction().execute(async (transaction) => {
      await configurePublicReadDeadline(transaction);
      return findPublicEppoSourceRecord(normalizedCode, locale, transaction);
    });
  }

  const row = await executor
    .selectFrom("stable_registry_public_eppo_records as records")
    .innerJoin(
      "catalog_source_capture_runs as captures",
      "captures.id",
      "records.capture_id",
    )
    .select([
      "records.eppo_code as eppoCode",
      "records.object_kind as objectKind",
      "records.display_name as displayName",
      "records.scientific_name as scientificName",
      "records.taxonomic_rank as taxonomicRank",
      "records.parent_display_name as parentDisplayName",
      "records.safe_aliases as safeAliases",
      "records.evidence_state as evidenceState",
      "records.observed_at as observedAt",
      "records.source_name as sourceName",
      "records.source_url as sourceUrl",
      "records.license",
      "records.license_url as licenseUrl",
      "records.attribution_text as attributionText",
    ])
    .where("captures.state", "in", ["completed", "superseded_by_new_capture"])
    .where("records.eppo_code", "=", normalizedCode)
    .executeTakeFirst();

  return row ? serializePublicEppoSourceRecord(row, locale) : null;
}

export function buildPublicEppoSourceQuery(
  executor: QueryExecutor,
  request: EppoArchiveRequest,
) {
  const cursor = decodeEppoArchiveCursor(request.cursor);
  let query = executor
    .selectFrom("stable_registry_public_eppo_records as records")
    .innerJoin(
      "catalog_source_capture_runs as captures",
      "captures.id",
      "records.capture_id",
    )
    .select([
      "records.eppo_code as eppoCode",
      "records.object_kind as objectKind",
      "records.display_name as displayName",
      "records.scientific_name as scientificName",
      "records.taxonomic_rank as taxonomicRank",
      "records.parent_display_name as parentDisplayName",
      "records.safe_aliases as safeAliases",
      "records.evidence_state as evidenceState",
      "records.observed_at as observedAt",
      "records.source_name as sourceName",
      "records.source_url as sourceUrl",
      "records.license",
      "records.license_url as licenseUrl",
      "records.attribution_text as attributionText",
    ])
    .where("captures.state", "in", ["completed", "superseded_by_new_capture"]);

  // The archive keeps the two-valued vocabulary: a record's kind comes from
  // the observed `datatype` field, which is evidence rather than inference.
  if (request.kind !== "all") {
    query = query.where("records.object_kind", "=", request.kind);
  }
  if (request.query) {
    const normalizedQuery = request.query.toLocaleLowerCase("en");
    query = query.where(
      sql<boolean>`exists (
        select 1
        from stable_registry_public_eppo_search_terms as search_terms
        where search_terms.capture_id = ${sql.ref("records.capture_id")}
          and search_terms.eppo_code = ${sql.ref("records.eppo_code")}
          and search_terms.normalized_term like ${`${normalizedQuery}%`}
      )`,
    );
  }
  if (cursor) {
    query = query.where(
      sql<boolean>`(lower(${sql.ref("records.display_name")}), ${sql.ref("records.eppo_code")}) > (${cursor.name}, ${cursor.key})`,
    );
  }

  return query
    .orderBy(sql<string>`lower(${sql.ref("records.display_name")})`, "asc")
    .orderBy("records.eppo_code", "asc")
    .limit(EPPO_ARCHIVE_PAGE_SIZE + 1)
    .$castTo<PublicEppoRow>();
}

export function isEppoArchiveDeadlineError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "57014" ||
    (typeof candidate.message === "string" &&
      /statement timeout|query timeout/i.test(candidate.message))
  );
}

export function serializePublicEppoSourceRecord(
  row: PublicEppoRow,
  locale: PublicLocale,
): PublicEppoSourceRecord | null {
  const eppoCode = row.eppoCode.trim().toUpperCase();
  const displayName = sanitizePublicLabel(row.displayName);
  const scientificName = sanitizeOptionalPublicLabel(row.scientificName);
  const taxonomicRank = sanitizeOptionalPublicLabel(row.taxonomicRank);
  const parentDisplayName = sanitizeOptionalPublicLabel(row.parentDisplayName);
  const objectKind = normalizeObjectKind(row.objectKind);
  const evidenceState = normalizeSourceEvidenceState(row.evidenceState);
  const source = sanitizeSourceCredit(row);
  if (
    !/^[0-9A-Z]{5,6}$/u.test(eppoCode) ||
    !displayName ||
    !objectKind ||
    !evidenceState ||
    !source
  ) {
    return null;
  }

  return {
    eppoCode,
    objectKind,
    displayName,
    scientificName,
    taxonomicRank,
    parentDisplayName,
    aliases: sanitizeAliases(row.safeAliases),
    evidenceState,
    href: localizedPath(
      locale,
      `/sources/eppo/${encodeURIComponent(eppoCode)}`,
    ),
    qualityClass: "partial",
    observedAt: toIsoTimestamp(row.observedAt),
    source,
  };
}

function sanitizeSourceCredit(
  row: PublicEppoRow,
): PublicEppoSourceCredit | null {
  const name = sanitizePublicLabel(row.sourceName);
  const license = sanitizePublicLabel(row.license);
  const attribution = row.attributionText
    ? sanitizePublicLabel(row.attributionText)
    : null;
  const url = sanitizeHttpsUrl(row.sourceUrl);
  const licenseUrl = row.licenseUrl ? sanitizeHttpsUrl(row.licenseUrl) : null;
  if (!name || !license || !url || (row.licenseUrl && !licenseUrl)) return null;
  return { name, license, url, licenseUrl, attribution };
}

function sanitizeAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((item) => [sanitizePublicLabel(item)]).filter(Boolean),
    ),
  ].slice(0, 12) as string[];
}

function sanitizeOptionalPublicLabel(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : sanitizePublicLabel(value);
}

function sanitizePublicLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (
    !normalized ||
    normalized.length > 240 ||
    containsUnsafePublicText(normalized)
  ) {
    return null;
  }
  return normalized;
}

// Source records may carry occurrence coordinates; TECH_STACK invariant 1 keeps
// them out of every public payload. This is source-data hygiene, not a
// free-text firewall (ADR-0022, D1 applies to gardener text only).
const SOURCE_COORDINATE_PAIR =
  /[-+]?\d{1,3}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,}/;

function containsUnsafePublicText(value: string): boolean {
  if (SOURCE_COORDINATE_PAIR.test(value)) return true;
  return /[\u0000-\u001f\u007f]|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:https?:\/\/|www\.)|\b(?:token|invite|checksum|raw[_ -]?payload|source[_ -]?only|latitude|longitude|coordinates?|координат|широт|довгот)\b/iu.test(
    value,
  );
}

function sanitizeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    // Citation URLs are safe only as canonical HTTPS origins and paths. Query
    // strings and fragments can carry provider credentials, opaque source IDs,
    // or location-bearing parameters, none of which belong in a guest read
    // model.
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeObjectKind(
  value: string,
): Exclude<EppoArchiveKind, "all"> | null {
  return value === "plant" || value === "animal" ? value : null;
}

function normalizeSourceEvidenceState(
  value: string,
): EppoArchiveEvidenceState | null {
  return value === "source_record_not_approved" ||
    value === "superseded_source_evidence"
    ? value
    : null;
}

function normalizeQuery(value: string | null): {
  value: string;
  invalid: boolean;
} {
  if (value === null) return { value: "", invalid: false };
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalized) return { value: "", invalid: false };
  return {
    value: normalized,
    invalid:
      normalized.length < 2 ||
      normalized.length > 120 ||
      /[\u0000-\u001f\u007f%_\\]/u.test(normalized),
  };
}

function normalizeKind(value: string | null): {
  value: EppoArchiveKind;
  invalid: boolean;
} {
  if (!value) return { value: "all", invalid: false };
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "all" ||
    normalized === "plant" ||
    normalized === "animal"
  ) {
    return { value: normalized, invalid: false };
  }
  return { value: "all", invalid: true };
}

function normalizeCursor(value: string | null): {
  value: string | null;
  invalid: boolean;
} {
  if (!value) return { value: null, invalid: false };
  return decodeEppoArchiveCursor(value)
    ? { value, invalid: false }
    : { value: null, invalid: true };
}

function firstValue(
  value: string | string[] | null | undefined,
): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeCursorName(value: string) {
  return value.toLocaleLowerCase("en");
}

function toIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : new Date(0).toISOString();
}

async function configurePublicReadDeadline(executor: Transaction<Database>) {
  await sql`set local statement_timeout = '750ms'`.execute(executor);
}
