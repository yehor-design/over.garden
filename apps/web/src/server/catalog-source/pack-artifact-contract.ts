import { createHash } from "node:crypto";

/**
 * OVE-327 — one validated pack artifact for every official source family.
 *
 * Before this contract each source-family importer encoded parent binding,
 * official name, alias, and rights in its own private shape, so no caller could
 * classify a row without knowing which importer produced it. This module is the
 * single normalized shape they all emit.
 *
 * It is deliberately pure: an adapter reads an already-approved source artifact
 * and returns a value. It performs no SQL, no catalog mutation, no search write,
 * and no provider call. Persisting a pack belongs to OVE-328.
 */
export const PACK_ARTIFACT_SCHEMA_VERSION = "ove327.packArtifact.v1" as const;

/** Finite parser bounds. A source artifact that exceeds one is refused, never truncated. */
export const PACK_ADAPTER_MAX_ROWS = 200_000;
export const PACK_ADAPTER_MAX_ALIASES_PER_ROW = 64;
export const PACK_ADAPTER_DEADLINE_MS = 60_000;

export const PACK_KINDS = ["plant_variety", "breed"] as const;
export type PackKind = (typeof PACK_KINDS)[number];

/**
 * Exactly one of these describes every row. `clean` is the only class a later
 * persistence owner may promote without a human decision.
 */
export const PACK_ROW_CLASSIFICATIONS = [
  "clean",
  "needs_parent",
  "collision",
  "duplicate",
  "rights_blocked",
  "review_needed",
] as const;
export type PackRowClassification = (typeof PACK_ROW_CLASSIFICATIONS)[number];

/**
 * How the parent species was established. An adapter proposes a parent and
 * records why; assigning or activating one belongs to the persistence owner.
 */
export const PACK_PARENT_EVIDENCE_CLASSES = [
  "declared_by_source",
  "derived_from_source_record",
  "absent",
] as const;
export type PackParentEvidenceClass =
  (typeof PACK_PARENT_EVIDENCE_CLASSES)[number];

/**
 * Name truth. Only `official_denomination` is canonical within its source,
 * parent, and locale. Everything else is an alias assertion and can never
 * become an independent canonical identity.
 */
export const PACK_NAME_CLASSES = [
  "official_denomination",
  "transliteration",
  "local_name",
  "trade_name",
  "generated",
  "user_added",
] as const;
export type PackNameClass = (typeof PACK_NAME_CLASSES)[number];

/** Closed refusal set. A refusal writes nothing and names one source family. */
export const PACK_ADAPTER_REFUSAL_CLASSES = [
  "unknown_source_family",
  "rights_rejected_source_family",
  "declared_version_missing",
  "artifact_unreadable",
  "parser_bound_exceeded",
  "parser_deadline_exceeded",
  "ambiguous_official_denomination",
  "forbidden_field_present",
] as const;
export type PackAdapterRefusalClass =
  (typeof PACK_ADAPTER_REFUSAL_CLASSES)[number];

/**
 * Source-use authority mirrored from
 * `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`. An adapter
 * may never override it. `pack-artifact-contract.test.ts` asserts this table
 * still matches the manifest, so a manifest change cannot drift silently.
 */
export const PACK_SOURCE_RIGHTS = {
  "ua-state-register": "use",
  "eu-oj-eur-lex-common-catalogue": "use",
  "vertebrate-breed-ontology": "use",
  "grin-global": "use",
  "eu-common-catalogue": "use_with_conditions",
  "iasas-bg-official-variety-list": "use_with_conditions",
  eurisco: "internal_validation_only",
  "genesys-pgr": "internal_validation_only",
  "dad-is-efabis": "internal_validation_only",
  "vendor-marketplace-paths": "reject",
} as const;

export type PackSourceRights =
  (typeof PACK_SOURCE_RIGHTS)[keyof typeof PACK_SOURCE_RIGHTS];

/**
 * A source declared in code but not listed in the manifest. It is not a
 * silent pass: it must still declare product projection in its own
 * `allowedUsage`, and the artifact records the class so a reviewer sees it.
 */
export const PACK_UNLISTED_SOURCE_RIGHTS = "declared_in_source" as const;

export interface PackParentCandidate {
  /** The proposed parent species scientific name, or null when none is known. */
  scientificName: string | null;
  evidenceClass: PackParentEvidenceClass;
}

export interface PackNameAssertion {
  displayName: string;
  normalizedName: string;
  locale: string;
  nameClass: PackNameClass;
}

export interface PackRow {
  sourceRecordKey: string;
  officialDenomination: string;
  normalizedDenomination: string;
  locale: string;
  publicSlug: string;
  parentCandidate: PackParentCandidate;
  aliases: PackNameAssertion[];
  classification: PackRowClassification;
}

