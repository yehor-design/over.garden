export const EPHEMERAL_MEDIA_STAGING_PROTOCOL =
  "ove346.ephemeralMediaStaging.v1" as const;
export const EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS = 15 * 60;
/**
 * How long staged objects live without a touch (ADR-0022, D2; OVE-372). The
 * composer touches its session every `EPHEMERAL_MEDIA_TOUCH_INTERVAL_MS`
 * while it is mounted and holds media, so a gardener who writes for an hour
 * keeps every photo; a closed tab is cleaned up two hours after its last
 * touch.
 */
export const EPHEMERAL_MEDIA_LEASE_SECONDS = 2 * 60 * 60;
export const EPHEMERAL_MEDIA_TOUCH_INTERVAL_MS = 5 * 60 * 1_000;
/** Renew the session capability when less than this remains. */
export const EPHEMERAL_MEDIA_SESSION_RENEW_AHEAD_SECONDS = 3 * 60;
export const EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS = 24 * 60 * 60;
export const EPHEMERAL_MEDIA_MAX_BYTES = 32 * 1024 * 1024;
export const EPHEMERAL_MEDIA_MAX_DIMENSION = 16_384;
export const EPHEMERAL_MEDIA_MAX_PIXELS = 40_000_000;
/** Photos (primary objects) per staging session; variants do not count. */
export const EPHEMERAL_MEDIA_MAX_PER_SESSION = 10;
/**
 * The smaller renditions the browser encodes next to the 2560 primary
 * (ADR-0022, D2). `0` is the primary; a variant is named by its long edge.
 */
export const EPHEMERAL_MEDIA_VARIANT_LONG_EDGES = [1280, 480] as const;
/** Primary plus every variant: the most objects one photo can stage. */
export const EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO =
  1 + EPHEMERAL_MEDIA_VARIANT_LONG_EDGES.length;
/** A 16 px WebP data URI; anything larger is not a placeholder. */
export const EPHEMERAL_MEDIA_PLACEHOLDER_MAX_BYTES = 400;
export const EPHEMERAL_MEDIA_OWNER_MAX_ACTIVE_SESSIONS = 3;
export const EPHEMERAL_MEDIA_OWNER_UPLOADS_PER_MINUTE = 20;
export const EPHEMERAL_MEDIA_UPLOAD_DEADLINE_MS = 120_000;
export const EPHEMERAL_MEDIA_CONTROL_DEADLINE_MS = 5_000;
export const EPHEMERAL_MEDIA_CLAIM_DEADLINE_MS = 45_000;

export const EPHEMERAL_MEDIA_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://over-garden.vercel.app",
  "https://over.garden",
  "https://www.over.garden",
] as const;

export type EphemeralMediaCapabilityPurpose =
  | "upload"
  | "delete"
  | "claim"
  | "finalize";

/**
 * One capability per composer session (OVE-372): the browser uploads and
 * touches with it directly at the Worker, so adding a photo makes no call to
 * Vercel. `POST /api/media/staging/sessions` issues and renews it.
 */
export interface EphemeralMediaStagingSessionClaims {
  protocol: typeof EPHEMERAL_MEDIA_STAGING_PROTOCOL;
  kind: "staging_session";
  keyVersion: number;
  ownerSubjectHash: string;
  stagingSessionId: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
  nonce: string;
}

/** The sessions route's response; `expiresAt` is epoch seconds. */
export interface EphemeralMediaStagingSession {
  stagingSessionId: string;
  sessionCapability: string;
  expiresAt: number;
}

/** Request headers that describe an upload under a session capability. */
export const EPHEMERAL_MEDIA_UPLOAD_HEADERS = {
  sha256: "content-sha256",
  width: "x-media-width",
  height: "x-media-height",
} as const;
export type EphemeralMediaGenerationState =
  | "reserved"
  | "uploading"
  | "staged"
  | "claimed"
  | "finalized"
  | "deleting"
  | "deleted"
  | "expired";
