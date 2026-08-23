export const EPHEMERAL_MEDIA_STAGING_PROTOCOL =
  "ove346.ephemeralMediaStaging.v1" as const;
export const EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS = 15 * 60;
export const EPHEMERAL_MEDIA_LEASE_SECONDS = 15 * 60;
export const EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS = 24 * 60 * 60;
export const EPHEMERAL_MEDIA_MAX_BYTES = 32 * 1024 * 1024;
export const EPHEMERAL_MEDIA_MAX_DIMENSION = 16_384;
export const EPHEMERAL_MEDIA_MAX_PIXELS = 40_000_000;
export const EPHEMERAL_MEDIA_MAX_PER_SESSION = 10;
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

export interface EphemeralMediaReservationRequest {
  stagingSessionId: string;
  mediaAssetId: string;
  generation: number;
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
  "sha256",
  "sizeBytes",
  "width",
  "height",
]);

export function parseEphemeralMediaReservation(
  value: unknown,
): EphemeralMediaReservationRequest | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !RESERVATION_KEYS.has(key))) return null;
  const result = {
    stagingSessionId: value.stagingSessionId,
    mediaAssetId: value.mediaAssetId,
    generation: value.generation,
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
    width: value.width,
    height: value.height,
  };
  if (
    !isUuid(result.stagingSessionId) ||
    !isUuid(result.mediaAssetId) ||
    !isPositiveSafeInteger(result.generation) ||
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