export interface PackArtifact {
  schemaVersion: typeof PACK_ARTIFACT_SCHEMA_VERSION;
  adapterVersion: string;
  sourceSlug: string;
  sourceRights: PackSourceRights | typeof PACK_UNLISTED_SOURCE_RIGHTS;
  declaredSourceVersion: string;
  packKind: PackKind;
  /** SHA-256 of the source bytes the adapter read. */
  artifactByteDigest: string;
  /** Deterministic digest of identity plus every classified row. */
  artifactDigest: string;
  rows: PackRow[];
  counts: Record<PackRowClassification, number>;
}

export interface PackAdapterRefusal {
  schemaVersion: typeof PACK_ARTIFACT_SCHEMA_VERSION;
  status: "refused";
  refusalClass: PackAdapterRefusalClass;
  sourceSlug: string;
  /** A bounded group label, never a denomination or a source row payload. */
  rowGroup: string;
}

export type PackAdapterResult =
  | ({ status: "validated" } & PackArtifact)
  | PackAdapterRefusal;

export interface BuildPackArtifactInput {
  adapterVersion: string;
  sourceSlug: string;
  declaredSourceVersion: string;
  packKind: PackKind;
  artifactByteDigest: string;
  /** True when the source's own `allowedUsage` permits product projection. */
  allowsProductProjection: boolean;
  rows: readonly PackRowInput[];
}

export interface PackRowInput {
  sourceRecordKey: string;
  officialDenomination: string;
  normalizedDenomination: string;
  locale: string;
  publicSlug: string;
  parentCandidate: PackParentCandidate;
  aliases: readonly PackNameAssertion[];
  /**
   * A family-specific hold the adapter already knows about, such as an
   * unresolved conditional-rights row or a source-declared review flag. It
   * narrows the classification; it can never widen it to `clean`.
   */
  declaredHold?: Exclude<PackRowClassification, "clean" | "duplicate">;
}

/**
 * Builds one artifact, or refuses.
 *
 * Classification is deterministic and total: identical inputs always produce
 * the same class vector and the same digest.
 */
export function buildPackArtifact(
  input: BuildPackArtifactInput,
): PackAdapterResult {
  const rights = resolvePackSourceRights(
    input.sourceSlug,
    input.allowsProductProjection,
  );
  if (rights === "reject") {
    return refusal(
      "rights_rejected_source_family",
      input.sourceSlug,
      "source_family",
    );
  }
  if (rights === null) {
    return refusal("unknown_source_family", input.sourceSlug, "source_family");
  }
  if (!isSha256(input.artifactByteDigest)) {
    return refusal("artifact_unreadable", input.sourceSlug, "artifact_bytes");
  }
  if (!input.declaredSourceVersion.trim()) {
    return refusal(
      "declared_version_missing",
      input.sourceSlug,
      "source_version",
    );
  }
  if (input.rows.length > PACK_ADAPTER_MAX_ROWS) {
    return refusal("parser_bound_exceeded", input.sourceSlug, "row_count");
  }

  const seenRecordKeys = new Set<string>();
  const seenDenominations = new Set<string>();
  const rows: PackRow[] = [];

  for (const row of input.rows) {
    if (row.aliases.length > PACK_ADAPTER_MAX_ALIASES_PER_ROW) {
      return refusal("parser_bound_exceeded", input.sourceSlug, "alias_count");
    }
    if (
      !row.officialDenomination.trim() ||
      !row.normalizedDenomination.trim()
    ) {
      return refusal(
        "ambiguous_official_denomination",
        input.sourceSlug,
        "denomination",
      );
    }
    if (
      row.aliases.some((alias) => alias.nameClass === "official_denomination")
    ) {
      // Exactly one official denomination per row; an alias claiming that class
      // would make two names canonical for one concept.
      return refusal(
        "ambiguous_official_denomination",
        input.sourceSlug,
        "alias_name_class",
      );
    }
    if (containsForbiddenPackField(row)) {
      return refusal("forbidden_field_present", input.sourceSlug, "row_fields");
    }

    const duplicateRecord = seenRecordKeys.has(row.sourceRecordKey);
    const collidingDenomination = seenDenominations.has(
      denominationKey(
        row.parentCandidate,
        row.locale,
        row.normalizedDenomination,
      ),
    );
    seenRecordKeys.add(row.sourceRecordKey);
    seenDenominations.add(
      denominationKey(
        row.parentCandidate,
        row.locale,
        row.normalizedDenomination,
      ),
    );

    rows.push({
      sourceRecordKey: row.sourceRecordKey,
      officialDenomination: row.officialDenomination,
      normalizedDenomination: row.normalizedDenomination,
      locale: row.locale,
      publicSlug: row.publicSlug,
      parentCandidate: row.parentCandidate,
      aliases: [...row.aliases],
      classification: classifyPackRow({
        rights,
        declaredHold: row.declaredHold,
        parentCandidate: row.parentCandidate,
        duplicateRecord,
        collidingDenomination,
      }),
    });
  }

  const counts = emptyCounts();
  for (const row of rows) counts[row.classification] += 1;

  const identity = {
    schemaVersion: PACK_ARTIFACT_SCHEMA_VERSION,
    adapterVersion: input.adapterVersion,
    sourceSlug: input.sourceSlug,
    declaredSourceVersion: input.declaredSourceVersion,
    packKind: input.packKind,
    artifactByteDigest: input.artifactByteDigest,
  };

  return {
    status: "validated",
    ...identity,
    sourceRights: rights,
    rows,
    counts,
    artifactDigest: packDigest({ identity, rows }),
  };
}

