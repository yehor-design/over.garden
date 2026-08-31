import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { containsPreciseLocationText } from "@/lib/privacy/precise-location-text";
import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const PUBLIC_STABLE_REGISTRY_QUERY_DEADLINE_MS = 750;
export const PUBLIC_STABLE_REGISTRY_PAGE_SIZE = 20;

export type PublicStableRegistryKind = "all" | "plant" | "animal";

/**
 * What the approved catalog can say about one record's kingdom.
 *
 * A `species` identity in this product is legitimately a plant or an animal,
 * and nothing in the catalog layer establishes which. `either` states that
 * honestly instead of defaulting to `plant`, and matches the vocabulary the
 * product projection already uses for the same release members.
 */
export type PublicStableCatalogObjectKind = "plant" | "animal" | "either";
export type PublicStableRegistrySurface = "catalog" | "eppo";
export type PublicStableRegistryEvidenceState =
  | "approved_stable_registry"
  | "source_record_not_approved"
  | "superseded_source_evidence";

export interface PublicStableRegistryRequest {
  kind: PublicStableRegistryKind;
  query: string;
  cursor: string | null;
}

export interface ParsedPublicStableRegistryRequest {
  request: PublicStableRegistryRequest;
  error: "invalid_query" | "invalid_cursor" | null;
}

export interface PublicStableRegistryCursor {
  name: string;
  key: string;
}

export interface PublicStableCatalogRecord {
  stableTaxon: string;
  objectKind: PublicStableCatalogObjectKind;
  displayName: string;
  scientificName: string | null;
  taxonomicRank: string | null;
  parentDisplayName: string | null;
  aliases: string[];
  evidenceState: "approved_stable_registry";
  href: string;
  qualityClass: PublicProjectionQualityClass;
  observedAt: string;
}

