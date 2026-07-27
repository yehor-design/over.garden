/**
 * OVE-234 — authoritative precise-location text policy.
 *
 * AGENTS.md hard rule 1 forbids collecting, storing, sending, logging,
 * indexing, rendering, or inferring precise coordinates for OverGarden users.
 * This module owns the single server-side definition of "precise location
 * text" so every write, query, projection, queue, notification, and log
 * boundary applies the same detector instead of re-deriving a local regex.
 *
 * The detector is deliberately isomorphic (no `server-only`) so the composer
 * can warn early, but client checks stay advisory: the enforcement boundary is
 * always the server call that persists or projects the value.
 *
 * The mirror implementation for the Python worker lives in
 * `services/matching/app/precise_location.py`; both are pinned to the shared
 * corpus in `contracts/privacy/precise-location-text-corpus.json`.
 */

export const PRECISE_LOCATION_POLICY_VERSION = "ove234.precise-location.v1";

/**
 * Minimum fractional digits an unlabeled decimal pair needs before it counts
 * as precise. Three fractional degrees digits is ~110 m, which is already a
 * targeting-grade location; benign pairs (prices, dimensions, quantities)
 * effectively never carry that precision on both numbers at once.
 */
export const UNLABELED_PAIR_MIN_FRACTION_DIGITS = 3;
/** Labeled/hemisphere-marked values declare intent, so two digits suffice. */
export const LABELED_MIN_FRACTION_DIGITS = 2;

export type PreciseLocationTextKind =
  | "geo_uri"
  | "map_url_coordinates"
  | "degrees_minutes_seconds"
  | "hemisphere_decimal"
  | "labeled_decimal"
  | "decimal_pair"
  | "plus_code";

/**
 * A finding never carries the offending text. Callers may log, count, and
 * classify it; nothing here can leak a coordinate into logs or evidence.
 */
export interface PreciseLocationTextFinding {
  readonly kind: PreciseLocationTextKind;
  readonly policyVersion: typeof PRECISE_LOCATION_POLICY_VERSION;
}

export type PreciseLocationTextSurface =
  | "journal_title"
  | "journal_body"
  | "journal_document"
  | "journal_media_text"
  | "comment"
  | "profile_bio"
  | "profile_display_name"
  | "lineage_source_label"
  | "lineage_question"
  | "interview_note"
  | "community_search"
  | "public_search_document"
  | "notification"
  | "queue_payload";

const MAX_SCAN_CHARS = 200_000;

const IGNORABLE_PATTERN =
  /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const MINUS_PATTERN = /[‐-―−˗－]/g;
const DEGREE_PATTERN = /[°º˚̊∘ᵒ]/g;
const PRIME_PATTERN = /[′‵ʹʼ´‘’‛＇]/g;
const DOUBLE_PRIME_PATTERN =
  /[″‶ʺ˝“”„＂]/g;
const COMMA_PATTERN = /[，、،]/g;
const DOT_PATTERN = /[．。]/g;
const WHITESPACE_PATTERN = /\s+/g;

/** Latin plus Cyrillic hemisphere markers used in uk/bg/ru copy-paste. */
const NORTH_SOUTH = "NSnsСЮсю";
const EAST_WEST = "EWewВЗвз";
const HEMISPHERE_CLASS = `[${NORTH_SOUTH}${EAST_WEST}]`;
const HEMISPHERE_WORD = "(?:Пн|Пд|Сх|Зх|пн|пд|сх|зх)";
const HEMISPHERE = `(?:${HEMISPHERE_WORD}|${HEMISPHERE_CLASS})`;

/**
 * Coordinate labels only. Words that are ordinary vocabulary in uk/bg/ru
 * ("ширина", "дължина" — width/length) are intentionally excluded: keyword
 * matching alone is not a detection strategy here, it only lowers the
 * precision threshold for an adjacent number.
 */
