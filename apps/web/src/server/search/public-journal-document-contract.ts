/**
 * OVE-227 — exact, privacy-safe public journal document contract.
 *
 * OVE-196 shipped a parity gate that only compared identifiers, key sets, and
 * a handful of projection classes, and it rewrote observed values with expected
 * values before hashing. A stale title, body, slug, path, date, or cover
 * derivative URL therefore passed as "expected". This module owns the exact
 * comparison instead:
 *
 * - every allowed field is canonicalized and hashed, so any value drift shows
 *   up as a mismatch;
 * - an observed Meilisearch document is validated on its own merits (schema,
 *   value domain, URL origin, lifecycle) and never against expected values;
 * - evidence stays safe because comparison outputs are SHA-256 digests and
 *   field/reason class names, never raw content.
 *
 * Deliberately pure: no `server-only`, no database, no Meilisearch. The parity
 * orchestrator in `public-journal-parity.ts` supplies the I/O.
 */

import { createHash } from "node:crypto";

import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { isValidPublicJournalSlug } from "@/lib/garden/public-journal-slug";
import { normalizeCoarseRegionCode } from "@/lib/garden/regions";
import { containsPreciseLocationText } from "@/lib/privacy/precise-location-text";
import { isSafeJournalSearchDocumentId } from "@/server/search/public-journal-document-id";
import type {
  JournalEntrySearchContractDocument,
  JournalSearchCoverSource,
} from "@/server/search/documents";

/** Mirrors `contracts/search/public-journal-entry-search-document.json`. */
export const REQUIRED_JOURNAL_DOCUMENT_FIELDS = [
  "body",
  "coverSource",
  "createdAt",
  "entryDate",
  "entryScope",
  "id",
  "kind",
  "locationVisibility",
  "noindex",
  "publicPath",
  "publicSlug",
  "title",
] as const;

export const OPTIONAL_JOURNAL_DOCUMENT_FIELDS = [
  "coarseRegionCode",
  "coverPublicUrl",
] as const;

export const ALLOWED_JOURNAL_DOCUMENT_FIELDS = [
  ...REQUIRED_JOURNAL_DOCUMENT_FIELDS,
  ...OPTIONAL_JOURNAL_DOCUMENT_FIELDS,
].sort() as readonly string[];

export type JournalDocumentField =
  (typeof ALLOWED_JOURNAL_DOCUMENT_FIELDS)[number];

const ALLOWED_FIELD_SET = new Set<string>(ALLOWED_JOURNAL_DOCUMENT_FIELDS);

/**
 * Keys that must never reach the public index. Kept as an explicit deny list on
 * top of the allow list so a forbidden key is reported as a privacy class, not
 * as a generic unknown field.
 */
export const FORBIDDEN_JOURNAL_DOCUMENT_FIELDS = [
  "address",
  "analyticsPayload",
  "coarse_region_code",
  "coordinates",
  "coverMediaAssetId",
  "cover_media_asset_id",
  "derivativeKey",
  "email",
  "exif",
  "gps",
  "inviteToken",
  "ip",
  "ipAddress",
  "latitude",
  "lifecycleState",
  "lifecycle_state",
  "location",
  "longitude",
  "mediaAssetId",
  "mediaKey",
  "originalKey",
  "ownerId",
  "ownerUserId",
  "owner_user_id",
  "plantObjectId",
  "preciseLocation",
  "publicGoneAt",
  "public_gone_at",
  "quarantineKey",
  "rawLocation",
  "referer",
  "referrer",
  "signedUrl",
  "spaceId",
  "userAgent",
  "userId",
  "user_id",
  "visibility",
] as const;

const FORBIDDEN_FIELD_SET = new Set<string>(FORBIDDEN_JOURNAL_DOCUMENT_FIELDS);

export const JOURNAL_DOCUMENT_REASONS = [
  "forbidden_field",
  "unknown_field",
  "missing_field",
  "invalid_id",
  "invalid_kind",
  "invalid_title",
  "invalid_body",
  "invalid_public_slug",
  "invalid_public_path",
  "invalid_location_visibility",
  "invalid_coarse_region_code",
  "invalid_noindex",
  "invalid_entry_date",
  "invalid_entry_scope",
  "invalid_created_at",
  "invalid_cover_source",
  "invalid_cover_public_url",
  "precise_location_text",
] as const;

export type JournalDocumentReason = (typeof JOURNAL_DOCUMENT_REASONS)[number];

export interface JournalDocumentValidation {
  ok: boolean;
  /** Present only when every field is valid; safe to hash and compare. */
  document: JournalEntrySearchContractDocument | null;
  /** Sorted unique reason classes. Never carries a value. */
  reasons: JournalDocumentReason[];
  /** Sorted unique field names that failed. Names only, never values. */
  fields: string[];
}