export type EphemeralMediaSessionState =
  | "open"
  | "publishing"
  | "finalizing"
  | "abandoning"
  | "committed"
  | "abandoned";
export type EphemeralMediaCommitStatus =
  | "committed"
  | "absent"
  | "indeterminate";

export type EphemeralMediaVariant =
  | 0
  | (typeof EPHEMERAL_MEDIA_VARIANT_LONG_EDGES)[number];

export interface EphemeralMediaReservationRequest {
  stagingSessionId: string;
  mediaAssetId: string;
  generation: number;
  /**
   * `0` for the primary WebP; the long edge (1280, 480) for a variant.
   * Absent on the wire means the primary (reservations and receipts issued
   * before variants existed carry no field); `parseEphemeralMediaReservation`
   * always fills it in.
   */
  variant?: EphemeralMediaVariant;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface EphemeralMediaCapabilityClaims extends EphemeralMediaReservationRequest {
  protocol: typeof EPHEMERAL_MEDIA_STAGING_PROTOCOL;
  kind: "capability";
  keyVersion: number;
  purpose: EphemeralMediaCapabilityPurpose;
  ownerSubjectHash: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
  nonce: string;
}

export interface EphemeralMediaStagingReceiptClaims extends EphemeralMediaReservationRequest {
  protocol: typeof EPHEMERAL_MEDIA_STAGING_PROTOCOL;
  kind: "staging_receipt";
  keyVersion: number;
  ownerSubjectHash: string;
  stagedAtSeconds: number;
  leaseExpiresAtSeconds: number;
  receiptNonce: string;
}

export interface EphemeralMediaSessionCapabilityClaims {
  protocol: typeof EPHEMERAL_MEDIA_STAGING_PROTOCOL;
  kind: "session_capability";
  keyVersion: number;
  purpose: "claim" | "finalize";
  ownerSubjectHash: string;
  stagingSessionId: string;
  publishId: string;
  receiptSetDigest: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
  nonce: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
const BASE64URL_SHA256 = /^[A-Za-z0-9_-]{43}$/;
const RESERVATION_KEYS = new Set([
  "stagingSessionId",
  "mediaAssetId",
  "generation",
  "variant",
  "sha256",
  "sizeBytes",
  "width",
  "height",
]);

export function isEphemeralMediaVariant(
  value: unknown,
): value is EphemeralMediaVariant {
  return (
    value === 0 ||
    (EPHEMERAL_MEDIA_VARIANT_LONG_EDGES as readonly number[]).includes(
      value as number,
    )
  );
}

/** The R2 key a staged object is promoted to when its entry commits. */
export function ephemeralMediaPublicKey(input: {
  mediaAssetId: string;
  generation: number;
  variant: EphemeralMediaVariant;
}): string {
  return `derivatives/${input.mediaAssetId}/${input.generation}${input.variant ? `-${input.variant}` : ""}.webp`;
}

const PLACEHOLDER_DATA_URI = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/;

/** A tiny inline WebP the page paints before the real image loads. */
export function isEphemeralMediaPlaceholderDataUri(
  value: unknown,
): value is string {
  if (typeof value !== "string") return false;
  const match = PLACEHOLDER_DATA_URI.exec(value);
  if (!match || match[1].length % 4 !== 0) return false;
  const bytes = (match[1].length / 4) * 3 - (match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0);
  return bytes > 0 && bytes <= EPHEMERAL_MEDIA_PLACEHOLDER_MAX_BYTES;
}

export function parseEphemeralMediaReservation(
  value: unknown,
): EphemeralMediaReservationRequest | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !RESERVATION_KEYS.has(key))) return null;
  const result = {
    stagingSessionId: value.stagingSessionId,
    mediaAssetId: value.mediaAssetId,
    generation: value.generation,
    // Reservations written before variants existed carry no `variant`.
    variant: value.variant === undefined ? 0 : value.variant,
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
    width: value.width,
    height: value.height,
  };
  if (
    !isUuid(result.stagingSessionId) ||
    !isUuid(result.mediaAssetId) ||
    !isPositiveSafeInteger(result.generation) ||
    !isEphemeralMediaVariant(result.variant) ||
    !isCanonicalSha256(result.sha256) ||
    !isPositiveSafeInteger(result.sizeBytes) ||
    result.sizeBytes > EPHEMERAL_MEDIA_MAX_BYTES ||
    !isPositiveSafeInteger(result.width) ||
    !isPositiveSafeInteger(result.height) ||
    result.width > EPHEMERAL_MEDIA_MAX_DIMENSION ||
    result.height > EPHEMERAL_MEDIA_MAX_DIMENSION ||
    result.width * result.height > EPHEMERAL_MEDIA_MAX_PIXELS
  ) {
    return null;
  }
  return result as EphemeralMediaReservationRequest;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isCanonicalSha256(value: unknown): value is string {
  if (typeof value !== "string" || !BASE64_SHA256.test(value)) return false;
  try {
    return bytesToBase64(base64ToBytes(value)) === value;
  } catch {
    return false;
  }
}

