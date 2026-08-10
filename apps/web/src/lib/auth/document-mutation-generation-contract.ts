import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectVersionedAuthSecret,
} from "@/lib/auth-secret";

export const DOCUMENT_MUTATION_GENERATION_PROTOCOL =
  "overgarden.document-mutation-generation.v1" as const;
export const DOCUMENT_MUTATION_GENERATION_MAX_AGE_SECONDS = 43_200;
export const DOCUMENT_MUTATION_GENERATION_CLOCK_SKEW_SECONDS = 60;
export const DOCUMENT_MUTATION_GENERATION_MAX_SERIALIZED_BYTES = 1_024;

const OWNER_GENERATION_DOMAIN = "overgarden.document-owner-generation.v1\0";
const SESSION_GENERATION_DOMAIN = "overgarden.document-session-generation.v1\0";
const ENVELOPE_MAC_DOMAIN = "overgarden.document-mutation-generation-mac.v1\0";
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const HASH_BYTES = 32;
const NONCE_BYTES = 16;
const MAX_SESSION_ID_BYTES = 256;

export interface DocumentMutationGenerationV1 {
  protocol: typeof DOCUMENT_MUTATION_GENERATION_PROTOCOL;
  secretVersion: number;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
  ownerGeneration: string;
  sessionGeneration: string;
  documentNonce: string;
  mac: string;
}

export type DocumentMutationGenerationClassification =
  | "MATCH"
  | "OWNER_TRANSITION_CONFIRMED"
  | "SAME_OWNER_SESSION_REFRESH_REQUIRED"
  | "INVALID_OR_TAMPERED"
  | "MUTATION_ADMISSION_UNAVAILABLE";

export interface IssueDocumentMutationGenerationInput {
  ownerUserId: string;
  sessionId: string;
  issuedAtSeconds: number;
  expiresAtSeconds?: number;
  documentNonce?: Uint8Array;
  authSecrets?: AuthSecretConfiguration;
}

export interface IssuedDocumentMutationGeneration {
  envelope: DocumentMutationGenerationV1;
  unsignedPayload: Buffer;
  transport: string;
}

export interface ClassifyDocumentMutationGenerationInput {
  transport: string;
  ownerUserId: string;
  sessionId: string;
  nowSeconds: number;
  authSecrets?: AuthSecretConfiguration;
}

export function issueDocumentMutationGeneration(
  input: IssueDocumentMutationGenerationInput,
): IssuedDocumentMutationGeneration {
  const ownerUserId = normalizeOwnerUuid(input.ownerUserId);
  const sessionId = requireBoundedSessionId(input.sessionId);
  const issuedAtSeconds = requireNonNegativeSafeInteger(
    input.issuedAtSeconds,
    "issued-at time",
  );
  const expiresAtSeconds = requireNonNegativeSafeInteger(
    input.expiresAtSeconds ??
      issuedAtSeconds + DOCUMENT_MUTATION_GENERATION_MAX_AGE_SECONDS,
    "expiry time",
  );
  requireBoundedLifetime(issuedAtSeconds, expiresAtSeconds);
  const nonce = input.documentNonce
    ? Buffer.from(input.documentNonce)
    : randomBytes(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) {
    throw new TypeError("A 16-byte document nonce is required.");
  }

  const configuration = input.authSecrets ?? resolveAuthSecretConfiguration();
  const selected = configuration.active;
  const secret = requireSelectedSecret(selected.value);
  const ownerGeneration = deriveOwnerGeneration(secret, ownerUserId);
  const sessionGeneration = deriveSessionGeneration(
    secret,
    ownerUserId,
    sessionId,
  );
  const partial = {
    protocol: DOCUMENT_MUTATION_GENERATION_PROTOCOL,
    secretVersion: requireNonNegativeSafeInteger(
      selected.version,
      "secret version",
    ),
    issuedAtSeconds,
    expiresAtSeconds,
    ownerGeneration,
    sessionGeneration,
    documentNonce: nonce.toString("base64url"),
  };
  const unsignedPayload = createUnsignedPayload(partial);
  const envelope: DocumentMutationGenerationV1 = Object.freeze({
    ...partial,
    mac: createEnvelopeMac(secret, unsignedPayload),
  });
  const transport = serializeDocumentMutationGeneration(envelope);

  return { envelope, unsignedPayload, transport };
}