export interface ObservedDocumentValidationOptions {
  /**
   * Public derivative base URL (`R2_PUBLIC_BASE_URL`). When provided, a cover
   * URL that does not sit under this origin+prefix is rejected, which is what
   * catches a stale derivative pointing at a retired or foreign bucket.
   */
  publicDerivativeBaseUrl?: string | null;
}

const COVER_SOURCES: readonly JournalSearchCoverSource[] = [
  "automatic_inline",
  "explicit_inline",
  "separate",
  "none",
];

/**
 * Validate one raw Meilisearch document against the full public contract.
 *
 * Expected values are never consulted: a document is judged on its own schema,
 * value domains, URL origin, and lifecycle safety. Comparison against Postgres
 * happens afterwards, on the canonical hash.
 */
export function validateObservedJournalSearchDocument(
  raw: unknown,
  options: ObservedDocumentValidationOptions = {},
): JournalDocumentValidation {
  const reasons = new Set<JournalDocumentReason>();
  const fields = new Set<string>();

  const fail = (reason: JournalDocumentReason, field: string) => {
    reasons.add(reason);
    fields.add(field);
  };

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      document: null,
      reasons: ["unknown_field"],
      fields: ["<document>"],
    };
  }

  const doc = raw as Record<string, unknown>;

  for (const key of Object.keys(doc)) {
    if (FORBIDDEN_FIELD_SET.has(key)) {
      fail("forbidden_field", key);
    } else if (!ALLOWED_FIELD_SET.has(key)) {
      fail("unknown_field", key);
    }
  }
  for (const key of REQUIRED_JOURNAL_DOCUMENT_FIELDS) {
    if (!(key in doc)) fail("missing_field", key);
  }

  const id =
    typeof doc.id === "string" && isSafeJournalSearchDocumentId(doc.id)
      ? doc.id.toLowerCase()
      : null;
  if (id === null) fail("invalid_id", "id");

  if (doc.kind !== "journal_entry") fail("invalid_kind", "kind");

  const title = typeof doc.title === "string" ? doc.title : null;
  if (title === null || title.trim().length === 0) {
    fail("invalid_title", "title");
  }

  const body = typeof doc.body === "string" ? doc.body : null;
  if (body === null || body.trim().length === 0) {
    fail("invalid_body", "body");
  }

  // OVE-234: a document carrying coordinate text is unsafe even when the
  // current Postgres row is clean. Fail closed so repair deletes/rewrites it.
  if (
    (title !== null && containsPreciseLocationText(title)) ||
    (body !== null && containsPreciseLocationText(body))
  ) {
    reasons.add("precise_location_text");
    if (title !== null && containsPreciseLocationText(title)) {
      fields.add("title");
    }
    if (body !== null && containsPreciseLocationText(body)) {
      fields.add("body");
    }
  }

  const publicSlug = isValidPublicJournalSlug(doc.publicSlug)
    ? doc.publicSlug
    : null;
  if (publicSlug === null) fail("invalid_public_slug", "publicSlug");

  if (
    publicSlug === null ||
    typeof doc.publicPath !== "string" ||
    doc.publicPath !== publicJournalEntryPath(publicSlug)
  ) {
    fail("invalid_public_path", "publicPath");
  }

  const locationVisibility =
    doc.locationVisibility === "region" || doc.locationVisibility === "hidden"
      ? doc.locationVisibility
      : null;
  if (locationVisibility === null) {
    fail("invalid_location_visibility", "locationVisibility");
  }

  let coarseRegionCode: string | null = null;
  if (locationVisibility === "region") {
    coarseRegionCode = normalizeCoarseRegionCode(
      typeof doc.coarseRegionCode === "string" ? doc.coarseRegionCode : null,
    );
    if (coarseRegionCode === null) {
      fail("invalid_coarse_region_code", "coarseRegionCode");
    }
  } else if ("coarseRegionCode" in doc) {
    // A hidden-location document must not carry a region at all.
    fail("invalid_coarse_region_code", "coarseRegionCode");
  }

  if (typeof doc.noindex !== "boolean") fail("invalid_noindex", "noindex");

  if (!isCanonicalIsoTimestamp(doc.entryDate)) {
    fail("invalid_entry_date", "entryDate");
  }
  if (!isCanonicalIsoTimestamp(doc.createdAt)) {
    fail("invalid_created_at", "createdAt");
  }

  const entryScope =
    doc.entryScope === "object" || doc.entryScope === "space"
      ? doc.entryScope
      : null;
  if (entryScope === null) fail("invalid_entry_scope", "entryScope");

  const coverSource = COVER_SOURCES.includes(
    doc.coverSource as JournalSearchCoverSource,
  )
    ? (doc.coverSource as JournalSearchCoverSource)
    : null;
  if (coverSource === null) fail("invalid_cover_source", "coverSource");

  let coverPublicUrl: string | null = null;
  if (coverSource === "none") {
    if ("coverPublicUrl" in doc) {
      fail("invalid_cover_public_url", "coverPublicUrl");
    }
  } else if (coverSource !== null) {
    coverPublicUrl = normalizePublicDerivativeUrl(
      doc.coverPublicUrl,
      options.publicDerivativeBaseUrl ?? null,
    );
    if (coverPublicUrl === null) {
      fail("invalid_cover_public_url", "coverPublicUrl");
    }
  }

  if (reasons.size > 0) {
    return {
      ok: false,
      document: null,
      reasons: [...reasons].sort(),
      fields: [...fields].sort(),
    };
  }

  const document: JournalEntrySearchContractDocument = {
    id: id as string,
    title: title as string,
    body: body as string,
    publicSlug: publicSlug as string,
    publicPath: doc.publicPath as string,
    locationVisibility: locationVisibility as "region" | "hidden",
    ...(coarseRegionCode
      ? { coarseRegionCode: coarseRegionCode as never }
      : {}),
    noindex: doc.noindex as boolean,
    entryDate: doc.entryDate as string,
    entryScope: entryScope as "object" | "space",
    createdAt: doc.createdAt as string,
    kind: "journal_entry",
    coverSource: coverSource as JournalSearchCoverSource,
    ...(coverPublicUrl ? { coverPublicUrl } : {}),
  };

  return { ok: true, document, reasons: [], fields: [] };
}

