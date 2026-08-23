import {
  base64UrlToBytes,
  bytesToBase64Url,
} from "./ephemeral-staging-contract";

export interface EphemeralMediaSigningKey {
  version: number;
  value: string;
}

export interface EphemeralMediaSigningPolicy {
  active: EphemeralMediaSigningKey;
  keys: readonly EphemeralMediaSigningKey[];
}

const TOKEN_DOMAIN = "overgarden.ephemeral-media.token.v1";
const STRONG_SECRET = /^[A-Za-z0-9_-]{43}$/;

export function parseEphemeralMediaSigningPolicy(input: {
  secrets: string | undefined;
  currentVersion: string | undefined;
}): EphemeralMediaSigningPolicy {
  const currentVersion = parseVersion(input.currentVersion);
  if (currentVersion === null || !input.secrets) {
    throw new Error("ephemeral_media_signing_unavailable");
  }
  const seen = new Set<number>();
  const keys: EphemeralMediaSigningKey[] = [];
  for (const encoded of input.secrets.split(",")) {
    const match = /^(0|[1-9]\d*):([A-Za-z0-9_-]+)$/.exec(encoded);
    if (!match) throw new Error("ephemeral_media_signing_unavailable");
    const version = Number(match[1]);
    const value = match[2]!;
    if (
      seen.has(version) ||
      !STRONG_SECRET.test(value) ||
      base64UrlToBytes(value).byteLength !== 32
    ) {
      throw new Error("ephemeral_media_signing_unavailable");
    }
    seen.add(version);
    keys.push({ version, value });
  }
  if (keys.length === 0 || keys[0]?.version !== currentVersion) {
    throw new Error("ephemeral_media_signing_unavailable");
  }
  return { active: keys[0], keys };
}

export async function signEphemeralMediaToken(
  payload: Record<string, unknown>,
  key: EphemeralMediaSigningKey,
): Promise<string> {
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(stableJson(payload)),
  );
  const signature = await hmac(key.value, `${TOKEN_DOMAIN}.${encodedPayload}`);
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifyEphemeralMediaToken(
  token: string,
  policy: EphemeralMediaSigningPolicy,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
  } catch {
    return null;
  }
  if (!isRecord(payload) || !Number.isSafeInteger(payload.keyVersion)) {
    return null;
  }
  const key = policy.keys.find(
    (candidate) => candidate.version === payload.keyVersion,
  );
  if (!key) return null;
  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(parts[1]);
  } catch {
    return null;
  }
  const cryptoKey = await importHmacKey(key.value, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    ownedArrayBuffer(signature),
    new TextEncoder().encode(`${TOKEN_DOMAIN}.${parts[0]}`),
  );
  return valid ? payload : null;
}

export async function deriveEphemeralMediaDigest(
  key: EphemeralMediaSigningKey,
  domain: string,
  value: string,
): Promise<string> {
  return bytesToBase64Url(await hmac(key.value, `${domain}\0${value}`));
}

export async function deriveEphemeralMediaOwnerSubjectHash(
  encodedSecret: string,
  ownerUserId: string,
): Promise<string> {
  return signEphemeralMediaText(encodedSecret, "owner-subject", ownerUserId);
}

export async function deriveEphemeralMediaPublicOwnershipProof(
  encodedSecret: string,
  input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    mediaAssetId: string;
    generation: number;
    sha256: string;
  },
): Promise<string> {
  return signEphemeralMediaText(
    encodedSecret,
    "public-object-ownership",
    [
      input.ownerSubjectHash,
      input.stagingSessionId,
      input.mediaAssetId,
      String(input.generation),
      input.sha256,
    ].join("\0"),
  );
}

export async function signEphemeralMediaText(
  encodedSecret: string,
  domain: string,
  value: string,
): Promise<string> {
  requireStrongSecret(encodedSecret);
  return bytesToBase64Url(await hmac(encodedSecret, `${domain}\0${value}`));
}

export async function verifyEphemeralMediaText(
  encodedSecret: string,
  domain: string,
  value: string,
  signature: string,
): Promise<boolean> {
  try {
    requireStrongSecret(encodedSecret);
    const bytes = base64UrlToBytes(signature);
    const key = await importHmacKey(encodedSecret, ["verify"]);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      ownedArrayBuffer(bytes),
      new TextEncoder().encode(`${domain}\0${value}`),
    );
  } catch {
    return false;
  }
}

export function requireStrongSecret(value: string | undefined): string {
  if (
    !value ||
    !STRONG_SECRET.test(value) ||
    base64UrlToBytes(value).byteLength !== 32
  ) {
    throw new Error("ephemeral_media_signing_unavailable");
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret, ["sign"]);
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

function importHmacKey(secret: string, usages: Array<"sign" | "verify">) {
  return crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(base64UrlToBytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function parseVersion(value: string | undefined): number | null {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