const COORDINATE_LABEL_PATTERN =
  /(?:\blat(?:itude)?\b|\blong(?:itude)?\b|\blon\b|\blng\b|\bgps\b|\bgeo(?:location|position)?\b|\bcoord(?:inate)?s?\b|координат|широт|довгот|долгот|геолокац|геопозиц)/giu;

const GEO_URI_PATTERN =
  /geo:\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)/gi;

const URL_TOKEN_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Full Open Location Code (8 chars, separator, 2-3 chars). */
const PLUS_CODE_PATTERN =
  /(?<![0-9A-Z+])[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}(?![0-9A-Z+])/gi;

const DMS_PATTERN = new RegExp(
  `(${HEMISPHERE})?\\s*(\\d{1,3})\\s*°\\s*(\\d{1,2})\\s*'\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*"\\s*)?(${HEMISPHERE})?`,
  "gu",
);

const HEMISPHERE_DECIMAL_PATTERN = new RegExp(
  `(?:(?<![\\p{L}\\p{N}])(${HEMISPHERE})\\s*([-+]?\\d{1,3}\\.\\d+)\\s*°?|([-+]?\\d{1,3}\\.\\d+)\\s*°?\\s*(${HEMISPHERE}))(?![\\p{L}\\p{N}])`,
  "gu",
);

const LABELED_NUMBER_PATTERN =
  /(?<![\d.,\-+/:])[-+]?\d{1,3}[.,]\d+(?![\d.,])/g;