export interface PublicEppoSourceRecord {
  eppoCode: string;
  objectKind: Exclude<PublicStableRegistryKind, "all">;
  displayName: string;
  scientificName: string | null;
  taxonomicRank: string | null;
  parentDisplayName: string | null;
  aliases: string[];
  evidenceState: "source_record_not_approved" | "superseded_source_evidence";
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

export interface PublicStableRegistryPage<T> {
  request: PublicStableRegistryRequest;
  records: T[];
  nextCursor: string | null;
  qualityClass: PublicProjectionQualityClass;
}

interface PublicCatalogRow {
  stableTaxon: string;
  objectKind: string;
  canonicalName: string;
  scientificName: string | null;
  taxonomicRank: string | null;
  parentDisplayName: string | null;
  safeAliases: string[];
  activatedAt: Date | string;
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

export function parsePublicStableRegistryRequest(input: {
  kind?: string | string[] | null;
  q?: string | string[] | null;
  cursor?: string | string[] | null;
}): ParsedPublicStableRegistryRequest {
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

export function encodePublicStableRegistryCursor(
  cursor: PublicStableRegistryCursor,
): string {
  const payload = JSON.stringify({ name: cursor.name, key: cursor.key });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePublicStableRegistryCursor(
  value: string | null,
): PublicStableRegistryCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<PublicStableRegistryCursor>;
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

export async function listPublicStableCatalogPage(
  request: PublicStableRegistryRequest,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<PublicStableRegistryPage<PublicStableCatalogRecord>> {
  if (executor === db) {
    return db.transaction().execute(async (transaction) => {
      await configurePublicReadDeadline(transaction);
      return listPublicStableCatalogPage(request, locale, transaction);
    });
  }

  const rows = await buildPublicStableCatalogQuery(executor, request).execute();
  const records = rows
    .map((row) => serializePublicStableCatalogRecord(row, locale))
    .filter((row): row is PublicStableCatalogRecord => row !== null);
  const visible = records.slice(0, PUBLIC_STABLE_REGISTRY_PAGE_SIZE);
  const tail = visible.at(-1);

  return {
    request,
    records: visible,
    nextCursor:
      records.length > PUBLIC_STABLE_REGISTRY_PAGE_SIZE && tail
        ? encodePublicStableRegistryCursor({
            name: normalizeCursorName(tail.displayName),
            key: tail.stableTaxon,
          })
        : null,
    qualityClass: "verified",
  };
}

export async function listPublicEppoSourcePage(
  request: PublicStableRegistryRequest,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<PublicStableRegistryPage<PublicEppoSourceRecord>> {
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
  const visible = records.slice(0, PUBLIC_STABLE_REGISTRY_PAGE_SIZE);
  const tail = visible.at(-1);

  return {
    request,
    records: visible,
    nextCursor:
      records.length > PUBLIC_STABLE_REGISTRY_PAGE_SIZE && tail
        ? encodePublicStableRegistryCursor({
            name: normalizeCursorName(tail.displayName),
            key: tail.eppoCode,
          })
        : null,
    qualityClass: "partial",
  };
}

export async function findPublicStableCatalogRecord(
  stableTaxon: string,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<PublicStableCatalogRecord | null> {
  if (!isStableTaxon(stableTaxon)) return null;
  if (executor === db) {
    return db.transaction().execute(async (transaction) => {
      await configurePublicReadDeadline(transaction);
      return findPublicStableCatalogRecord(stableTaxon, locale, transaction);
    });
  }

  const row = await executor
    .selectFrom("stable_registry_public_catalog_records as records")
    .innerJoin(
      "catalog_registry_active_pointers as pointers",
      "pointers.active_release_id",
      "records.registry_release_id",
    )
    .select([
      "records.stable_taxon as stableTaxon",
      "records.object_kind as objectKind",
      "records.canonical_name as canonicalName",
      "records.scientific_name as scientificName",
      "records.taxonomic_rank as taxonomicRank",
      "records.parent_display_name as parentDisplayName",
      "records.safe_aliases as safeAliases",
      "records.activated_at as activatedAt",
    ])
    .where("pointers.release_family", "=", "foundation")
    .where("records.stable_taxon", "=", stableTaxon)
    .executeTakeFirst();

  return row ? serializePublicStableCatalogRecord(row, locale) : null;
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

export function buildPublicStableCatalogQuery(
  executor: QueryExecutor,
  request: PublicStableRegistryRequest,
) {
  const cursor = decodePublicStableRegistryCursor(request.cursor);
  let query = executor
    .selectFrom("stable_registry_public_catalog_records as records")
    .innerJoin(
      "catalog_registry_active_pointers as pointers",
      "pointers.active_release_id",
      "records.registry_release_id",
    )
    .select([
      "records.stable_taxon as stableTaxon",
      "records.object_kind as objectKind",
      "records.canonical_name as canonicalName",
      "records.scientific_name as scientificName",
      "records.taxonomic_rank as taxonomicRank",
      "records.parent_display_name as parentDisplayName",
      "records.safe_aliases as safeAliases",
      "records.activated_at as activatedAt",
    ])
    .where("pointers.release_family", "=", "foundation");

  if (request.kind !== "all") {
    // A record whose kingdom is unresolved belongs under both filters. Dropping
    // it from one of them would hide an approved identity from the guest who
    // filtered for exactly the kingdom it may belong to.
    const requestedKind = request.kind;
    query = query.where((eb) =>
      eb.or([
        eb("records.object_kind", "=", requestedKind),
        eb("records.object_kind", "=", "either"),
      ]),
    );
  }
  if (request.query) {
    const normalizedQuery = request.query.toLocaleLowerCase("en");
    query = query.where(
      sql<boolean>`exists (
        select 1
        from stable_registry_public_catalog_search_terms as search_terms
        where search_terms.registry_release_id = ${sql.ref("records.registry_release_id")}
          and search_terms.stable_taxon = ${sql.ref("records.stable_taxon")}
          and search_terms.normalized_term like ${`${normalizedQuery}%`}
      )`,
    );
  }
  if (cursor) {
    query = query.where(
      sql<boolean>`(lower(${sql.ref("records.canonical_name")}), ${sql.ref("records.stable_taxon")}) > (${cursor.name}, ${cursor.key})`,
    );
  }

  return query
    .orderBy(sql<string>`lower(${sql.ref("records.canonical_name")})`, "asc")
    .orderBy("records.stable_taxon", "asc")
    .limit(PUBLIC_STABLE_REGISTRY_PAGE_SIZE + 1)
    .$castTo<PublicCatalogRow>();
}

export function buildPublicEppoSourceQuery(
  executor: QueryExecutor,
  request: PublicStableRegistryRequest,
) {
  const cursor = decodePublicStableRegistryCursor(request.cursor);
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
    .limit(PUBLIC_STABLE_REGISTRY_PAGE_SIZE + 1)
    .$castTo<PublicEppoRow>();
}

export function isPublicStableRegistryDeadlineError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "57014" ||
    (typeof candidate.message === "string" &&
      /statement timeout|query timeout/i.test(candidate.message))
  );
}

export function serializePublicStableCatalogRecord(
  row: PublicCatalogRow,
  locale: PublicLocale,
): PublicStableCatalogRecord | null {
  const stableTaxon = row.stableTaxon.trim();
  const displayName = sanitizePublicLabel(row.canonicalName);
  const scientificName = sanitizeOptionalPublicLabel(row.scientificName);
  const taxonomicRank = sanitizeOptionalPublicLabel(row.taxonomicRank);
  const parentDisplayName = sanitizeOptionalPublicLabel(row.parentDisplayName);
  const objectKind = normalizeCatalogObjectKind(row.objectKind);
  if (!isStableTaxon(stableTaxon) || !displayName || !objectKind) return null;

  return {
    stableTaxon,
    objectKind,
    displayName,
    scientificName,
    taxonomicRank,
    parentDisplayName,
    aliases: sanitizeAliases(row.safeAliases),
    evidenceState: "approved_stable_registry",
    href: localizedPath(locale, `/catalog/${encodeURIComponent(stableTaxon)}`),
    qualityClass: "verified",
    observedAt: toIsoTimestamp(row.activatedAt),
  };
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

function containsUnsafePublicText(value: string): boolean {
  return (
    containsPreciseLocationText(value) ||
    /[\u0000-\u001f\u007f]|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:https?:\/\/|www\.)|\b(?:token|invite|checksum|raw[_ -]?payload|source[_ -]?only|latitude|longitude|coordinates?|координат|широт|довгот)\b/iu.test(
      value,
    )
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
): Exclude<PublicStableRegistryKind, "all"> | null {
  return value === "plant" || value === "animal" ? value : null;
}

// The source archive keeps the two-valued vocabulary: its kind comes from the
// observed `datatype` field, which is evidence rather than inference.
function normalizeCatalogObjectKind(
  value: string,
): PublicStableCatalogObjectKind | null {
  return value === "plant" || value === "animal" || value === "either"
    ? value
    : null;
}

function normalizeSourceEvidenceState(
  value: string,
): PublicEppoSourceRecord["evidenceState"] | null {
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
  value: PublicStableRegistryKind;
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
  return decodePublicStableRegistryCursor(value)
    ? { value, invalid: false }
    : { value: null, invalid: true };
}

function firstValue(
  value: string | string[] | null | undefined,
): string | null {
  return typeof value === "string" ? value : null;
}

function isStableTaxon(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 120;
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