export function parseDocumentMutationGeneration(
  transport: unknown,
): DocumentMutationGenerationV1 | null {
  if (
    typeof transport !== "string" ||
    transport.length === 0 ||
    transport.length > DOCUMENT_MUTATION_GENERATION_MAX_SERIALIZED_BYTES ||
    !BASE64URL.test(transport)
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(transport, "base64url");
    if (
      decoded.toString("base64url") !== transport ||
      decoded.length === 0 ||
      decoded.length > DOCUMENT_MUTATION_GENERATION_MAX_SERIALIZED_BYTES ||
      decoded.some((byte) => byte > 0x7f)
    ) {
      return null;
    }

    const decodedText = decoded.toString("ascii");
    const tuple = JSON.parse(decodedText) as unknown;
    if (!Array.isArray(tuple) || tuple.length !== 8) return null;
    const [
      protocol,
      secretVersion,
      issuedAtSeconds,
      expiresAtSeconds,
      ownerGeneration,
      sessionGeneration,
      documentNonce,
      mac,
    ] = tuple;
    if (
      protocol !== DOCUMENT_MUTATION_GENERATION_PROTOCOL ||
      !isNonNegativeSafeInteger(secretVersion) ||
      !isNonNegativeSafeInteger(issuedAtSeconds) ||
      !isNonNegativeSafeInteger(expiresAtSeconds) ||
      !isCanonicalBase64UrlBytes(ownerGeneration, HASH_BYTES) ||
      !isCanonicalBase64UrlBytes(sessionGeneration, HASH_BYTES) ||
      !isCanonicalBase64UrlBytes(documentNonce, NONCE_BYTES) ||
      !isCanonicalBase64UrlBytes(mac, HASH_BYTES)
    ) {
      return null;
    }

    const envelope: DocumentMutationGenerationV1 = {
      protocol,
      secretVersion,
      issuedAtSeconds,
      expiresAtSeconds,
      ownerGeneration,
      sessionGeneration,
      documentNonce,
      mac,
    };
    if (serializeTuple(envelope) !== decodedText) return null;
    return Object.freeze(envelope);
  } catch {
    return null;
  }
}

export function serializeDocumentMutationGeneration(
  envelope: DocumentMutationGenerationV1,
): string {
  const encoded = Buffer.from(serializeTuple(envelope), "ascii").toString(
    "base64url",
  );
  if (encoded.length > DOCUMENT_MUTATION_GENERATION_MAX_SERIALIZED_BYTES) {
    throw new TypeError("Document mutation generation is too large.");
  }
  return encoded;
}

export function classifyDocumentMutationGeneration(
  input: ClassifyDocumentMutationGenerationInput,
): DocumentMutationGenerationClassification {
  const envelope = parseDocumentMutationGeneration(input.transport);
  if (!envelope || !isEnvelopeTimeValid(envelope, input.nowSeconds)) {
    return "INVALID_OR_TAMPERED";
  }

  let ownerUserId: string;
  let sessionId: string;
  let configuration: AuthSecretConfiguration;
  try {
    ownerUserId = normalizeOwnerUuid(input.ownerUserId);
    sessionId = requireBoundedSessionId(input.sessionId);
    configuration = input.authSecrets ?? resolveAuthSecretConfiguration();
  } catch {
    return "MUTATION_ADMISSION_UNAVAILABLE";
  }

  const selected = selectVersionedAuthSecret(
    envelope.secretVersion,
    configuration,
  );
  if (!selected) return "INVALID_OR_TAMPERED";

  let secret: string;
  try {
    secret = requireSelectedSecret(selected.value);
  } catch {
    return "MUTATION_ADMISSION_UNAVAILABLE";
  }

  const unsignedPayload = createUnsignedPayload(envelope);
  const expectedMac = createEnvelopeMac(secret, unsignedPayload);
  if (!safeBase64UrlDigestEqual(envelope.mac, expectedMac)) {
    return "INVALID_OR_TAMPERED";
  }

  const currentOwnerGeneration = deriveOwnerGeneration(secret, ownerUserId);
  if (
    !safeBase64UrlDigestEqual(envelope.ownerGeneration, currentOwnerGeneration)
  ) {
    return "OWNER_TRANSITION_CONFIRMED";
  }

  const currentSessionGeneration = deriveSessionGeneration(
    secret,
    ownerUserId,
    sessionId,
  );
  if (
    !safeBase64UrlDigestEqual(
      envelope.sessionGeneration,
      currentSessionGeneration,
    )
  ) {
    return "SAME_OWNER_SESSION_REFRESH_REQUIRED";
  }
  return "MATCH";
}