export function isSubjectHash(value: unknown): value is string {
  return typeof value === "string" && BASE64URL_SHA256.test(value);
}

export function isBase64UrlSha256(value: unknown): value is string {
  return isSubjectHash(value);
}

export function isSafeNonce(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface EphemeralMediaUploadBinding {
  stagingSessionId: string;
  mediaAssetId: string;
  generation: number;
  /** Absent or `0` for the primary; the long edge for a variant. */
  variant?: EphemeralMediaVariant;
}

const CAPABILITY_TOKEN = /^[A-Za-z0-9_.-]{40,4096}$/;

export function isEphemeralMediaCapabilityToken(
  value: unknown,
): value is string {
  return typeof value === "string" && CAPABILITY_TOKEN.test(value);
}

export function ephemeralMediaUploadPath(
  binding: EphemeralMediaUploadBinding,
): string {
  const base = `/v1/staging/${binding.stagingSessionId}/${binding.mediaAssetId}/${binding.generation}`;
  return binding.variant ? `${base}/v${binding.variant}` : base;
}

/**
 * Reads the upload description a session-capability PUT carries in its
 * headers and path, or `null` when any part is missing or out of bounds. The
 * same parser the reservation route used, so the bounds did not move.
 */
export function parseEphemeralMediaUploadDescription(input: {
  binding: EphemeralMediaUploadBinding;
  headers: Pick<Headers, "get">;
  contentLength: number;
}): EphemeralMediaReservationRequest | null {
  const width = Number(input.headers.get(EPHEMERAL_MEDIA_UPLOAD_HEADERS.width));
  const height = Number(
    input.headers.get(EPHEMERAL_MEDIA_UPLOAD_HEADERS.height),
  );
  return parseEphemeralMediaReservation({
    stagingSessionId: input.binding.stagingSessionId,
    mediaAssetId: input.binding.mediaAssetId,
    generation: input.binding.generation,
    variant: input.binding.variant ?? 0,
    sha256: input.headers.get(EPHEMERAL_MEDIA_UPLOAD_HEADERS.sha256) ?? "",
    sizeBytes: input.contentLength,
    width,
    height,
  });
}

/** The session route's response, validated where the browser reads it. */
export function parseEphemeralMediaStagingSession(
  value: unknown,
  expectedStagingSessionId: string,
): EphemeralMediaStagingSession | null {
  if (!isRecord(value)) return null;
  if (
    value.stagingSessionId !== expectedStagingSessionId ||
    !isEphemeralMediaCapabilityToken(value.sessionCapability) ||
    !isPositiveSafeInteger(value.expiresAt)
  ) {
    return null;
  }
  return {
    stagingSessionId: expectedStagingSessionId,
    sessionCapability: value.sessionCapability,
    expiresAt: value.expiresAt,
  };
}
