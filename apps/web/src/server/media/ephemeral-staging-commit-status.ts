import "server-only";

import { db } from "@/db";
import {
  isBase64UrlSha256,
  isPositiveSafeInteger,
  isSafeNonce,
  isSubjectHash,
  isUuid,
  type EphemeralMediaCommitStatus,
} from "@/lib/media/ephemeral-staging-contract";
import {
  deriveEphemeralMediaOwnerSubjectHash,
  requireStrongSecret,
  verifyEphemeralMediaText,
} from "@/lib/media/ephemeral-staging-crypto";

export interface EphemeralMediaCommitStatusExpectedMedia {
  mediaAssetId: string;
  generation: number;
  sizeBytes: number;
  width: number;
  height: number;
  publicKey: string;
}

export interface EphemeralMediaCommitStatusRequest {
  publishId: string;
  receiptSetDigest: string;
  ownerSubjectHash: string;
  stagingSessionId: string;
  issuedAtSeconds: number;
  nonce: string;
  expectedMedia: EphemeralMediaCommitStatusExpectedMedia[];
}

export async function verifyCommitStatusRequest(
  request: Request,
): Promise<EphemeralMediaCommitStatusRequest> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 4_096) throw boundaryError("invalid");
  const body = await readBoundedText(request, 4_096);
  if (body === null) throw boundaryError("invalid");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw boundaryError("invalid");
  }
  if (!isCommitStatusRequest(value)) throw boundaryError("invalid");
  const now = Math.floor(Date.now() / 1_000);
  if (Math.abs(now - value.issuedAtSeconds) > 60)
    throw boundaryError("expired");
  const header = request.headers.get("x-overgarden-staging-signature") ?? "";
  const match = /^v1:([A-Za-z0-9_-]{43})$/.exec(header);
  const secret = requireStrongSecret(
    process.env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
  );
  if (
    !match ||
    !(await verifyEphemeralMediaText(secret, "commit-status", body, match[1]!))
  ) {
    throw boundaryError("invalid");
  }
  return value;
}

export async function readEphemeralMediaCommitStatus(
  input: EphemeralMediaCommitStatusRequest,
): Promise<EphemeralMediaCommitStatus> {
  const entry = await db
    .selectFrom("journal_entries")
    .select([
      "id",
      "owner_user_id",
      "published_at",
      "lifecycle_state",
      "visibility",
    ])
    .where("id", "=", input.publishId)
    .executeTakeFirst();
  if (!entry) return "absent";
  const secret = requireStrongSecret(
    process.env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
  );
  const ownerSubjectHash = await deriveEphemeralMediaOwnerSubjectHash(
    secret,
    entry.owner_user_id,
  );
  if (ownerSubjectHash !== input.ownerSubjectHash) return "absent";
  if (
    !entry.published_at ||
    entry.lifecycle_state !== "active" ||
    entry.visibility !== "public"
  )
    return "indeterminate";
  const media = await db
    .selectFrom("media_assets")
    .select([
      "id",
      "owner_user_id",
      "upload_generation",
      "declared_size_bytes",
      "intrinsic_width",
      "intrinsic_height",
      "declared_media_type",
      "admitted_media_type",
      "derivative_key",
      "media_readiness_state",
      "revoked_at",
    ])
    .where("journal_entry_id", "=", entry.id)
    .orderBy("id", "asc")
    .execute();
  const expected = [...input.expectedMedia].sort((left, right) =>
    left.mediaAssetId.localeCompare(right.mediaAssetId),
  );
  const mediaById = new Map(media.map((row) => [row.id, row]));
  return expected.every((item) => {
    const row = mediaById.get(item.mediaAssetId);
    if (!row) return false;
    return (
      row.id === item.mediaAssetId &&
      row.owner_user_id === entry.owner_user_id &&
      Number(row.upload_generation) === item.generation &&
      Number(row.declared_size_bytes) === item.sizeBytes &&
      row.intrinsic_width === item.width &&
      row.intrinsic_height === item.height &&
      row.declared_media_type === "image/webp" &&
      row.admitted_media_type === "image/webp" &&
      row.derivative_key === item.publicKey &&
      row.media_readiness_state === "public_ready" &&
      row.revoked_at === null
    );
  })
    ? "committed"
    : "indeterminate";
}

function isCommitStatusRequest(
  value: unknown,
): value is EphemeralMediaCommitStatusRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) =>
        ![
          "publishId",
          "receiptSetDigest",
          "ownerSubjectHash",
          "stagingSessionId",
          "issuedAtSeconds",
          "nonce",
          "expectedMedia",
        ].includes(key),
    )
  )
    return false;
  return (
    isUuid(record.publishId) &&
    isBase64UrlSha256(record.receiptSetDigest) &&
    isSubjectHash(record.ownerSubjectHash) &&
    isUuid(record.stagingSessionId) &&
    Number.isSafeInteger(record.issuedAtSeconds) &&
    isSafeNonce(record.nonce) &&
    isExpectedMedia(record.expectedMedia)
  );
}

function isExpectedMedia(
  value: unknown,
): value is EphemeralMediaCommitStatusExpectedMedia[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (
      Object.keys(row).some(
        (key) =>
          ![
            "mediaAssetId",
            "generation",
            "sizeBytes",
            "width",
            "height",
            "publicKey",
          ].includes(key),
      ) ||
      !isUuid(row.mediaAssetId) ||
      seen.has(row.mediaAssetId) ||
      !isPositiveSafeInteger(row.generation) ||
      !isPositiveSafeInteger(row.sizeBytes) ||
      !isPositiveSafeInteger(row.width) ||
      !isPositiveSafeInteger(row.height) ||
      row.publicKey !== `derivatives/${row.mediaAssetId}/${row.generation}.webp`
    ) {
      return false;
    }
    seen.add(row.mediaAssetId);
  }
  return true;
}

async function readBoundedText(request: Request, maxBytes: number) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  )
    return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function boundaryError(code: "invalid" | "expired" | "unavailable") {
  return Object.assign(new Error("commit_status_boundary_failed"), { code });
}