export function getDocumentMutationGenerationRemainingSeconds(
  transport: string,
  nowSeconds: number,
): number | null {
  const envelope = parseDocumentMutationGeneration(transport);
  if (!envelope || !isEnvelopeTimeValid(envelope, nowSeconds)) return null;
  return Math.floor(envelope.expiresAtSeconds - nowSeconds);
}

function deriveOwnerGeneration(secret: string, ownerUserId: string): string {
  return createHmac("sha256", secret)
    .update(OWNER_GENERATION_DOMAIN, "utf8")
    .update(ownerUserId, "utf8")
    .digest("base64url");
}

function deriveSessionGeneration(
  secret: string,
  ownerUserId: string,
  sessionId: string,
): string {
  return createHmac("sha256", secret)
    .update(SESSION_GENERATION_DOMAIN, "utf8")
    .update(ownerUserId, "utf8")
    .update("\0", "utf8")
    .update(sessionId, "utf8")
    .digest("base64url");
}

function createEnvelopeMac(secret: string, unsignedPayload: Buffer): string {
  return createHmac("sha256", secret)
    .update(ENVELOPE_MAC_DOMAIN, "utf8")
    .update(unsignedPayload)
    .digest("base64url");
}

function createUnsignedPayload(
  envelope: Omit<DocumentMutationGenerationV1, "mac">,
): Buffer {
  return Buffer.from(
    [
      envelope.protocol,
      String(envelope.secretVersion),
      String(envelope.issuedAtSeconds),
      String(envelope.expiresAtSeconds),
      envelope.ownerGeneration,
      envelope.sessionGeneration,
      envelope.documentNonce,
    ].join("\n"),
    "utf8",
  );
}

function serializeTuple(envelope: DocumentMutationGenerationV1): string {
  return JSON.stringify([
    envelope.protocol,
    envelope.secretVersion,
    envelope.issuedAtSeconds,
    envelope.expiresAtSeconds,
    envelope.ownerGeneration,
    envelope.sessionGeneration,
    envelope.documentNonce,
    envelope.mac,
  ]);
}

function isEnvelopeTimeValid(
  envelope: DocumentMutationGenerationV1,
  nowSeconds: number,
): boolean {
  if (!isNonNegativeSafeInteger(nowSeconds)) return false;
  const lifetime = envelope.expiresAtSeconds - envelope.issuedAtSeconds;
  return (
    lifetime >= 1 &&
    lifetime <= DOCUMENT_MUTATION_GENERATION_MAX_AGE_SECONDS &&
    envelope.issuedAtSeconds <=
      nowSeconds + DOCUMENT_MUTATION_GENERATION_CLOCK_SKEW_SECONDS &&
    envelope.expiresAtSeconds > nowSeconds
  );
}

function requireBoundedLifetime(
  issuedAtSeconds: number,
  expiresAtSeconds: number,
): void {
  const lifetime = expiresAtSeconds - issuedAtSeconds;
  if (lifetime < 1 || lifetime > DOCUMENT_MUTATION_GENERATION_MAX_AGE_SECONDS) {
    throw new TypeError(
      "A bounded document mutation generation lifetime is required.",
    );
  }
}

function normalizeOwnerUuid(value: string): string {
  if (typeof value !== "string" || !CANONICAL_UUID.test(value)) {
    throw new TypeError("A canonical Better Auth owner UUID is required.");
  }
  return value.toLowerCase();
}

function requireBoundedSessionId(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > MAX_SESSION_ID_BYTES
  ) {
    throw new TypeError("A bounded current session id is required.");
  }
  return value;
}

function requireSelectedSecret(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Document mutation signing material is unavailable.");
  }
  return value;
}

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!isNonNegativeSafeInteger(value)) {
    throw new TypeError(`A non-negative safe ${label} is required.`);
  }
  return value;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalBase64UrlBytes(
  value: unknown,
  expectedBytes: number,
): value is string {
  if (typeof value !== "string" || !BASE64URL.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return (
    decoded.length === expectedBytes && decoded.toString("base64url") === value
  );
}

function safeBase64UrlDigestEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "base64url");
  const rightBytes = Buffer.from(right, "base64url");
  return (
    leftBytes.length === HASH_BYTES &&
    rightBytes.length === HASH_BYTES &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
