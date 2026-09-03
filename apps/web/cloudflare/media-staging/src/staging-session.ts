import { DurableObject } from "cloudflare:workers";

import {
  EPHEMERAL_MEDIA_LEASE_SECONDS,
  EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO,
  EPHEMERAL_MEDIA_MAX_PER_SESSION,
  EPHEMERAL_MEDIA_OWNER_MAX_ACTIVE_SESSIONS,
  EPHEMERAL_MEDIA_OWNER_UPLOADS_PER_MINUTE,
  EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS,
  EPHEMERAL_MEDIA_STAGING_PROTOCOL,
  base64ToBytes,
  ephemeralMediaPublicKey,
  isBase64UrlSha256,
  isEphemeralMediaVariant,
  isSubjectHash,
  isUuid,
  type EphemeralMediaCommitStatus,
  type EphemeralMediaGenerationState,
  type EphemeralMediaSessionState,
  type EphemeralMediaVariant,
} from "../../../src/lib/media/ephemeral-staging-contract";
import {
  requireStrongSecret,
  signEphemeralMediaText,
  stableJson,
} from "../../../src/lib/media/ephemeral-staging-crypto";
import {
  classifyGenerationTransition,
  isControlDeadlineOpen,
  nextReconciliationDelayMs,
  readBoundedResponseText,
} from "./staging-session-policy";

const OWNER_ADMISSION_WINDOW_MS = 60_000;
const MAX_PENDING_DELETES_PER_SESSION = 100;
const MAX_OBJECTS_PER_SESSION =
  EPHEMERAL_MEDIA_MAX_PER_SESSION * EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO;

/**
 * One photo stages up to three objects: the primary and its variants
 * (ADR-0022, D2). They share `media_asset_id` and `generation`, so the SQLite
 * primary key is a media key: the asset id alone for the primary and
 * `<id>#<variant>` for a variant. Rows written before variants existed carry
 * the bare id and `variant = 0`, so no data migration is needed.
 */
export function mediaKey(mediaAssetId: string, variant: EphemeralMediaVariant) {
  return variant ? `${mediaAssetId}#${variant}` : mediaAssetId;
}

function mediaAssetIdOfKey(key: string) {
  const separator = key.indexOf("#");
  return separator === -1 ? key : key.slice(0, separator);
}

export interface MediaStagingEnv {
  MEDIA_STAGING_BUCKET: R2Bucket;
  PUBLIC_MEDIA_BUCKET: R2Bucket;
  EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET: string;
  EPHEMERAL_MEDIA_COMMIT_STATUS_URL: string;
}

export interface BeginUploadInput {
  ownerSubjectHash: string;
  stagingSessionId: string;
  mediaAssetId: string;
  generation: number;
  variant: EphemeralMediaVariant;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
  nonce: string;
  storageKey: string;
  nowMs: number;
  deadlineAtMs: number;
}

export type BeginUploadResult =
  | {
      status: "accepted" | "recover";
      attempt: number;
      storageKey: string;
      supersededStorageKeys: string[];
    }
  | {
      status: "replay";
      stagingReceipt: string;
      deleteCapability: string;
      leaseExpiresAtMs: number;
    }
  | { status: "rejected"; code: string };

export interface OwnerUploadAdmissionInput {
  ownerSubjectHash: string;
  stagingSessionId: string;
  nowMs: number;
  deadlineAtMs: number;
}

export type OwnerUploadAdmissionResult =
  | { status: "accepted" }
  | {
      status: "rejected";
      code:
        | "owner_admission_invalid"
        | "owner_mismatch"
        | "owner_rate_limit"
        | "owner_session_limit";
    };

export interface ClaimItemInput {
  mediaAssetId: string;
  generation: number;
  variant: EphemeralMediaVariant;
  sha256: string;
  sizeBytes: number;
  stagingReceipt: string;
  publicKey: string;
  publicOwnershipProof: string;
}

interface SessionRow extends Record<string, SqlStorageValue> {
  owner_subject_hash: string;
  staging_session_id: string;
  state: string;
  publish_id: string | null;
  receipt_set_digest: string | null;
  lease_expires_at_ms: number;
  state_version: number;
  alarm_attempts: number;
  absent_readbacks: number;
  terminal_at_ms: number | null;
}

interface MediaRow extends Record<string, SqlStorageValue> {
  /** The media key (see `mediaKey`), not always a bare asset id. */
  media_asset_id: string;
  generation: number;
  variant: number;
  sha256: string;
  size_bytes: number;
  width: number;
  height: number;
  capability_nonce: string;
  staging_key: string;
  public_key: string | null;
  state: string;
  upload_attempt: number;
  public_ready: number;
  staging_receipt: string | null;
  delete_capability: string | null;
  public_ownership_proof: string | null;
  lease_expires_at_ms: number;
}

interface OwnerAdmissionRow extends Record<string, SqlStorageValue> {
  owner_subject_hash: string;
  window_started_at_ms: number;
  upload_attempts: number;
}