const DECIMAL_PAIR_PATTERN =
  /(?<![\d.,\-+/:°'"])([-+]?\d{1,3}\.\d+)\s*[,;/]\s*([-+]?\d{1,3}\.\d+)(?![\d.,])/g;

/** European decimal comma written as `50,45010 30,52340`. */
const COMMA_DECIMAL_PAIR_PATTERN =
  /(?<![\d.,\-+/:°'"])([-+]?\d{1,3},\d+)\s*[; ]\s*([-+]?\d{1,3},\d+)(?![\d.,])/g;

function finding(kind: PreciseLocationTextKind): PreciseLocationTextFinding {
  return { kind, policyVersion: PRECISE_LOCATION_POLICY_VERSION };
}

/**
 * Unicode-normalizes a candidate so homoglyph and full-width copy-paste
 * variants collapse onto the ASCII forms the detectors below understand.
 */
export function normalizePreciseLocationScanText(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const bounded =
    value.length > MAX_SCAN_CHARS ? value.slice(0, MAX_SCAN_CHARS) : value;

  // Glyph folding runs before NFKC because NFKC itself decomposes some
  // coordinate punctuation into look-alike ASCII (`º`->`o`, `″`->`''`).
  return foldCoordinateGlyphs(foldCoordinateGlyphs(bounded).normalize("NFKC"))
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function foldCoordinateGlyphs(value: string): string {
  return value
    .replace(IGNORABLE_PATTERN, "")
    .replace(MINUS_PATTERN, "-")
    .replace(DEGREE_PATTERN, "°")
    .replace(DOUBLE_PRIME_PATTERN, '"')
    .replace(PRIME_PATTERN, "'")
    .replace(COMMA_PATTERN, ",")
    .replace(DOT_PATTERN, ".");
}

function fractionDigits(value: string): number {
  const match = /[.,](\d+)/.exec(value);
  return match ? match[1].length : 0;
}

function numericValue(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

function isLatitude(value: string): boolean {
  const parsed = Math.abs(numericValue(value));
  return Number.isFinite(parsed) && parsed <= 90;
}

function isLongitude(value: string): boolean {
  const parsed = Math.abs(numericValue(value));
  return Number.isFinite(parsed) && parsed <= 180;
}

function isCoordinatePair(first: string, second: string): boolean {
  return (
    (isLatitude(first) && isLongitude(second)) ||
    (isLongitude(first) && isLatitude(second))
  );
}

function hemisphereAxis(marker: string | undefined): "ns" | "ew" | null {
  if (!marker) return null;
  if (/^[Пп][нд]$/u.test(marker)) return "ns";
  if (/^[СсЗз]х$/u.test(marker)) return "ew";
  const head = marker[0];
  if (NORTH_SOUTH.includes(head)) return "ns";
  if (EAST_WEST.includes(head)) return "ew";
  return null;
}

function matchAll(pattern: RegExp, value: string): RegExpExecArray[] {
  pattern.lastIndex = 0;
  const matches: RegExpExecArray[] = [];
  let match = pattern.exec(value);
  while (match) {
    matches.push(match);
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    match = pattern.exec(value);
  }
  return matches;
}

function findGeoUri(value: string): PreciseLocationTextFinding | null {
  for (const match of matchAll(GEO_URI_PATTERN, value)) {
    if (isCoordinatePair(match[1], match[2])) return finding("geo_uri");
  }
  return null;
}

function findMapUrlCoordinates(
  value: string,
): PreciseLocationTextFinding | null {
  for (const match of matchAll(URL_TOKEN_PATTERN, value)) {
    const url = match[0];
    const numbers = url.match(/[-+]?\d{1,3}\.\d{2,}/g) ?? [];
    for (let index = 0; index + 1 < numbers.length; index += 1) {
      if (isCoordinatePair(numbers[index], numbers[index + 1])) {
        return finding("map_url_coordinates");
      }
    }
  }
  return null;
}

function findDegreesMinutesSeconds(
  value: string,
): PreciseLocationTextFinding | null {
  const matches = matchAll(DMS_PATTERN, value).filter((match) => {
    const degrees = Number.parseInt(match[2], 10);
    const minutes = Number.parseInt(match[3], 10);
    const seconds = match[4] ? numericValue(match[4]) : 0;
    return degrees <= 180 && minutes < 60 && seconds < 60;
  });

  if (matches.length >= 2) return finding("degrees_minutes_seconds");
  if (matches.length === 1 && (matches[0][1] || matches[0][5])) {
    return finding("degrees_minutes_seconds");
  }
  return null;
}

function findHemisphereDecimal(
  value: string,
  labeled: boolean,
): PreciseLocationTextFinding | null {
  const axes = new Set<"ns" | "ew">();
  for (const match of matchAll(HEMISPHERE_DECIMAL_PATTERN, value)) {
    const marker = match[1] ?? match[4];
    const number = match[2] ?? match[3];
    if (fractionDigits(number) < LABELED_MIN_FRACTION_DIGITS) continue;
    const axis = hemisphereAxis(marker);
    if (!axis) continue;
    if (axis === "ns" && !isLatitude(number)) continue;
    if (axis === "ew" && !isLongitude(number)) continue;
    axes.add(axis);
  }

  // A single hemisphere-marked number is ambiguous with units (W, N, В).
  // Require both axes, or an explicit coordinate label in the same value.
  if (axes.size >= 2 || (axes.size === 1 && labeled)) {
    return finding("hemisphere_decimal");
  }
  return null;
}

function findLabeledDecimal(
  value: string,
): PreciseLocationTextFinding | null {
  for (const label of matchAll(COORDINATE_LABEL_PATTERN, value)) {
    const window = value.slice(
      label.index + label[0].length,
      label.index + label[0].length + 32,
    );
    for (const number of matchAll(LABELED_NUMBER_PATTERN, window)) {
      if (fractionDigits(number[0]) < LABELED_MIN_FRACTION_DIGITS) continue;
      if (!isLongitude(number[0])) continue;
      return finding("labeled_decimal");
    }
  }
  return null;
}

function findDecimalPair(
  value: string,
  labeled: boolean,
): PreciseLocationTextFinding | null {
  const threshold = labeled
    ? LABELED_MIN_FRACTION_DIGITS
    : UNLABELED_PAIR_MIN_FRACTION_DIGITS;

  for (const pattern of [DECIMAL_PAIR_PATTERN, COMMA_DECIMAL_PAIR_PATTERN]) {
    for (const match of matchAll(pattern, value)) {
      if (fractionDigits(match[1]) < threshold) continue;
      if (fractionDigits(match[2]) < threshold) continue;
      if (!isCoordinatePair(match[1], match[2])) continue;
      return finding("decimal_pair");
    }
  }
  return null;
}

function findPlusCode(value: string): PreciseLocationTextFinding | null {
  return matchAll(PLUS_CODE_PATTERN, value).length > 0
    ? finding("plus_code")
    : null;
}

/**
 * Returns the first precise-location classification for one text value, or
 * `null` when the value is safe. The finding never contains the input.
 */
export function findPreciseLocationText(
  value: unknown,
): PreciseLocationTextFinding | null {
  const normalized = normalizePreciseLocationScanText(value);
  if (!normalized) return null;

  COORDINATE_LABEL_PATTERN.lastIndex = 0;
  const labeled = COORDINATE_LABEL_PATTERN.test(normalized);

  return (
    findGeoUri(normalized) ??
    findMapUrlCoordinates(normalized) ??
    findDegreesMinutesSeconds(normalized) ??
    findHemisphereDecimal(normalized, labeled) ??
    findPlusCode(normalized) ??
    findLabeledDecimal(normalized) ??
    findDecimalPair(normalized, labeled)
  );
}

export function containsPreciseLocationText(value: unknown): boolean {
  return findPreciseLocationText(value) !== null;
}

/** First finding across many values, e.g. every textual block of a document. */
export function findPreciseLocationTextInValues(
  values: Iterable<unknown>,
): PreciseLocationTextFinding | null {
  for (const value of values) {
    const found = findPreciseLocationText(value);
    if (found) return found;
  }
  return null;
}

export class PreciseLocationTextError extends Error {
  readonly code = "precise_location_text" as const;
  readonly surface: PreciseLocationTextSurface;
  readonly kind: PreciseLocationTextKind;
  readonly policyVersion = PRECISE_LOCATION_POLICY_VERSION;

  constructor(
    surface: PreciseLocationTextSurface,
    found: PreciseLocationTextFinding,
  ) {
    // The message is a stable classification only; it never echoes the value.
    super(
      `Precise location text is not allowed (surface=${surface}, kind=${found.kind}, policy=${PRECISE_LOCATION_POLICY_VERSION}).`,
    );
    this.name = "PreciseLocationTextError";
    this.surface = surface;
    this.kind = found.kind;
  }
}

export function isPreciseLocationTextError(
  error: unknown,
): error is PreciseLocationTextError {
  return (
    error instanceof PreciseLocationTextError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "precise_location_text")
  );
}

/**
 * Fail-closed guard for one value at a write/query/projection boundary.
 */
export function assertNoPreciseLocationText(
  value: unknown,
  surface: PreciseLocationTextSurface,
): void {
  const found = findPreciseLocationText(value);
  if (found) throw new PreciseLocationTextError(surface, found);
}

/**
 * Public search queries arrive in a GET URL, so throwing would turn a crafted
 * link into an error page while still routing the value through logs. Instead
 * the term is dropped entirely: nothing coordinate-bearing is searched,
 * reflected back into the page, or written to a query log.
 */
export function sanitizePreciseLocationSearchQuery(value: string | null): {
  query: string;
  rejected: boolean;
  finding: PreciseLocationTextFinding | null;
} {
  const query = (value ?? "").trim();
  if (!query) return { query: "", rejected: false, finding: null };

  const found = findPreciseLocationText(query);
  if (found) return { query: "", rejected: true, finding: found };
  return { query, rejected: false, finding: null };
}

/** Fail-closed guard for many values sharing one surface classification. */
export function assertNoPreciseLocationTextInValues(
  values: Iterable<unknown>,
  surface: PreciseLocationTextSurface,
): void {
  const found = findPreciseLocationTextInValues(values);
  if (found) throw new PreciseLocationTextError(surface, found);
}