/**
 * Deterministic canonical serialization of every allowed field.
 *
 * Absent optional fields serialize as `null` so "cover removed" and
 * "cover unchanged" cannot collide.
 */
export function canonicalJournalSearchDocumentPayload(
  document: JournalEntrySearchContractDocument,
): string {
  const record = document as unknown as Record<string, unknown>;
  const canonical: Array<[string, unknown]> = ALLOWED_JOURNAL_DOCUMENT_FIELDS.map(
    (field) => [field, record[field] ?? null],
  );
  return JSON.stringify(canonical);
}

export function hashJournalSearchDocumentValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

/**
 * Exact full-value fingerprint. Any change to any public field changes it, and
 * the digest itself discloses nothing about the content.
 */
export function fingerprintJournalSearchDocument(
  document: JournalEntrySearchContractDocument,
): string {
  return createHash("sha256")
    .update(canonicalJournalSearchDocumentPayload(document))
    .digest("hex");
}

/** Per-field digests, used to name which field drifted without leaking it. */
export function journalSearchDocumentFieldFingerprints(
  document: JournalEntrySearchContractDocument,
): Record<string, string> {
  const record = document as unknown as Record<string, unknown>;
  const fingerprints: Record<string, string> = {};
  for (const field of ALLOWED_JOURNAL_DOCUMENT_FIELDS) {
    fingerprints[field] = hashJournalSearchDocumentValue(record[field] ?? null);
  }
  return fingerprints;
}

/** Sorted field names whose values differ. Names only — safe for evidence. */
export function diffJournalSearchDocumentFields(
  expected: JournalEntrySearchContractDocument,
  observed: JournalEntrySearchContractDocument,
): string[] {
  const expectedFingerprints = journalSearchDocumentFieldFingerprints(expected);
  const observedFingerprints = journalSearchDocumentFieldFingerprints(observed);
  return ALLOWED_JOURNAL_DOCUMENT_FIELDS.filter(
    (field) => expectedFingerprints[field] !== observedFingerprints[field],
  ).sort();
}

/** Order-independent aggregate digest over a whole document set. */
export function corpusFingerprint(fingerprints: readonly string[]): string {
  const hash = createHash("sha256");
  for (const fingerprint of [...fingerprints].sort()) {
    hash.update(fingerprint);
    hash.update("\n");
  }
  return hash.digest("hex");
}

/**
 * A canonical timestamp is exactly what `Date#toISOString` and the Python
 * worker's `_iso_datetime` both emit. Anything else (date-only, offset form,
 * epoch number) is drift, because it means the value did not come from the
 * current writer.
 */
export function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
  );
}

/**
 * Public derivative URLs must be absolute, unsigned, quarantine-free, and —
 * when the base URL is known — served from the configured public origin and
 * path prefix.
 */
export function normalizePublicDerivativeUrl(
  value: unknown,
  publicDerivativeBaseUrl: string | null,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed !== value) return null;
  if (trimmed.length === 0) return null;
  if (/[?#]/.test(trimmed)) return null;
  if (/quarantine\//i.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;

  if (publicDerivativeBaseUrl) {
    let base: URL;
    try {
      base = new URL(
        publicDerivativeBaseUrl.endsWith("/")
          ? publicDerivativeBaseUrl
          : `${publicDerivativeBaseUrl}/`,
      );
    } catch {
      return null;
    }
    if (parsed.origin !== base.origin) return null;
    if (!parsed.pathname.startsWith(base.pathname)) return null;
    if (parsed.pathname.length <= base.pathname.length) return null;
  }

  return trimmed;
}