export class MediaStagingSession extends DurableObject<MediaStagingEnv> {
  constructor(ctx: DurableObjectState, env: MediaStagingEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec(`
        CREATE TABLE IF NOT EXISTS staging_session (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner_subject_hash TEXT NOT NULL,
          staging_session_id TEXT NOT NULL,
          state TEXT NOT NULL,
          publish_id TEXT,
          receipt_set_digest TEXT,
          lease_expires_at_ms INTEGER NOT NULL,
          state_version INTEGER NOT NULL DEFAULT 1,
          alarm_attempts INTEGER NOT NULL DEFAULT 0,
          absent_readbacks INTEGER NOT NULL DEFAULT 0,
          terminal_at_ms INTEGER
        )
      `);
      sql.exec(`
        CREATE TABLE IF NOT EXISTS staging_media (
          media_asset_id TEXT PRIMARY KEY,
          generation INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          capability_nonce TEXT NOT NULL,
          staging_key TEXT NOT NULL,
          public_key TEXT,
          state TEXT NOT NULL,
          upload_attempt INTEGER NOT NULL DEFAULT 1,
          public_ready INTEGER NOT NULL DEFAULT 0,
          staging_receipt TEXT,
          delete_capability TEXT,
          public_ownership_proof TEXT,
          lease_expires_at_ms INTEGER NOT NULL
        )
      `);
      const stagingMediaColumns = sql
        .exec<{ name: string }>("PRAGMA table_info(staging_media)")
        .toArray();
      if (
        !stagingMediaColumns.some(
          (column) => column.name === "public_ownership_proof",
        )
      ) {
        sql.exec(
          "ALTER TABLE staging_media ADD COLUMN public_ownership_proof TEXT",
        );
      }
      if (!stagingMediaColumns.some((column) => column.name === "variant")) {
        sql.exec(
          "ALTER TABLE staging_media ADD COLUMN variant INTEGER NOT NULL DEFAULT 0",
        );
      }
      sql.exec(
        "CREATE INDEX IF NOT EXISTS staging_media_state_idx ON staging_media(state, lease_expires_at_ms)",
      );
      sql.exec(`
        CREATE TABLE IF NOT EXISTS staging_pending_delete (
          storage_key TEXT PRIMARY KEY,
          media_asset_id TEXT NOT NULL,
          generation INTEGER NOT NULL,
          queued_at_ms INTEGER NOT NULL
        )
      `);
      sql.exec(
        "CREATE INDEX IF NOT EXISTS staging_pending_delete_media_idx ON staging_pending_delete(media_asset_id)",
      );
      sql.exec(`
        CREATE TABLE IF NOT EXISTS owner_admission (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner_subject_hash TEXT NOT NULL,
          window_started_at_ms INTEGER NOT NULL,
          upload_attempts INTEGER NOT NULL
        )
      `);
      sql.exec(`
        CREATE TABLE IF NOT EXISTS owner_active_session (
          staging_session_id TEXT PRIMARY KEY,
          expires_at_ms INTEGER NOT NULL
        )
      `);
      sql.exec(
        "CREATE INDEX IF NOT EXISTS owner_active_session_expiry_idx ON owner_active_session(expires_at_ms)",
      );
    });
  }

  async admitOwnerUpload(
    input: OwnerUploadAdmissionInput,
  ): Promise<OwnerUploadAdmissionResult> {
    if (
      !isSubjectHash(input.ownerSubjectHash) ||
      !isUuid(input.stagingSessionId) ||
      !Number.isSafeInteger(input.nowMs) ||
      input.nowMs < 1 ||
      !isControlDeadlineOpen(input.deadlineAtMs)
    ) {
      return { status: "rejected", code: "owner_admission_invalid" };
    }
    const sessionExpiresAtMs =
      input.nowMs + EPHEMERAL_MEDIA_LEASE_SECONDS * 1_000;
    let result: OwnerUploadAdmissionResult = { status: "accepted" };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "DELETE FROM owner_active_session WHERE expires_at_ms <= ?",
        input.nowMs,
      );
      const admission = this.ownerAdmission();
      if (
        admission &&
        admission.owner_subject_hash !== input.ownerSubjectHash
      ) {
        result = { status: "rejected", code: "owner_mismatch" };
        return;
      }
      const windowExpired =
        !admission ||
        input.nowMs >=
          admission.window_started_at_ms + OWNER_ADMISSION_WINDOW_MS;
      const windowStartedAtMs = windowExpired
        ? input.nowMs
        : admission.window_started_at_ms;
      const uploadAttempts = windowExpired ? 0 : admission.upload_attempts;
      const existingSession = this.ctx.storage.sql
        .exec<{
          staging_session_id: string;
        }>(
          "SELECT staging_session_id FROM owner_active_session WHERE staging_session_id = ?",
          input.stagingSessionId,
        )
        .toArray()[0];
      if (
        !existingSession &&
        this.ownerActiveSessionCount() >=
          EPHEMERAL_MEDIA_OWNER_MAX_ACTIVE_SESSIONS
      ) {
        result = { status: "rejected", code: "owner_session_limit" };
        return;
      }
      if (uploadAttempts >= EPHEMERAL_MEDIA_OWNER_UPLOADS_PER_MINUTE) {
        result = { status: "rejected", code: "owner_rate_limit" };
        return;
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO owner_admission (
           singleton, owner_subject_hash, window_started_at_ms, upload_attempts
         ) VALUES (1, ?, ?, 1)
         ON CONFLICT(singleton) DO UPDATE SET
           window_started_at_ms = excluded.window_started_at_ms,
           upload_attempts = ?`,
        input.ownerSubjectHash,
        windowStartedAtMs,
        uploadAttempts + 1,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO owner_active_session (staging_session_id, expires_at_ms)
         VALUES (?, ?)
         ON CONFLICT(staging_session_id) DO UPDATE SET
           expires_at_ms = excluded.expires_at_ms`,
        input.stagingSessionId,
        sessionExpiresAtMs,
      );
    });
    if (result.status === "accepted") {
      await this.ctx.storage.setAlarm(this.ownerNextAlarmAt(input.nowMs));
    }
    return result;
  }

  async beginUpload(input: BeginUploadInput): Promise<BeginUploadResult> {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" };
    }
    const leaseExpiresAtMs =
      input.nowMs + EPHEMERAL_MEDIA_LEASE_SECONDS * 1_000;
    const session = this.session();
    if (
      session &&
      (session.owner_subject_hash !== input.ownerSubjectHash ||
        session.staging_session_id !== input.stagingSessionId)
    ) {
      return { status: "rejected", code: "owner_or_session_mismatch" };
    }
    if (session && session.state !== "open") {
      return { status: "rejected", code: "session_not_open" };
    }
    if (!isEphemeralMediaVariant(input.variant)) {
      return { status: "rejected", code: "variant_invalid" };
    }
    const key = mediaKey(input.mediaAssetId, input.variant);
    const current = this.media(input.mediaAssetId, input.variant);
    const transition = classifyGenerationTransition(
      current
        ? {
            generation: current.generation,
            sha256: current.sha256,
            state: current.state as EphemeralMediaGenerationState,
          }
        : null,
      input,
    );
    if (
      transition === "stale_generation" ||
      transition === "receipt_mismatch" ||
      transition === "generation_expired"
    ) {
      return { status: "rejected", code: transition };
    }
    if (transition === "replay") {
      if (!current?.staging_receipt || !current.delete_capability) {
        return { status: "rejected", code: "receipt_unavailable" };
      }
      return {
        status: "replay",
        stagingReceipt: current.staging_receipt,
        deleteCapability: current.delete_capability,
        leaseExpiresAtMs: current.lease_expires_at_ms,
      };
    }
    if (transition === "retry" && current?.state === "uploading") {
      if (current.staging_key !== input.storageKey) {
        return { status: "rejected", code: "upload_in_progress" };
      }
      await this.ctx.storage.setAlarm(leaseExpiresAtMs);
      return {
        status: "recover",
        attempt: current.upload_attempt,
        storageKey: current.staging_key,
        supersededStorageKeys: this.pendingDeleteKeys(key),
      };
    }
    if (
      !current &&
      (input.variant === 0
        ? this.activePhotoCount() >= EPHEMERAL_MEDIA_MAX_PER_SESSION
        : this.activeMediaCount() >= MAX_OBJECTS_PER_SESSION)
    ) {
      return { status: "rejected", code: "session_media_limit" };
    }
    const supersededStorageKey =
      current &&
      current.generation < input.generation &&
      current.state !== "deleted"
        ? current.staging_key
        : null;
    if (
      supersededStorageKey &&
      this.pendingDeleteCount() >= MAX_PENDING_DELETES_PER_SESSION
    ) {
      return { status: "rejected", code: "cleanup_backlog" };
    }
    const attempt = (current?.upload_attempt ?? 0) + 1;
    this.ctx.storage.transactionSync(() => {
      if (!session) {
        this.ctx.storage.sql.exec(
          `INSERT INTO staging_session (
             singleton, owner_subject_hash, staging_session_id, state,
             lease_expires_at_ms, state_version
           ) VALUES (1, ?, ?, 'open', ?, 1)`,
          input.ownerSubjectHash,
          input.stagingSessionId,
          leaseExpiresAtMs,
        );
      } else {
        this.ctx.storage.sql.exec(
          `UPDATE staging_session
             SET lease_expires_at_ms = ?, state_version = state_version + 1,
                 alarm_attempts = 0, absent_readbacks = 0
           WHERE singleton = 1`,
          leaseExpiresAtMs,
        );
      }
      if (supersededStorageKey && current) {
        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO staging_pending_delete (
             storage_key, media_asset_id, generation, queued_at_ms
           ) VALUES (?, ?, ?, ?)`,
          supersededStorageKey,
          key,
          current.generation,
          input.nowMs,
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO staging_media (
           media_asset_id, generation, variant, sha256, size_bytes, width, height,
           capability_nonce, staging_key, state, upload_attempt,
           public_ready, lease_expires_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, 0, ?)
         ON CONFLICT(media_asset_id) DO UPDATE SET
           generation = excluded.generation,
           variant = excluded.variant,
           sha256 = excluded.sha256,
           size_bytes = excluded.size_bytes,
           width = excluded.width,
           height = excluded.height,
           capability_nonce = excluded.capability_nonce,
           staging_key = excluded.staging_key,
           public_key = NULL,
           state = 'uploading',
           upload_attempt = excluded.upload_attempt,
           public_ready = 0,
           staging_receipt = NULL,
           delete_capability = NULL,
           public_ownership_proof = NULL,
           lease_expires_at_ms = excluded.lease_expires_at_ms`,
        key,
        input.generation,
        input.variant,
        input.sha256,
        input.sizeBytes,
        input.width,
        input.height,
        input.nonce,
        input.storageKey,
        attempt,
        leaseExpiresAtMs,
      );
    });
    await this.ctx.storage.setAlarm(leaseExpiresAtMs);
    return {
      status: "accepted",
      attempt,
      storageKey: input.storageKey,
      supersededStorageKeys: this.pendingDeleteKeys(key),
    };
  }

  /**
   * Extends the session lease and every live object's lease to
   * now + `EPHEMERAL_MEDIA_LEASE_SECONDS` (OVE-372). Only an open session is
   * touched: a publishing session is on the claim path, and a terminal one is
   * gone.
   */
  async touch(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    nowMs: number;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId
    ) {
      return { status: "rejected", code: "owner_or_session_mismatch" } as const;
    }
    if (session.state !== "open") {
      return { status: "rejected", code: "session_not_open" } as const;
    }
    const leaseExpiresAtMs =
      input.nowMs + EPHEMERAL_MEDIA_LEASE_SECONDS * 1_000;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE staging_session SET lease_expires_at_ms = ?,
           state_version = state_version + 1, alarm_attempts = 0
         WHERE singleton = 1`,
        leaseExpiresAtMs,
      );
      this.ctx.storage.sql.exec(
        `UPDATE staging_media SET lease_expires_at_ms = ?
         WHERE state NOT IN ('deleted', 'expired', 'finalized')`,
        leaseExpiresAtMs,
      );
    });
    await this.ctx.storage.setAlarm(leaseExpiresAtMs);
    return { status: "touched", leaseExpiresAtMs } as const;
  }

  async completeSupersededDeletes(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    storageKeys: string[];
    deadlineAtMs: number;
  }) {
    if (
      !isControlDeadlineOpen(input.deadlineAtMs) ||
      input.storageKeys.length < 1 ||
      input.storageKeys.length > MAX_PENDING_DELETES_PER_SESSION ||
      input.storageKeys.some((key) => !isOpaqueStagingKey(key))
    ) {
      return { status: "rejected", code: "cleanup_invalid" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId
    ) {
      return {
        status: "rejected",
        code: "owner_or_session_mismatch",
      } as const;
    }
    this.ctx.storage.transactionSync(() => {
      for (const storageKey of input.storageKeys) {
        this.ctx.storage.sql.exec(
          "DELETE FROM staging_pending_delete WHERE storage_key = ?",
          storageKey,
        );
      }
    });
    return { status: "deleted" } as const;
  }

  async completeUpload(input: {
    mediaAssetId: string;
    generation: number;
    variant: EphemeralMediaVariant;
    attempt: number;
    stagingReceipt: string;
    deleteCapability: string;
    leaseExpiresAtMs: number;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const updated = this.ctx.storage.sql
      .exec<{ state: string }>(
        `UPDATE staging_media
         SET state = 'staged', staging_receipt = ?, delete_capability = ?,
             lease_expires_at_ms = ?
       WHERE media_asset_id = ? AND generation = ? AND upload_attempt = ?
         AND state = 'uploading'
       RETURNING state`,
        input.stagingReceipt,
        input.deleteCapability,
        input.leaseExpiresAtMs,
        mediaKey(input.mediaAssetId, input.variant),
        input.generation,
        input.attempt,
      )
      .toArray();
    if (updated.length !== 1) {
      const current = this.media(input.mediaAssetId, input.variant);
      if (
        current?.generation === input.generation &&
        current.upload_attempt === input.attempt &&
        current.state === "staged" &&
        current.staging_receipt &&
        current.delete_capability
      ) {
        return {
          status: "replay",
          stagingReceipt: current.staging_receipt,
          deleteCapability: current.delete_capability,
          leaseExpiresAtMs: current.lease_expires_at_ms,
        } as const;
      }
      return { status: "rejected", code: "stale_completion" } as const;
    }
    this.bumpSession(input.leaseExpiresAtMs);
    return { status: "staged" } as const;
  }

  async abortUpload(input: {
    mediaAssetId: string;
    generation: number;
    variant: EphemeralMediaVariant;
    attempt: number;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    this.ctx.storage.sql.exec(
      `UPDATE staging_media SET state = 'reserved'
       WHERE media_asset_id = ? AND generation = ? AND upload_attempt = ? AND state = 'uploading'`,
      mediaKey(input.mediaAssetId, input.variant),
      input.generation,
      input.attempt,
    );
    return { status: "reserved" } as const;
  }

  /**
   * Deleting the primary (`variant` 0) deletes the photo: its variants go with
   * it, because the browser holds one delete capability per photo. Deleting a
   * variant on its own removes only that object.
   */
  async beginDelete(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    mediaAssetId: string;
    generation: number;
    variant: EphemeralMediaVariant;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId
    ) {
      return { status: "deleted", stagingKeys: [] as string[] } as const;
    }
    if (session.state !== "open")
      return { status: "rejected", code: "session_not_open" } as const;
    const rows = this.photoRows(input.mediaAssetId, input.variant);
    const pendingStagingKeys = rows.flatMap((row) =>
      this.pendingDeleteKeys(row.media_asset_id),
    );
    const live = rows.filter((row) => row.state !== "deleted");
    if (live.length === 0 && pendingStagingKeys.length === 0)
      return {
        status: "deleted",
        stagingKeys: [] as string[],
        pendingStagingKeys: [] as string[],
      } as const;
    const primary = live.find((row) => row.variant === input.variant);
    if (primary && primary.generation !== input.generation)
      return { status: "rejected", code: "stale_generation" } as const;
    const doomed = live.filter((row) => row.generation === input.generation);
    this.ctx.storage.transactionSync(() => {
      for (const row of doomed) {
        this.ctx.storage.sql.exec(
          "UPDATE staging_media SET state = 'deleting' WHERE media_asset_id = ? AND generation = ?",
          row.media_asset_id,
          input.generation,
        );
      }
    });
    return {
      status: "delete",
      stagingKeys: doomed.map((row) => row.staging_key),
      pendingStagingKeys,
    } as const;
  }

  async completeDelete(input: {
    mediaAssetId: string;
    generation: number;
    variant: EphemeralMediaVariant;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const keys = this.photoRows(input.mediaAssetId, input.variant).map(
      (row) => row.media_asset_id,
    );
    this.ctx.storage.transactionSync(() => {
      for (const key of keys) {
        this.ctx.storage.sql.exec(
          `UPDATE staging_media SET state = 'deleted', public_ready = 0
           WHERE media_asset_id = ? AND generation = ? AND state = 'deleting'`,
          key,
          input.generation,
        );
        this.ctx.storage.sql.exec(
          "DELETE FROM staging_pending_delete WHERE media_asset_id = ?",
          key,
        );
      }
      this.ctx.storage.sql.exec(
        "UPDATE staging_session SET state_version = state_version + 1 WHERE singleton = 1",
      );
    });
    return { status: "deleted" } as const;
  }

  async beginClaim(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
    nowMs: number;
    deadlineAtMs: number;
    items: ClaimItemInput[];
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId
    ) {
      return { status: "rejected", code: "owner_or_session_mismatch" } as const;
    }
    if (!isBase64UrlSha256(input.receiptSetDigest)) {
      return { status: "rejected", code: "claim_invalid" } as const;
    }
    if (
      session.state === "committed" &&
      session.publish_id === input.publishId &&
      session.receipt_set_digest === input.receiptSetDigest
    ) {
      return { status: "replay", items: this.claimedItems() } as const;
    }
    if (
      session.state === "abandoned" ||
      !["open", "publishing"].includes(session.state) ||
      (session.publish_id && session.publish_id !== input.publishId) ||
      (session.receipt_set_digest &&
        session.receipt_set_digest !== input.receiptSetDigest)
    ) {
      return {
        status: "rejected",
        code:
          session.publish_id === input.publishId
            ? "receipt_set_mismatch"
            : "publish_conflict",
      } as const;
    }
    if (
      input.items.length < 1 ||
      input.items.length > MAX_OBJECTS_PER_SESSION
    ) {
      return { status: "rejected", code: "claim_invalid" } as const;
    }
    const seen = new Set<string>();
    for (const item of input.items) {
      if (!isEphemeralMediaVariant(item.variant))
        return { status: "rejected", code: "claim_invalid" } as const;
      const key = mediaKey(item.mediaAssetId, item.variant);
      if (seen.has(key))
        return { status: "rejected", code: "claim_invalid" } as const;
      seen.add(key);
      const row = this.media(item.mediaAssetId, item.variant);
      if (row && row.lease_expires_at_ms < input.nowMs) {
        return { status: "rejected", code: "receipt_expired" } as const;
      }
      if (
        !isBase64UrlSha256(item.publicOwnershipProof) ||
        item.publicKey !== ephemeralMediaPublicKey(item) ||
        !row ||
        row.generation !== item.generation ||
        row.sha256 !== item.sha256 ||
        row.size_bytes !== item.sizeBytes ||
        row.staging_receipt !== item.stagingReceipt ||
        !["staged", "claimed"].includes(row.state)
      ) {
        return { status: "rejected", code: "receipt_mismatch" } as const;
      }
    }
    // A variant is only claimable next to the primary it was cut from.
    if (
      input.items.some(
        (item) => item.variant !== 0 && !seen.has(mediaKey(item.mediaAssetId, 0)),
      )
    ) {
      return { status: "rejected", code: "claim_invalid" } as const;
    }
    if (this.activeMediaCount() !== seen.size) {
      return { status: "rejected", code: "receipt_set_mismatch" } as const;
    }
    const leaseExpiresAtMs =
      input.nowMs + EPHEMERAL_MEDIA_LEASE_SECONDS * 1_000;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE staging_session SET state = 'publishing', publish_id = ?,
           receipt_set_digest = ?,
           lease_expires_at_ms = ?, state_version = state_version + 1,
           alarm_attempts = 0, absent_readbacks = 0 WHERE singleton = 1`,
        input.publishId,
        input.receiptSetDigest,
        leaseExpiresAtMs,
      );
      for (const item of input.items) {
        this.ctx.storage.sql.exec(
          `UPDATE staging_media SET state = 'claimed', public_key = ?,
             public_ownership_proof = ?, lease_expires_at_ms = ?
           WHERE media_asset_id = ? AND generation = ?`,
          item.publicKey,
          item.publicOwnershipProof,
          leaseExpiresAtMs,
          mediaKey(item.mediaAssetId, item.variant),
          item.generation,
        );
      }
    });
    await this.ctx.storage.setAlarm(leaseExpiresAtMs);
    return { status: "claim", items: this.claimedItems() } as const;
  }

  async completeClaim(input: {
    mediaAssetId: string;
    generation: number;
    variant: EphemeralMediaVariant;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const updated = this.ctx.storage.sql
      .exec<{ state: string }>(
        `UPDATE staging_media SET public_ready = 1
       WHERE media_asset_id = ? AND generation = ? AND state = 'claimed'
       RETURNING state`,
        mediaKey(input.mediaAssetId, input.variant),
        input.generation,
      )
      .toArray();
    return updated.length === 1
      ? ({ status: "claimed" } as const)
      : ({ status: "rejected", code: "stale_completion" } as const);
  }

  async beginFinalize(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId
    ) {
      return { status: "rejected", code: "owner_or_session_mismatch" } as const;
    }
    if (
      session.state === "committed" &&
      session.publish_id === input.publishId &&
      session.receipt_set_digest === input.receiptSetDigest
    ) {
      return { status: "finalized", stagingKeys: [] as string[] } as const;
    }
    if (
      !["publishing", "finalizing"].includes(session.state) ||
      session.publish_id !== input.publishId ||
      session.receipt_set_digest !== input.receiptSetDigest
    ) {
      return {
        status: "rejected",
        code:
          session.publish_id === input.publishId
            ? "receipt_set_mismatch"
            : "publish_conflict",
      } as const;
    }
    const items = this.claimedItems();
    if (items.length < 1 || items.some((item) => item.publicReady !== 1)) {
      return { status: "rejected", code: "claim_incomplete" } as const;
    }
    return {
      status: "verify",
      stagingKeys: items.map((item) => item.stagingKey),
    } as const;
  }

  async lockFinalize(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId ||
      session.publish_id !== input.publishId ||
      session.receipt_set_digest !== input.receiptSetDigest
    ) {
      return { status: "rejected", code: "publish_conflict" } as const;
    }
    if (session.state === "committed") {
      return { status: "finalized", stagingKeys: [] as string[] } as const;
    }
    if (!["publishing", "finalizing"].includes(session.state)) {
      return {
        status: "rejected",
        code: "session_not_publishing",
      } as const;
    }
    const items = this.claimedItems();
    if (
      items.length < 1 ||
      items.some(
        (item) =>
          item.publicReady !== 1 ||
          !isBase64UrlSha256(item.publicOwnershipProof),
      )
    ) {
      return { status: "rejected", code: "claim_incomplete" } as const;
    }
    if (session.state === "publishing") {
      const updated = this.ctx.storage.sql
        .exec<{ state: string }>(
          `UPDATE staging_session SET state = 'finalizing',
             state_version = state_version + 1, absent_readbacks = 0
           WHERE singleton = 1 AND state = 'publishing'
             AND state_version = ?
           RETURNING state`,
          session.state_version,
        )
        .toArray();
      if (updated.length !== 1) {
        return { status: "rejected", code: "finalize_conflict" } as const;
      }
    }
    return {
      status: "locked",
      stagingKeys: items.map((item) => item.stagingKey),
    } as const;
  }

  async completeFinalize(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
    nowMs: number;
    deadlineAtMs?: number;
  }) {
    if (
      input.deadlineAtMs !== undefined &&
      !isControlDeadlineOpen(input.deadlineAtMs)
    ) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId ||
      session.publish_id !== input.publishId ||
      session.receipt_set_digest !== input.receiptSetDigest
    ) {
      return { status: "rejected", code: "publish_conflict" } as const;
    }
    if (session.state === "committed") {
      return { status: "finalized" } as const;
    }
    if (session.state !== "finalizing") {
      return {
        status: "rejected",
        code: "session_not_publishing",
      } as const;
    }
    const items = this.claimedItems();
    if (items.length < 1 || items.some((item) => item.publicReady !== 1)) {
      return { status: "rejected", code: "claim_incomplete" } as const;
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE staging_media SET state = 'finalized' WHERE state = 'claimed'",
      );
      this.ctx.storage.sql.exec(
        `UPDATE staging_session SET state = 'committed', terminal_at_ms = ?,
           state_version = state_version + 1, alarm_attempts = 0,
           absent_readbacks = 0 WHERE singleton = 1`,
        input.nowMs,
      );
    });
    await this.ctx.storage.setAlarm(
      input.nowMs + EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS * 1_000,
    );
    return { status: "finalized" } as const;
  }

  async prepareFinalize(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
    deadlineAtMs: number;
  }) {
    if (!isControlDeadlineOpen(input.deadlineAtMs)) {
      return { status: "rejected", code: "control_expired" } as const;
    }
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId ||
      session.publish_id !== input.publishId ||
      session.receipt_set_digest !== input.receiptSetDigest ||
      !["finalizing", "committed"].includes(session.state)
    ) {
      return { status: "rejected", code: "publish_conflict" } as const;
    }
    const items = this.claimedItems();
    if (items.length < 1 || items.some((item) => item.publicReady !== 1)) {
      return { status: "rejected", code: "claim_incomplete" } as const;
    }
    for (const item of items) {
      if (!isControlDeadlineOpen(input.deadlineAtMs)) {
        return { status: "rejected", code: "control_expired" } as const;
      }
      await this.makePublicObjectImmutable(item);
      if (!isControlDeadlineOpen(input.deadlineAtMs)) {
        return { status: "rejected", code: "control_expired" } as const;
      }
    }
    return { status: "prepared" } as const;
  }

  async commitStatus(input: {
    ownerSubjectHash: string;
    stagingSessionId: string;
    publishId: string;
    receiptSetDigest: string;
  }): Promise<EphemeralMediaCommitStatus> {
    const session = this.session();
    if (
      !session ||
      session.owner_subject_hash !== input.ownerSubjectHash ||
      session.staging_session_id !== input.stagingSessionId ||
      session.publish_id !== input.publishId ||
      session.receipt_set_digest !== input.receiptSetDigest ||
      !["publishing", "finalizing"].includes(session.state)
    ) {
      return "indeterminate";
    }
    return this.readCommitStatus(session).catch(() => "indeterminate");
  }

  async redactedState() {
    const session = this.session();
    const states = this.ctx.storage.sql
      .exec<{
        state: string;
        count: number;
      }>(
        "SELECT state, COUNT(*) AS count FROM staging_media GROUP BY state ORDER BY state",
      )
      .toArray();
    return {
      sessionState: (session?.state ??
        null) as EphemeralMediaSessionState | null,
      mediaStates: states,
      activeMediaCount: this.activeMediaCount(),
    };
  }

  async alarm() {
    const nowMs = Date.now();
    if (this.ownerAdmission()) {
      await this.reconcileOwnerAdmission(nowMs);
      return;
    }
    const session = this.session();
    if (!session) return;
    try {
      await this.reconcileAlarm(nowMs, session);
    } catch {
      await this.reschedule(
        this.session()?.alarm_attempts ?? session.alarm_attempts,
      );
    }
  }

  private async reconcileAlarm(nowMs: number, session: SessionRow) {
    if (session.terminal_at_ms !== null) {
      if (
        nowMs >=
        session.terminal_at_ms +
          EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS * 1_000
      ) {
        await this.ctx.storage.deleteAll();
        return;
      }
      await this.ctx.storage.setAlarm(
        session.terminal_at_ms +
          EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS * 1_000,
      );
      return;
    }
    if (nowMs < session.lease_expires_at_ms) {
      await this.ctx.storage.setAlarm(session.lease_expires_at_ms);
      return;
    }
    if (session.state === "abandoning") {
      await this.deleteObjects({ includePublic: true });
      await this.markAbandoned(nowMs);
      return;
    }
    if (session.state === "open") {
      if (!this.beginAbandoning(session)) {
        await this.reschedule(session.alarm_attempts);
        return;
      }
      await this.deleteObjects({ includePublic: true });
      await this.markAbandoned(nowMs);
      return;
    }
    if (
      !["publishing", "finalizing"].includes(session.state) ||
      !session.publish_id
    ) {
      await this.reschedule(session.alarm_attempts);
      return;
    }
    const status =
      session.state === "finalizing"
        ? "committed"
        : await this.readCommitStatus(session).catch(
            () => "indeterminate" as const,
          );
    const current = this.session();
    if (!current || current.state_version !== session.state_version) {
      await this.reschedule(current?.alarm_attempts ?? session.alarm_attempts);
      return;
    }
    if (status === "committed") {
      const locked = await this.lockFinalize({
        ownerSubjectHash: session.owner_subject_hash,
        stagingSessionId: session.staging_session_id,
        publishId: session.publish_id,
        receiptSetDigest: session.receipt_set_digest!,
        deadlineAtMs: Date.now() + 45_000,
      });
      if (locked.status === "finalized") return;
      if (locked.status !== "locked") {
        await this.reschedule(
          this.session()?.alarm_attempts ?? session.alarm_attempts,
        );
        return;
      }
      const prepared = await this.prepareFinalize({
        ownerSubjectHash: session.owner_subject_hash,
        stagingSessionId: session.staging_session_id,
        publishId: session.publish_id,
        receiptSetDigest: session.receipt_set_digest!,
        deadlineAtMs: Date.now() + 45_000,
      });
      if (prepared.status !== "prepared") {
        throw new Error("public_finalize_unavailable");
      }
      if (locked.stagingKeys.length > 0) {
        await this.env.MEDIA_STAGING_BUCKET.delete(locked.stagingKeys);
      }
      const completed = await this.completeFinalize({
        ownerSubjectHash: session.owner_subject_hash,
        stagingSessionId: session.staging_session_id,
        publishId: session.publish_id,
        receiptSetDigest: session.receipt_set_digest!,
        nowMs,
        deadlineAtMs: Date.now() + 45_000,
      });
      if (completed.status !== "finalized") {
        throw new Error("finalize_completion_unavailable");
      }
      return;
    }
    if (current.state === "finalizing") {
      await this.reschedule(current.alarm_attempts);
      return;
    }
    if (status === "absent") {
      if (session.absent_readbacks < 1) {
        const updated = this.ctx.storage.sql
          .exec<{ state: string }>(
            `UPDATE staging_session SET absent_readbacks = absent_readbacks + 1,
               alarm_attempts = alarm_attempts + 1,
               state_version = state_version + 1
             WHERE singleton = 1 AND state = 'publishing'
               AND state_version = ?
             RETURNING state`,
            current.state_version,
          )
          .toArray();
        if (updated.length !== 1) {
          await this.reschedule(
            this.session()?.alarm_attempts ?? session.alarm_attempts,
          );
          return;
        }
        await this.ctx.storage.setAlarm(nowMs + 60_000);
        return;
      }
      if (!this.beginAbandoning(current)) {
        await this.reschedule(
          this.session()?.alarm_attempts ?? session.alarm_attempts,
        );
        return;
      }
      await this.deleteObjects({ includePublic: true });
      await this.markAbandoned(nowMs);
      return;
    }
    await this.reschedule(session.alarm_attempts);
  }

  private async reconcileOwnerAdmission(nowMs: number) {
    this.ctx.storage.sql.exec(
      "DELETE FROM owner_active_session WHERE expires_at_ms <= ?",
      nowMs,
    );
    const admission = this.ownerAdmission();
    if (!admission) return;
    const activeSessions = this.ownerActiveSessionCount();
    if (
      activeSessions === 0 &&
      nowMs >= admission.window_started_at_ms + OWNER_ADMISSION_WINDOW_MS
    ) {
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.ctx.storage.setAlarm(this.ownerNextAlarmAt(nowMs));
  }

  private session(): SessionRow | null {
    return (
      this.ctx.storage.sql
        .exec<SessionRow>("SELECT * FROM staging_session WHERE singleton = 1")
        .toArray()[0] ?? null
    );
  }

  private ownerAdmission(): OwnerAdmissionRow | null {
    return (
      this.ctx.storage.sql
        .exec<OwnerAdmissionRow>(
          "SELECT * FROM owner_admission WHERE singleton = 1",
        )
        .toArray()[0] ?? null
    );
  }

  private ownerActiveSessionCount() {
    const row = this.ctx.storage.sql
      .exec<{
        count: number;
      }>("SELECT COUNT(*) AS count FROM owner_active_session")
      .toArray()[0];
    return Number(row?.count ?? 0);
  }

  private ownerNextAlarmAt(nowMs: number) {
    const admission = this.ownerAdmission();
    if (!admission) return nowMs + OWNER_ADMISSION_WINDOW_MS;
    const nextSessionExpiry = Number(
      this.ctx.storage.sql
        .exec<{
          expires_at_ms: number | null;
        }>(
          "SELECT MIN(expires_at_ms) AS expires_at_ms FROM owner_active_session",
        )
        .toArray()[0]?.expires_at_ms ?? Number.POSITIVE_INFINITY,
    );
    const windowExpiry =
      admission.window_started_at_ms + OWNER_ADMISSION_WINDOW_MS;
    const candidates = [nextSessionExpiry, windowExpiry].filter(
      (value) => Number.isFinite(value) && value > nowMs,
    );
    return Math.min(...candidates, nowMs + OWNER_ADMISSION_WINDOW_MS);
  }

  private media(
    mediaAssetId: string,
    variant: EphemeralMediaVariant,
  ): MediaRow | null {
    return (
      this.ctx.storage.sql
        .exec<MediaRow>(
          "SELECT * FROM staging_media WHERE media_asset_id = ?",
          mediaKey(mediaAssetId, variant),
        )
        .toArray()[0] ?? null
    );
  }

  /** The primary's row and its variants; a variant alone for `variant` > 0. */
  private photoRows(mediaAssetId: string, variant: EphemeralMediaVariant) {
    if (variant !== 0) {
      const row = this.media(mediaAssetId, variant);
      return row ? [row] : [];
    }
    return this.ctx.storage.sql
      .exec<MediaRow>(
        "SELECT * FROM staging_media WHERE media_asset_id = ? OR media_asset_id LIKE ? ORDER BY media_asset_id",
        mediaAssetId,
        `${mediaAssetId}#%`,
      )
      .toArray();
  }

  /** Every live object: primaries and variants. */
  private activeMediaCount() {
    const row = this.ctx.storage.sql
      .exec<{
        count: number;
      }>(
        "SELECT COUNT(*) AS count FROM staging_media WHERE state NOT IN ('deleted', 'expired')",
      )
      .toArray()[0];
    return Number(row?.count ?? 0);
  }

  /** Live photos only; the per-session limit counts these. */
  private activePhotoCount() {
    const row = this.ctx.storage.sql
      .exec<{
        count: number;
      }>(
        "SELECT COUNT(*) AS count FROM staging_media WHERE variant = 0 AND state NOT IN ('deleted', 'expired')",
      )
      .toArray()[0];
    return Number(row?.count ?? 0);
  }

  private pendingDeleteCount() {
    const row = this.ctx.storage.sql
      .exec<{
        count: number;
      }>("SELECT COUNT(*) AS count FROM staging_pending_delete")
      .toArray()[0];
    return Number(row?.count ?? 0);
  }

  private pendingDeleteKeys(mediaAssetId?: string) {
    const query = mediaAssetId
      ? this.ctx.storage.sql.exec<{ storage_key: string }>(
          "SELECT storage_key FROM staging_pending_delete WHERE media_asset_id = ? ORDER BY queued_at_ms, storage_key",
          mediaAssetId,
        )
      : this.ctx.storage.sql.exec<{ storage_key: string }>(
          "SELECT storage_key FROM staging_pending_delete ORDER BY queued_at_ms, storage_key",
        );
    return query.toArray().map((row) => row.storage_key);
  }

  private beginAbandoning(session: SessionRow) {
    if (!["open", "publishing"].includes(session.state)) return false;
    return (
      this.ctx.storage.sql
        .exec<{ state: string }>(
          `UPDATE staging_session SET state = 'abandoning',
             state_version = state_version + 1
           WHERE singleton = 1 AND state = ? AND state_version = ?
           RETURNING state`,
          session.state,
          session.state_version,
        )
        .toArray().length === 1
    );
  }

  private claimedItems() {
    return this.ctx.storage.sql
      .exec<MediaRow>(
        "SELECT * FROM staging_media WHERE state IN ('claimed', 'finalized') ORDER BY media_asset_id",
      )
      .toArray()
      .map((row) => ({
        mediaAssetId: mediaAssetIdOfKey(row.media_asset_id),
        generation: row.generation,
        variant: (Number(row.variant) || 0) as EphemeralMediaVariant,
        sha256: row.sha256,
        sizeBytes: row.size_bytes,
        width: row.width,
        height: row.height,
        stagingKey: row.staging_key,
        publicKey: row.public_key!,
        publicReady: row.public_ready,
        publicOwnershipProof: row.public_ownership_proof,
      }));
  }

  private bumpSession(leaseExpiresAtMs: number) {
    this.ctx.storage.sql.exec(
      `UPDATE staging_session SET lease_expires_at_ms = ?,
         state_version = state_version + 1 WHERE singleton = 1`,
      leaseExpiresAtMs,
    );
  }

  private async readCommitStatus(
    session: SessionRow,
  ): Promise<EphemeralMediaCommitStatus> {
    if (!session.receipt_set_digest) return "indeterminate";
    const commitStatusUrl = new URL(this.env.EPHEMERAL_MEDIA_COMMIT_STATUS_URL);
    if (
      commitStatusUrl.href !==
      "https://over.garden/api/media/staging/commit-status"
    ) {
      return "indeterminate";
    }
    const body = stableJson({
      publishId: session.publish_id,
      receiptSetDigest: session.receipt_set_digest,
      ownerSubjectHash: session.owner_subject_hash,
      stagingSessionId: session.staging_session_id,
      issuedAtSeconds: Math.floor(Date.now() / 1_000),
      nonce: crypto.randomUUID().replace(/-/g, ""),
      expectedMedia: this.claimedItems().map((item) => ({
        mediaAssetId: item.mediaAssetId,
        generation: item.generation,
        // Only variants carry the field; the primary keeps the older shape.
        ...(item.variant ? { variant: item.variant } : {}),
        sizeBytes: item.sizeBytes,
        width: item.width,
        height: item.height,
        publicKey: item.publicKey,
      })),
    });
    const secret = requireStrongSecret(
      this.env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
    );
    const signature = await signEphemeralMediaText(
      secret,
      "commit-status",
      body,
    );
    const response = await fetch(commitStatusUrl.href, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-overgarden-staging-signature": `v1:${signature}`,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return "indeterminate";
    const responseBody = await readBoundedResponseText(response, 256);
    if (responseBody === null) return "indeterminate";
    let value: { status?: unknown };
    try {
      value = JSON.parse(responseBody) as { status?: unknown };
    } catch {
      return "indeterminate";
    }
    return ["committed", "absent", "indeterminate"].includes(
      String(value.status),
    )
      ? (value.status as EphemeralMediaCommitStatus)
      : "indeterminate";
  }

  private async makePublicObjectImmutable(
    item: ReturnType<MediaStagingSession["claimedItems"]>[number],
  ) {
    if (!isBase64UrlSha256(item.publicOwnershipProof)) {
      throw new Error("public_ownership_proof_unavailable");
    }
    const currentBody = await this.env.PUBLIC_MEDIA_BUCKET.get(item.publicKey);
    let current: R2Object | R2ObjectBody | null = currentBody;
    if (
      current &&
      (current.size !== item.sizeBytes ||
        current.customMetadata?.sha256 !== item.sha256 ||
        current.customMetadata?.ownershipProof !== item.publicOwnershipProof)
    ) {
      throw new Error("public_object_collision");
    }
    if (
      current?.httpMetadata?.cacheControl ===
        "public, max-age=31536000, immutable" &&
      current.customMetadata?.publicationState === "committed"
    ) {
      return;
    }
    const staging = await this.env.MEDIA_STAGING_BUCKET.get(item.stagingKey);
    const source = staging ?? currentBody;
    if (!source || source.size !== item.sizeBytes) {
      throw new Error("public_finalize_source_unavailable");
    }
    const stored = await this.env.PUBLIC_MEDIA_BUCKET.put(
      item.publicKey,
      source.body,
      {
        onlyIf: current
          ? { etagMatches: current.etag }
          : { etagDoesNotMatch: "*" },
        sha256: ownedArrayBuffer(base64ToBytes(item.sha256)),
        httpMetadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        },
        customMetadata: {
          protocol: EPHEMERAL_MEDIA_STAGING_PROTOCOL,
          sha256: item.sha256,
          publicationState: "committed",
          ownershipProof: item.publicOwnershipProof,
        },
      },
    );
    current =
      stored ?? (await this.env.PUBLIC_MEDIA_BUCKET.get(item.publicKey));
    if (
      !current ||
      current.size !== item.sizeBytes ||
      current.customMetadata?.sha256 !== item.sha256 ||
      current.customMetadata.publicationState !== "committed" ||
      current.customMetadata.ownershipProof !== item.publicOwnershipProof ||
      current.httpMetadata?.cacheControl !==
        "public, max-age=31536000, immutable"
    ) {
      throw new Error("public_finalize_verification_failed");
    }
  }

  private async deleteObjects(input: { includePublic: boolean }) {
    const items = this.ctx.storage.sql
      .exec<MediaRow>("SELECT * FROM staging_media")
      .toArray();
    const stagingKeys = [
      ...new Set([
        ...items.map((item) => item.staging_key),
        ...this.pendingDeleteKeys(),
      ]),
    ];
    const publicKeys: string[] = [];
    if (input.includePublic) {
      for (const item of items) {
        if (
          !item.public_key ||
          !isBase64UrlSha256(item.public_ownership_proof)
        ) {
          continue;
        }
        const object = await this.env.PUBLIC_MEDIA_BUCKET.head(item.public_key);
        if (
          object?.customMetadata?.ownershipProof === item.public_ownership_proof
        ) {
          publicKeys.push(item.public_key);
        }
      }
    }
    if (stagingKeys.length > 0)
      await this.env.MEDIA_STAGING_BUCKET.delete(stagingKeys);
    if (publicKeys.length > 0)
      await this.env.PUBLIC_MEDIA_BUCKET.delete(publicKeys);
    this.ctx.storage.sql.exec("DELETE FROM staging_pending_delete");
  }

  private async markAbandoned(nowMs: number) {
    this.ctx.storage.transactionSync(() => {
      const updated = this.ctx.storage.sql
        .exec<{ state: string }>(
          `UPDATE staging_session SET state = 'abandoned', terminal_at_ms = ?,
             state_version = state_version + 1
           WHERE singleton = 1 AND state = 'abandoning'
           RETURNING state`,
          nowMs,
        )
        .toArray();
      if (updated.length !== 1) throw new Error("abandon_fence_lost");
      this.ctx.storage.sql.exec(
        "UPDATE staging_media SET state = 'deleted', public_ready = 0 WHERE state != 'finalized'",
      );
    });
    await this.ctx.storage.setAlarm(
      nowMs + EPHEMERAL_MEDIA_TERMINAL_RETENTION_SECONDS * 1_000,
    );
  }

  private async reschedule(attempt: number) {
    this.ctx.storage.sql.exec(
      "UPDATE staging_session SET alarm_attempts = alarm_attempts + 1 WHERE singleton = 1",
    );
    await this.ctx.storage.setAlarm(
      Date.now() + nextReconciliationDelayMs(attempt),
    );
  }
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function isOpaqueStagingKey(value: string) {
  return /^staging\/[A-Za-z0-9_-]{43}\.webp$/.test(value);
}