/**
 * The single classification rule. Rights and a missing parent dominate: a row a
 * source family may not project, or one with no parent species, is never
 * `clean` no matter how well formed it is.
 */
export function classifyPackRow(input: {
  rights: PackSourceRights | typeof PACK_UNLISTED_SOURCE_RIGHTS;
  declaredHold?: PackRowClassification;
  parentCandidate: PackParentCandidate;
  duplicateRecord: boolean;
  collidingDenomination: boolean;
}): PackRowClassification {
  if (input.rights === "internal_validation_only") return "rights_blocked";
  if (input.declaredHold === "rights_blocked") return "rights_blocked";
  if (input.duplicateRecord) return "duplicate";
  if (
    input.parentCandidate.evidenceClass === "absent" ||
    !input.parentCandidate.scientificName
  ) {
    return "needs_parent";
  }
  if (input.collidingDenomination) return "collision";
  if (input.declaredHold) return input.declaredHold;
  if (input.rights === "use_with_conditions") return "review_needed";
  return "clean";
}

export function resolvePackSourceRights(
  sourceSlug: string,
  allowsProductProjection: boolean,
): PackSourceRights | typeof PACK_UNLISTED_SOURCE_RIGHTS | null {
  const listed = (PACK_SOURCE_RIGHTS as Record<string, PackSourceRights>)[
    sourceSlug
  ];
  if (listed) return listed;
  // Not in the manifest. It may still be a legitimate official source declared
  // in code, but only if that declaration itself permits product projection.
  return allowsProductProjection ? PACK_UNLISTED_SOURCE_RIGHTS : null;
}

export function isPackRowClassification(
  value: unknown,
): value is PackRowClassification {
  return PACK_ROW_CLASSIFICATIONS.includes(value as PackRowClassification);
}

export function isPackArtifact(value: unknown): value is PackArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PackArtifact>;
  return (
    candidate.schemaVersion === PACK_ARTIFACT_SCHEMA_VERSION &&
    typeof candidate.adapterVersion === "string" &&
    typeof candidate.sourceSlug === "string" &&
    typeof candidate.declaredSourceVersion === "string" &&
    PACK_KINDS.includes(candidate.packKind as PackKind) &&
    isSha256(candidate.artifactByteDigest ?? "") &&
    isSha256(candidate.artifactDigest ?? "") &&
    Array.isArray(candidate.rows) &&
    candidate.rows.every(
      (row) =>
        isPackRowClassification(row.classification) &&
        PACK_PARENT_EVIDENCE_CLASSES.includes(
          row.parentCandidate.evidenceClass,
        ) &&
        row.aliases.every((alias) =>
          PACK_NAME_CLASSES.includes(alias.nameClass),
        ),
    )
  );
}

/**
 * Precise location and raw payload fields must never enter an artifact. This is
 * a defensive shape check at the contract boundary; the canonical TypeScript
 * free text is not scanned for coordinates (ADR-0022, D1).
 */
const FORBIDDEN_PACK_FIELD_PATTERN =
  /^(latitude|longitude|lat|lon|lng|coordinates?|geo|rawPayload|raw_payload|sourceOnly|source_only)$/iu;

function containsForbiddenPackField(row: PackRowInput) {
  return Object.keys(row).some((key) => FORBIDDEN_PACK_FIELD_PATTERN.test(key));
}

function denominationKey(
  parent: PackParentCandidate,
  locale: string,
  normalizedDenomination: string,
) {
  return [parent.scientificName ?? "", locale, normalizedDenomination].join(" ");
}

function emptyCounts(): Record<PackRowClassification, number> {
  return {
    clean: 0,
    needs_parent: 0,
    collision: 0,
    duplicate: 0,
    rights_blocked: 0,
    review_needed: 0,
  };
}

function refusal(
  refusalClass: PackAdapterRefusalClass,
  sourceSlug: string,
  rowGroup: string,
): PackAdapterRefusal {
  return {
    schemaVersion: PACK_ARTIFACT_SCHEMA_VERSION,
    status: "refused",
    refusalClass,
    sourceSlug,
    rowGroup,
  };
}

/**
 * Reads one nested string from an already-approved source payload.
 *
 * Adapters need a few declared source fields (a botanical taxon, a species
 * name) to propose a parent. This reader is deliberately narrow: it returns a
 * trimmed string or null and never surfaces the payload itself, so a raw record
 * cannot leak into an artifact through a wide structural copy.
 */
export function readPackSourceString(
  payload: unknown,
  ...path: readonly string[]
): string | null {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return null;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (typeof cursor !== "string") return null;
  const trimmed = cursor.trim();
  if (!trimmed || trimmed === "NULL") return null;
  return trimmed;
}

export function packDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function isSha256(value: string) {
  return /^[a-f0-9]{64}$/u.test(value);
}
