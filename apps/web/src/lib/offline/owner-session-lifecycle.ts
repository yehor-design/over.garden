"use client";

import {
  assertOwnerOfflineActivityAllowed,
  offlineDb,
  OwnerOfflineActivityPausedError,
  pauseOwnerOfflineActivityLocally,
  publishOfflineQueueChanged,
  resumeOwnerOfflineActivityLocally,
  readLocalOwnerActivitySessionGeneration,
  setLocalOwnerActivitySessionGeneration,
  type OfflineOwnerActivity,
  type OfflineMutationStatus,
} from "./queue";
import { publishOfflineDraftsChanged } from "./drafts";
import {
  deletedOwnerComposerFingerprint,
  fingerprintOwnerComposerPayload,
  OWNER_COMPOSER_DURABILITY_PROTOCOL,
  OFFLINE_VAULT_GENERATION,
  OwnerComposerDurabilityUnconfirmedError,
} from "./owner-composer-durability";
import { readOwnerComposerEvidenceRevision } from "./owner-composer-participants";
import {
  eraseCurrentDeviceOwnerVault,
  migrateLegacyOwnerVault,
  type OwnerVaultErasureResult,
} from "./owner-vault-migration";
import {
  activateLegacyOwnerDatabaseForTesting,
  activatePhysicalOwnerVault,
  deactivatePhysicalOwnerVault,
  OWNER_VAULT_OPERATION_DEADLINE_MS,
  OwnerVaultDb,
  readActiveOwnerVaultLifetimeSignal,
  resolveOwnerOfflineDatabase,
  withOwnerVaultWriterLease,
  type OwnerOfflineDatabase,
} from "./owner-vault";
import type {
  OfflineComposerDurabilityRecord,
  OfflineDraftRecord,
  OfflineMutation,
} from "./queue";

export { OwnerOfflineActivityPausedError } from "./queue";

const OWNER_ACTIVITY_PAUSE_TTL_MS = 5 * 60_000;
const COMMIT_PENDING_RECOVERY_GRACE_MS = 10 * 60_000;
const UNSYNCED_MUTATION_STATUSES = [
  "queued",
  "syncing",
  "failed",
] as const satisfies readonly OfflineMutationStatus[];

type UnsyncedMutationStatus = (typeof UNSYNCED_MUTATION_STATUSES)[number];

export type OwnerWorkInspectionUnavailableReason =
  | "storage_unavailable"
  | "storage_read_failed"
  | "inventory_bounded"
  | "corrupt_record"
  | "blob_unavailable"
  | "flush_unconfirmed"
  | "participant_set_unstable"
  | "deadline_exceeded";

export interface OwnerWorkComposerReceipt {
  protocol: typeof OWNER_COMPOSER_DURABILITY_PROTOCOL;
  generation: number;
  disposition: "stored" | "deleted";
  storedByteLength: number;
  storedDigest: string;
  vaultGeneration: typeof OFFLINE_VAULT_GENERATION;
}

export type OwnerWorkInspectionV2 =
  | {
      status: "complete";
      inventoryComplete: true;
      inspectionRevision: string;
      vaultGeneration: typeof OFFLINE_VAULT_GENERATION;
      counts: {
        drafts: number;
        queued: number;
        syncing: number;
        failed: number;
        media: number;
        privacyBlocked: number;
      };
      composerReceipts: OwnerWorkComposerReceipt[];
    }
  | {
      status: "unavailable";
      inventoryComplete: false;
      reason: OwnerWorkInspectionUnavailableReason;
    };

export interface OwnerWorkInspectionSnapshot {
  drafts: unknown[];
  mutations: unknown[];
  composerDurability: unknown[];
  vaultGeneration: string;
  inventoryBoundContact?: boolean;
}

export interface OwnerWorkInspectionSource {
  readOwnerSnapshot(ownerUserId: string): Promise<OwnerWorkInspectionSnapshot>;
  readComposerEvidenceRevision(ownerUserId: string): number;
}

export interface OwnerWorkInspectionOptions {
  deadlineMs?: number;
  signal?: AbortSignal;
}

export interface PurgedUnsyncedOwnerData {
  draftCount: number;
  mutationCount: number;
  totalCount: number;
}

export interface OwnerOfflineActivityPauseHandle {
  readonly operationId: string;
  readonly sessionGeneration: string;
  waitForSyncDrain(): Promise<void>;
  renewPreparationLease(): Promise<void>;
  promoteToCommitFence(): Promise<void>;
  finalizeForSessionChange(): Promise<"fenced" | "generation_changed">;
  finalizeForSignedOut(): Promise<"fenced" | "generation_changed">;
  finalizeForHardReload(): Promise<void>;
  resume(): Promise<void>;
}

export type OwnerActivitySessionHydrationResult =
  | "ready"
  | "document_session_changed"
  | "blocked";

export interface OwnerOfflineActivityPauseOptions {
  operationId?: string;
  sessionGeneration?: string;
}

export interface OwnerOfflinePurgeScope {
  operationId: string;
  sessionGeneration: string;
}

interface ActiveOwnerSyncAttempt {
  controller: AbortController;
  done: Promise<void>;
}

const activeOwnerSyncAttempts = new Map<string, Set<ActiveOwnerSyncAttempt>>();
const ownerPreviewObjectUrls = new Map<string, Set<string>>();

const OWNER_WORK_INSPECTION_DEADLINE_MS = 5_000;
const MAX_OWNER_WORK_INVENTORY_NODES = 10_000;
const MAX_OWNER_WORK_INVENTORY_ROWS = 10_000;

/**
 * Production entrypoint. The canonical IndexedDB tables are read in one
 * transaction; analysis and Blob fingerprinting happen after the transaction
 * so no async byte read can leave an IndexedDB transaction half-open.
 */
export function inspectOwnerWork(
  ownerUserId: string,
  options: OwnerWorkInspectionOptions = {},
): Promise<OwnerWorkInspectionV2> {
  const database = resolveOwnerOfflineDatabase(ownerUserId);
  if (!database) {
    return Promise.resolve(unavailableOwnerWork("storage_unavailable"));
  }
  const source: OwnerWorkInspectionSource = {
    readComposerEvidenceRevision: readOwnerComposerEvidenceRevision,
    readOwnerSnapshot: async (owner) => {
      const [drafts, mutations, composerDurability] =
        await database.transaction(
          "r",
          database.drafts,
          database.mutations,
          database.composerDurability,
          () =>
            Promise.all([
              database.drafts
                .where("ownerUserId")
                .equals(owner)
                .limit(MAX_OWNER_WORK_INVENTORY_ROWS)
                .toArray(),
              database.mutations
                .where("ownerUserId")
                .equals(owner)
                .limit(MAX_OWNER_WORK_INVENTORY_ROWS)
                .toArray(),
              database.composerDurability
                .where("ownerUserId")
                .equals(owner)
                .limit(MAX_OWNER_WORK_INVENTORY_ROWS)
                .toArray(),
            ]),
        );
      return {
        drafts,
        mutations,
        composerDurability,
        vaultGeneration: OFFLINE_VAULT_GENERATION,
        inventoryBoundContact:
          drafts.length >= MAX_OWNER_WORK_INVENTORY_ROWS ||
          mutations.length >= MAX_OWNER_WORK_INVENTORY_ROWS ||
          composerDurability.length >= MAX_OWNER_WORK_INVENTORY_ROWS,
      };
    },
  };
  return inspectOwnerWorkFromSource(ownerUserId, source, options);
}

/**
 * Contract seam for deterministic storage, deadline, and race proofs. Product
 * callers use `inspectOwnerWork`; this function exposes no UI/runtime toggle.
 */
export async function inspectOwnerWorkFromSource(
  ownerUserId: string,
  source: OwnerWorkInspectionSource | null,
  options: OwnerWorkInspectionOptions = {},
): Promise<OwnerWorkInspectionV2> {
  const owner = requireOwnerUserId(ownerUserId);
  if (!source) return unavailableOwnerWork("storage_unavailable");
  if (options.signal?.aborted) {
    return unavailableOwnerWork("participant_set_unstable");
  }
  const deadlineMs = Math.max(
    1,
    Math.min(
      OWNER_WORK_INSPECTION_DEADLINE_MS,
      Math.floor(options.deadlineMs ?? OWNER_WORK_INSPECTION_DEADLINE_MS),
    ),
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<OwnerWorkInspectionV2>((resolve) => {
    timeout = setTimeout(
      () => resolve(unavailableOwnerWork("deadline_exceeded")),
      deadlineMs,
    );
  });
  let abortListener: (() => void) | undefined;
  const cancellation = options.signal
    ? new Promise<OwnerWorkInspectionV2>((resolve) => {
        const settleCancelled = () =>
          resolve(unavailableOwnerWork("participant_set_unstable"));
        abortListener = settleCancelled;
        options.signal?.addEventListener("abort", settleCancelled, {
          once: true,
        });
        // Close the narrow race between the initial check and listener
        // registration. AbortSignal does not replay an already-fired event.
        if (options.signal?.aborted) settleCancelled();
      })
    : undefined;
  const inspection = inspectOwnerWorkSourceOperation(
    owner,
    source,
    options.signal,
  ).catch((error) => unavailableOwnerWork(mapInspectionFailure(error)));

  try {
    return await Promise.race(
      cancellation
        ? [inspection, deadline, cancellation]
        : [inspection, deadline],
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (abortListener) {
      options.signal?.removeEventListener("abort", abortListener);
    }
  }
}

async function inspectOwnerWorkSourceOperation(
  ownerUserId: string,
  source: OwnerWorkInspectionSource,
  signal?: AbortSignal,
): Promise<OwnerWorkInspectionV2> {
  const initialRevision = source.readComposerEvidenceRevision(ownerUserId);
  assertInspectionCurrent(ownerUserId, initialRevision, source, signal);
  const snapshot = await source.readOwnerSnapshot(ownerUserId);
  assertInspectionCurrent(ownerUserId, initialRevision, source, signal);
  const result = await analyzeOwnerWorkSnapshot(ownerUserId, snapshot, () =>
    assertInspectionCurrent(ownerUserId, initialRevision, source, signal),
  );
  assertInspectionCurrent(ownerUserId, initialRevision, source, signal);
  return result;
}

async function analyzeOwnerWorkSnapshot(
  ownerUserId: string,
  snapshot: OwnerWorkInspectionSnapshot,
  assertCurrent: () => void,
): Promise<OwnerWorkInspectionV2> {
  if (
    !snapshot ||
    !Array.isArray(snapshot.drafts) ||
    !Array.isArray(snapshot.mutations) ||
    !Array.isArray(snapshot.composerDurability) ||
    (snapshot.inventoryBoundContact !== undefined &&
      typeof snapshot.inventoryBoundContact !== "boolean") ||
    snapshot.vaultGeneration !== OFFLINE_VAULT_GENERATION
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }
  if (
    snapshot.inventoryBoundContact ||
    snapshot.drafts.length +
      snapshot.mutations.length +
      snapshot.composerDurability.length >=
      MAX_OWNER_WORK_INVENTORY_ROWS
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError("inventory_bounded");
  }

  const drafts = snapshot.drafts.map((record) =>
    requireInspectionDraft(record, ownerUserId),
  );
  const mutations = snapshot.mutations.map((record) =>
    requireInspectionMutation(record, ownerUserId),
  );
  const durabilityRecords = snapshot.composerDurability.map((record) =>
    requireInspectionDurabilityRecord(record, ownerUserId),
  );
  const receiptByDraftId = new Map<string, OfflineComposerDurabilityRecord>();
  for (const receipt of durabilityRecords) {
    if (receiptByDraftId.has(receipt.draftId)) {
      throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
    }
    receiptByDraftId.set(receipt.draftId, receipt);
  }
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
  if (draftById.size !== drafts.length) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }

  const statusCounts = { queued: 0, syncing: 0, failed: 0 };
  let privacyBlocked = 0;
  const payloads: unknown[] = drafts.map((draft) => draft.payload);
  for (const mutation of mutations) {
    if (mutation.status === "synced") {
      // Accepted payloads are not owner work anymore and remain deliberately
      // outside content/Blob enumeration. Count the privacy fence, not content.
      privacyBlocked += 1;
      continue;
    }
    statusCounts[mutation.status] += 1;
    payloads.push(mutation.payload);
  }
  const media = countOwnerWorkMedia(payloads);

  for (const draft of drafts) {
    const receipt = receiptByDraftId.get(draft.id);
    if (!receipt || receipt.disposition !== "stored") {
      throw new OwnerComposerDurabilityUnconfirmedError("flush_unconfirmed");
    }
    const fingerprint = await fingerprintOwnerComposerPayload(draft.payload);
    assertCurrent();
    if (
      fingerprint.storedByteLength !== receipt.storedByteLength ||
      fingerprint.storedDigest !== receipt.storedDigest
    ) {
      throw new OwnerComposerDurabilityUnconfirmedError("flush_unconfirmed");
    }
  }

  const deletedFingerprint = await deletedOwnerComposerFingerprint();
  assertCurrent();
  for (const receipt of durabilityRecords) {
    const draft = draftById.get(receipt.draftId);
    if (receipt.disposition === "stored" && !draft) {
      throw new OwnerComposerDurabilityUnconfirmedError("flush_unconfirmed");
    }
    if (
      receipt.disposition === "deleted" &&
      (draft ||
        receipt.storedByteLength !== deletedFingerprint.storedByteLength ||
        receipt.storedDigest !== deletedFingerprint.storedDigest)
    ) {
      throw new OwnerComposerDurabilityUnconfirmedError("flush_unconfirmed");
    }
  }

  assertCurrent();
  return {
    status: "complete",
    inventoryComplete: true,
    inspectionRevision: createOwnerWorkInspectionRevision(),
    vaultGeneration: OFFLINE_VAULT_GENERATION,
    counts: {
      drafts: drafts.length,
      queued: statusCounts.queued,
      syncing: statusCounts.syncing,
      failed: statusCounts.failed,
      media,
      privacyBlocked,
    },
    composerReceipts: [...durabilityRecords]
      .sort((left, right) => left.draftId.localeCompare(right.draftId))
      .map((receipt) => ({
        protocol: receipt.protocol,
        generation: receipt.generation,
        disposition: receipt.disposition,
        storedByteLength: receipt.storedByteLength,
        storedDigest: receipt.storedDigest,
        vaultGeneration: receipt.vaultGeneration,
      })),
  };
}

function requireInspectionDraft(
  value: unknown,
  ownerUserId: string,
): OfflineDraftRecord {
  if (!isRecord(value)) inspectionCorrupt();
  const record = value as Partial<OfflineDraftRecord>;
  if (
    record.ownerUserId !== ownerUserId ||
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    record.id.length > 256 ||
    !["first_entry", "follow_up_entry", "space_entry"].includes(
      String(record.kind),
    ) ||
    !("payload" in record) ||
    !Number.isFinite(record.createdAt) ||
    !Number.isFinite(record.updatedAt)
  ) {
    inspectionCorrupt();
  }
  return record as OfflineDraftRecord;
}

function requireInspectionMutation(
  value: unknown,
  ownerUserId: string,
): OfflineMutation {
  if (!isRecord(value)) inspectionCorrupt();
  const record = value as Partial<OfflineMutation>;
  if (
    record.ownerUserId !== ownerUserId ||
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    record.id.length > 256 ||
    !["journal_entry", "photo_upload"].includes(String(record.kind)) ||
    !["queued", "syncing", "failed", "synced"].includes(
      String(record.status),
    ) ||
    !("payload" in record) ||
    typeof record.idempotencyKey !== "string" ||
    !Number.isFinite(record.createdAt) ||
    !Number.isFinite(record.updatedAt)
  ) {
    inspectionCorrupt();
  }
  return record as OfflineMutation;
}

function requireInspectionDurabilityRecord(
  value: unknown,
  ownerUserId: string,
): OfflineComposerDurabilityRecord {
  if (!isRecord(value)) inspectionCorrupt();
  const record = value as Partial<OfflineComposerDurabilityRecord>;
  if (
    record.ownerUserId !== ownerUserId ||
    typeof record.draftId !== "string" ||
    record.draftId.length === 0 ||
    record.draftId.length > 256 ||
    record.protocol !== OWNER_COMPOSER_DURABILITY_PROTOCOL ||
    typeof record.participantNonce !== "string" ||
    record.participantNonce.length < 16 ||
    record.participantNonce.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(record.participantNonce) ||
    !Number.isSafeInteger(record.generation) ||
    (record.generation ?? 0) < 1 ||
    (record.disposition !== "stored" && record.disposition !== "deleted") ||
    !Number.isSafeInteger(record.storedByteLength) ||
    (record.storedByteLength ?? -1) < 0 ||
    typeof record.storedDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.storedDigest) ||
    record.vaultGeneration !== OFFLINE_VAULT_GENERATION ||
    !Number.isFinite(record.updatedAt)
  ) {
    inspectionCorrupt();
  }
  return record as OfflineComposerDurabilityRecord;
}

function countOwnerWorkMedia(roots: unknown[]): number {
  if (typeof Blob === "undefined") {
    throw new OwnerComposerDurabilityUnconfirmedError("blob_unavailable");
  }
  const seen = new WeakSet<object>();
  const pending: unknown[] = [...roots];
  let visited = 0;
  let media = 0;
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    visited += 1;
    if (visited >= MAX_OWNER_WORK_INVENTORY_NODES) {
      throw new OwnerComposerDurabilityUnconfirmedError("inventory_bounded");
    }
    if (value instanceof Blob) {
      media += 1;
      continue;
    }
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor)) {
        throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
      }
      pending.push(descriptor.value);
    }
  }
  return media;
}

function assertInspectionCurrent(
  ownerUserId: string,
  expectedRevision: number,
  source: OwnerWorkInspectionSource,
  signal?: AbortSignal,
) {
  if (
    signal?.aborted ||
    source.readComposerEvidenceRevision(ownerUserId) !== expectedRevision
  ) {
    throw new InspectionParticipantSetUnstableError();
  }
}

function mapInspectionFailure(
  error: unknown,
): OwnerWorkInspectionUnavailableReason {
  if (error instanceof InspectionParticipantSetUnstableError) {
    return "participant_set_unstable";
  }
  if (error instanceof OwnerComposerDurabilityUnconfirmedError) {
    if (error.reason === "storage_unavailable") return "storage_unavailable";
    if (error.reason === "inventory_bounded") return "inventory_bounded";
    if (error.reason === "corrupt_record") return "corrupt_record";
    if (error.reason === "blob_unavailable") return "blob_unavailable";
    return "flush_unconfirmed";
  }
  return "storage_read_failed";
}

function unavailableOwnerWork(
  reason: OwnerWorkInspectionUnavailableReason,
): OwnerWorkInspectionV2 {
  return { status: "unavailable", inventoryComplete: false, reason };
}

function createOwnerWorkInspectionRevision() {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new OwnerComposerDurabilityUnconfirmedError("storage_unavailable");
  }
  return crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectionCorrupt(): never {
  throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
}

class InspectionParticipantSetUnstableError extends Error {}

export async function hydrateOwnerOfflineActivitySession(
  ownerUserId: string,
  sessionGeneration: string,
  ownerVaultBinding?: string,
  options: { signal?: AbortSignal } = {},
): Promise<OwnerActivitySessionHydrationResult> {
  throwIfOwnerVaultHydrationCancelled(options.signal);
  const owner = requireOwnerUserId(ownerUserId);
  const generation = requireSessionGeneration(sessionGeneration);
  const localGeneration = readLocalOwnerActivitySessionGeneration(owner);
  if (localGeneration && localGeneration !== generation) {
    return "document_session_changed";
  }

  let database: OwnerOfflineDatabase | undefined;
  if (ownerVaultBinding) {
    let migrationTarget: OwnerVaultDb | null = null;
    try {
      let migration:
        | Awaited<ReturnType<typeof migrateLegacyOwnerVault>>
        | undefined;
      if (offlineDb) {
        const legacySource = offlineDb;
        // Do not install the target in the ordinary owner resolver until copy
        // plus independent reopen/read-back has succeeded.
        migrationTarget = new OwnerVaultDb(ownerVaultBinding);
        await migrationTarget.open();
        throwIfOwnerVaultHydrationCancelled(options.signal);
        const migrationController = new AbortController();
        const abortMigration = () => migrationController.abort();
        options.signal?.addEventListener("abort", abortMigration, {
          once: true,
        });
        if (options.signal?.aborted) abortMigration();
        const migrationDeadline = globalThis.setTimeout(
          () => migrationController.abort(),
          OWNER_VAULT_OPERATION_DEADLINE_MS,
        );
        migration = await migrateLegacyOwnerVault(
          {
            ownerUserId: owner,
            binding: ownerVaultBinding,
            source: legacySource,
            target: migrationTarget,
          },
          { signal: migrationController.signal },
        ).finally(() => {
          globalThis.clearTimeout(migrationDeadline);
          options.signal?.removeEventListener("abort", abortMigration);
        });
        migrationTarget.close();
        migrationTarget = null;
        throwIfOwnerVaultHydrationCancelled(options.signal);
        if (migration.status !== "activated") {
          await deactivatePhysicalOwnerVault(owner);
          setLocalOwnerActivitySessionGeneration(owner, generation);
          return "ready";
        }
      }
      const physical = await activatePhysicalOwnerVault(
        owner,
        ownerVaultBinding,
      );
      throwIfOwnerVaultHydrationCancelled(options.signal);
      if (offlineDb && migration) {
        const legacySource = offlineDb;
        if (
          !migration.sourceCleanupConfirmed &&
          process.env.NODE_ENV !== "test"
        ) {
          const lifetimeSignal = readActiveOwnerVaultLifetimeSignal(
            owner,
            ownerVaultBinding,
          );
          if (!lifetimeSignal) throw new Error("Owner vault lifetime missing.");
          const cancelScheduledCleanup = () =>
            globalThis.clearTimeout(cleanupTimer);
          const cleanupTimer = globalThis.setTimeout(() => {
            lifetimeSignal.removeEventListener("abort", cancelScheduledCleanup);
            if (lifetimeSignal.aborted) return;
            const cleanupController = new AbortController();
            const abortCleanup = () => cleanupController.abort();
            lifetimeSignal.addEventListener("abort", abortCleanup, {
              once: true,
            });
            const cleanupDeadline = globalThis.setTimeout(
              () => cleanupController.abort(),
              OWNER_VAULT_OPERATION_DEADLINE_MS,
            );
            void migrateLegacyOwnerVault(
              {
                ownerUserId: owner,
                binding: ownerVaultBinding,
                source: legacySource,
                target: physical,
              },
              {
                cleanupMode: "background",
                signal: cleanupController.signal,
              },
            )
              .catch(() => undefined)
              .finally(() => {
                globalThis.clearTimeout(cleanupDeadline);
                lifetimeSignal.removeEventListener("abort", abortCleanup);
              });
          }, 1_000);
          lifetimeSignal.addEventListener("abort", cancelScheduledCleanup, {
            once: true,
          });
        }
      }
      database = physical;
    } catch {
      migrationTarget?.close();
      await deactivatePhysicalOwnerVault(owner);
      setLocalOwnerActivitySessionGeneration(owner, generation);
      return "ready";
    }
  } else if (process.env.NODE_ENV === "test" && offlineDb) {
    activateLegacyOwnerDatabaseForTesting(owner, offlineDb);
    database = offlineDb;
  } else {
    await deactivatePhysicalOwnerVault(owner);
  }
  if (!database) {
    setLocalOwnerActivitySessionGeneration(owner, generation);
    return "ready";
  }

  throwIfOwnerVaultHydrationCancelled(options.signal);
  const result = await withOwnerVaultWriterLease(owner, (activeDatabase) =>
    activeDatabase.transaction("rw", activeDatabase.ownerActivity, async () => {
      const stored = normalizeStoredOwnerActivity(
        await activeDatabase.ownerActivity.get(owner),
      );
      if (!stored || stored.sessionGeneration !== generation) {
        await activeDatabase.ownerActivity.put(
          createActiveOwnerActivity(owner, generation),
        );
        return "ready" as const;
      }

      if (stored.lifecycle === "signed_out_fence") {
        return "blocked" as const;
      }

      // This function is called only after a fresh authoritative session read.
      // If the same session is still active after the bounded commit grace,
      // an orphaned pre-POST fence can be recovered; ordinary write paths never
      // prune commit_pending protection on their own.
      const activeOperations = stored.operations
        .filter((operation) => operation.expiresAt > Date.now())
        .map((operation) => ({ ...operation }));
      if (activeOperations.length !== stored.operations.length) {
        await activeDatabase.ownerActivity.put({
          ...stored,
          operations: activeOperations,
          updatedAt: Date.now(),
          expiresAt: ownerActivityExpiry(activeOperations),
        });
      }
      return activeOperations.length > 0
        ? ("blocked" as const)
        : ("ready" as const);
    }),
  );

  if (options.signal?.aborted) {
    await deactivatePhysicalOwnerVault(owner);
    return "ready";
  }
  setLocalOwnerActivitySessionGeneration(owner, generation);
  return result;
}

export async function finalizeOwnerOfflineActivityForSignedOut(
  ownerUserId: string,
  sessionGeneration: string,
): Promise<"fenced" | "generation_changed"> {
  const owner = requireOwnerUserId(ownerUserId);
  const generation = requireSessionGeneration(sessionGeneration);
  const database = resolveOwnerOfflineDatabase(owner);
  if (!database) return "fenced";

  try {
    return await withOwnerVaultWriterLease(owner, (activeDatabase) =>
      activeDatabase.transaction(
        "rw",
        activeDatabase.ownerActivity,
        async () => {
          const activity = normalizeStoredOwnerActivity(
            await activeDatabase.ownerActivity.get(owner),
          );
          if (activity && activity.sessionGeneration !== generation) {
            // A newer authoritative document already installed generation B.
            // Never overwrite it with A's fence, but A is still safely unable
            // to write and may complete its hard navigation.
            return "generation_changed" as const;
          }
          if (
            activity?.lifecycle === "signed_out_fence" &&
            activity.sessionGeneration === generation
          ) {
            return "fenced" as const;
          }
          await activeDatabase.ownerActivity.put({
            ...(activity ?? createActiveOwnerActivity(owner, generation)),
            lifecycle: "signed_out_fence",
            operations: [],
            updatedAt: Date.now(),
            expiresAt: Number.MAX_SAFE_INTEGER,
          });
          return "fenced" as const;
        },
      ),
    );
  } finally {
    if (database instanceof OwnerVaultDb) {
      await deactivatePhysicalOwnerVault(owner);
    }
  }
}

export async function finalizeOwnerOfflineActivityForSessionChange(
  ownerUserId: string,
  sessionGeneration: string,
): Promise<"fenced" | "generation_changed"> {
  const owner = requireOwnerUserId(ownerUserId);
  const generation = requireSessionGeneration(sessionGeneration);
  const database = resolveOwnerOfflineDatabase(owner);
  if (!database) return "fenced";

  try {
    return await withOwnerVaultWriterLease(owner, (activeDatabase) =>
      activeDatabase.transaction(
        "rw",
        activeDatabase.ownerActivity,
        async () => {
          const activity = normalizeStoredOwnerActivity(
            await activeDatabase.ownerActivity.get(owner),
          );
          if (activity && activity.sessionGeneration !== generation) {
            return "generation_changed" as const;
          }
          await activeDatabase.ownerActivity.put({
            ...(activity ?? createActiveOwnerActivity(owner, generation)),
            lifecycle: "signed_out_fence",
            operations: [],
            updatedAt: Date.now(),
            expiresAt: Number.MAX_SAFE_INTEGER,
          });
          return "fenced" as const;
        },
      ),
    );
  } finally {
    if (database instanceof OwnerVaultDb) {
      await deactivatePhysicalOwnerVault(owner);
    }
  }
}

export async function pauseOwnerOfflineActivity(
  ownerUserId: string,
  options: OwnerOfflineActivityPauseOptions = {},
): Promise<OwnerOfflineActivityPauseHandle> {
  const owner = requireOwnerUserId(ownerUserId);
  const operationId = requireOperationId(
    options.operationId ?? `op-${crypto.randomUUID()}`,
  );
  const sessionGeneration = options.sessionGeneration
    ? requireSessionGeneration(options.sessionGeneration)
    : readLocalOwnerActivitySessionGeneration(owner);
  if (!sessionGeneration) {
    throw new OwnerOfflineActivityPausedError();
  }

  const pausedAt = Date.now();
  const database = resolveOwnerOfflineDatabase(owner);
  pauseOwnerOfflineActivityLocally(owner, operationId);

  try {
    if (database) {
      await withOwnerVaultWriterLease(owner, (activeDatabase) =>
        activeDatabase.transaction(
          "rw",
          activeDatabase.ownerActivity,
          async () => {
            const storedActivity = normalizeStoredOwnerActivity(
              await activeDatabase.ownerActivity.get(owner),
            );
            const activity =
              storedActivity ??
              createActiveOwnerActivity(owner, sessionGeneration);
            if (
              activity.sessionGeneration !== sessionGeneration ||
              activity.lifecycle !== "active"
            ) {
              throw new OwnerOfflineActivityPausedError();
            }
            const operations = activeOwnerOperations(activity).filter(
              (operation) => operation.operationId !== operationId,
            );
            operations.push({
              operationId,
              phase: "preparing",
              expiresAt: pausedAt + OWNER_ACTIVITY_PAUSE_TTL_MS,
            });
            await activeDatabase.ownerActivity.put({
              ...activity,
              operations,
              updatedAt: pausedAt,
              expiresAt: ownerActivityExpiry(operations),
            });
          },
        ),
      );
    }
  } catch (error) {
    resumeOwnerOfflineActivityLocally(owner, operationId);
    throw error;
  }

  abortOwnerSyncAttempts(owner);
  let resumed = false;
  let commitFencePromoted = false;
  let signedOutFinalization: "fenced" | "generation_changed" | null = null;
  let hardReloadFinalized = false;

  const mutateOwnedOperation = async (
    mutation: "remove" | "renew" | "promote",
  ) => {
    if (!database) return;
    await withOwnerVaultWriterLease(owner, (activeDatabase) =>
      activeDatabase.transaction(
        "rw",
        activeDatabase.ownerActivity,
        async () => {
          const activity = normalizeStoredOwnerActivity(
            await activeDatabase.ownerActivity.get(owner),
          );
          if (!activity || activity.sessionGeneration !== sessionGeneration) {
            throw new OwnerOfflineActivityPausedError();
          }
          if (activity.lifecycle === "signed_out_fence") return;

          const operations = activeOwnerOperations(activity);
          if (mutation === "promote" || mutation === "renew") {
            const ownedOperation = operations.find(
              (operation) => operation.operationId === operationId,
            );
            if (!ownedOperation) throw new OwnerOfflineActivityPausedError();
            if (mutation === "promote") {
              ownedOperation.phase = "commit_pending";
              ownedOperation.expiresAt =
                Date.now() + COMMIT_PENDING_RECOVERY_GRACE_MS;
            } else if (ownedOperation.phase === "preparing") {
              ownedOperation.expiresAt =
                Date.now() + OWNER_ACTIVITY_PAUSE_TTL_MS;
            }
          } else {
            const filtered = operations.filter(
              (operation) => operation.operationId !== operationId,
            );
            operations.splice(0, operations.length, ...filtered);
          }
          await activeDatabase.ownerActivity.put({
            ...activity,
            operations,
            updatedAt: Date.now(),
            expiresAt: ownerActivityExpiry(operations),
          });
        },
      ),
    );
  };

  return {
    operationId,
    sessionGeneration,
    waitForSyncDrain: () => waitForOwnerSyncDrain(owner),
    renewPreparationLease: () => mutateOwnedOperation("renew"),
    promoteToCommitFence: async () => {
      if (commitFencePromoted || signedOutFinalization) return;
      await mutateOwnedOperation("promote");
      commitFencePromoted = true;
    },
    finalizeForSessionChange: () =>
      finalizeOwnerOfflineActivityForSessionChange(owner, sessionGeneration),
    finalizeForSignedOut: async () => {
      if (signedOutFinalization) return signedOutFinalization;
      signedOutFinalization = await finalizeOwnerOfflineActivityForSignedOut(
        owner,
        sessionGeneration,
      );
      return signedOutFinalization;
    },
    finalizeForHardReload: async () => {
      if (hardReloadFinalized) return;
      await mutateOwnedOperation("remove");
      hardReloadFinalized = true;
    },
    resume: async () => {
      if (resumed) return;
      let resumeError: unknown;
      try {
        await mutateOwnedOperation("remove");
        resumed = true;
      } catch (error) {
        resumeError = error;
      } finally {
        resumeOwnerOfflineActivityLocally(owner, operationId);
      }
      if (resumeError) throw resumeError;
    },
  };
}

export function abortOwnerSyncAttempts(ownerUserId: string): number {
  const owner = requireOwnerUserId(ownerUserId);
  const attempts = activeOwnerSyncAttempts.get(owner);
  if (!attempts) return 0;

  let aborted = 0;
  for (const attempt of attempts) {
    if (!attempt.controller.signal.aborted) {
      attempt.controller.abort();
      aborted += 1;
    }
  }
  return aborted;
}

export async function runOwnerSyncAttempt<T>(
  ownerUserId: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const owner = requireOwnerUserId(ownerUserId);
  await assertOwnerActivityAllowedForSync(owner);

  const controller = new AbortController();
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const attempt: ActiveOwnerSyncAttempt = { controller, done };
  const attempts = activeOwnerSyncAttempts.get(owner) ?? new Set();
  attempts.add(attempt);
  activeOwnerSyncAttempts.set(owner, attempts);

  try {
    // The first check can yield while reading the cross-tab TTL record. Register
    // the controller, then check again so a pause that completed during that
    // window either aborts this attempt or fails it before any network work.
    await assertOwnerActivityAllowedForSync(owner);
    if (controller.signal.aborted) {
      throw new OwnerOfflineActivityPausedError();
    }
    return await run(controller.signal);
  } finally {
    attempts.delete(attempt);
    if (attempts.size === 0) activeOwnerSyncAttempts.delete(owner);
    resolveDone?.();
  }
}

export async function purgeUnsyncedOwnerData(
  ownerUserId: string,
  scope: OwnerOfflinePurgeScope,
): Promise<PurgedUnsyncedOwnerData> {
  const owner = requireOwnerUserId(ownerUserId);
  const sessionGeneration = requireSessionGeneration(scope.sessionGeneration);
  const operationId = requireOperationId(scope.operationId);
  const database = resolveOwnerOfflineDatabase(owner);
  if (!database) {
    revokeOwnerPreviewObjectUrls(owner);
    return { draftCount: 0, mutationCount: 0, totalCount: 0 };
  }

  const result = await withOwnerVaultWriterLease(owner, (activeDatabase) =>
    activeDatabase.transaction(
      "rw",
      [
        activeDatabase.drafts,
        activeDatabase.draftSummaries,
        activeDatabase.composerDurability,
        activeDatabase.mutations,
        activeDatabase.mutationSummaries,
        activeDatabase.ownerActivity,
      ],
      async () => {
        await assertOwnedActivityScope(activeDatabase, owner, {
          operationId,
          sessionGeneration,
        });
        const draftCount = await activeDatabase.drafts
          .where("ownerUserId")
          .equals(owner)
          .delete();
        await activeDatabase.draftSummaries
          .where("ownerUserId")
          .equals(owner)
          .delete();
        await activeDatabase.composerDurability
          .where("ownerUserId")
          .equals(owner)
          .delete();
        let mutationCount = 0;

        for (const status of UNSYNCED_MUTATION_STATUSES) {
          mutationCount += await activeDatabase.mutations
            .where("[ownerUserId+status]")
            .equals([owner, status])
            .delete();
        }
        await activeDatabase.mutationSummaries
          .where("ownerUserId")
          .equals(owner)
          .and((summary) =>
            UNSYNCED_MUTATION_STATUSES.includes(
              summary.status as UnsyncedMutationStatus,
            ),
          )
          .delete();

        return {
          draftCount,
          mutationCount,
          totalCount: draftCount + mutationCount,
        };
      },
    ),
  );

  revokeOwnerPreviewObjectUrls(owner);
  publishOfflineDraftsChanged();
  publishOfflineQueueChanged();
  return result;
}

/**
 * OVE-192 same-device cleanup after account erasure or cross-owner residual
 * drafts: purge every draft/mutation/activity row for the erased owner id,
 * including cover photo intents/Blobs, without requiring a live session fence.
 */
export async function purgeErasedOwnerOfflineStore(
  ownerUserId: string,
): Promise<PurgedUnsyncedOwnerData> {
  const owner = requireOwnerUserId(ownerUserId);
  const database = offlineDb;
  if (!database) {
    revokeOwnerPreviewObjectUrls(owner);
    return { draftCount: 0, mutationCount: 0, totalCount: 0 };
  }

  const result = await database.transaction(
    "rw",
    [
      database.drafts,
      database.draftSummaries,
      database.composerDurability,
      database.mutations,
      database.mutationSummaries,
      database.ownerActivity,
    ],
    async () => {
      const draftCount = await database.drafts
        .where("ownerUserId")
        .equals(owner)
        .delete();
      await database.draftSummaries.where("ownerUserId").equals(owner).delete();
      await database.composerDurability
        .where("ownerUserId")
        .equals(owner)
        .delete();
      const mutationCount = await database.mutations
        .where("ownerUserId")
        .equals(owner)
        .delete();
      await database.mutationSummaries
        .where("ownerUserId")
        .equals(owner)
        .delete();
      await database.ownerActivity.delete(owner);
      return {
        draftCount,
        mutationCount,
        totalCount: draftCount + mutationCount,
      };
    },
  );

  revokeOwnerPreviewObjectUrls(owner);
  publishOfflineDraftsChanged();
  publishOfflineQueueChanged();
  const remainingLegacyRows = await Promise.all([
    database.drafts.where("ownerUserId").equals(owner).count(),
    database.draftSummaries.where("ownerUserId").equals(owner).count(),
    database.composerDurability.where("ownerUserId").equals(owner).count(),
    database.mutations.where("ownerUserId").equals(owner).count(),
    database.mutationSummaries.where("ownerUserId").equals(owner).count(),
    database.ownerActivity.where("ownerUserId").equals(owner).count(),
  ]);
  if (remainingLegacyRows.some((count) => count !== 0)) {
    throw new Error(
      "Owner vault erasure could not confirm device-local absence.",
    );
  }
  return result;
}

export async function eraseCurrentDeviceOwnerOfflineStore(
  ownerUserId: string,
  binding: string,
): Promise<OwnerVaultErasureResult> {
  const owner = requireOwnerUserId(ownerUserId);
  if (!offlineDb) {
    return { status: "erasure_unconfirmed", durationMs: 0 };
  }
  const controller = new AbortController();
  let deadline: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timedOut = new Promise<OwnerVaultErasureResult>((resolve) => {
    deadline = globalThis.setTimeout(() => {
      controller.abort();
      resolve({
        status: "erasure_unconfirmed",
        durationMs: OWNER_VAULT_OPERATION_DEADLINE_MS,
      });
    }, OWNER_VAULT_OPERATION_DEADLINE_MS);
  });
  const operation = eraseCurrentDeviceOwnerVault(
    { ownerUserId: owner, binding, legacy: offlineDb },
    { signal: controller.signal },
  );
  const result = await Promise.race([operation, timedOut]);
  if (deadline !== undefined) globalThis.clearTimeout(deadline);
  revokeOwnerPreviewObjectUrls(owner);
  publishOfflineDraftsChanged();
  publishOfflineQueueChanged();
  return result;
}

export function registerOwnerPreviewObjectUrl(
  ownerUserId: string,
  objectUrl: string,
): () => void {
  const owner = requireOwnerUserId(ownerUserId);
  if (!objectUrl.startsWith("blob:")) {
    throw new Error("Offline previews require a Blob object URL.");
  }

  const urls = ownerPreviewObjectUrls.get(owner) ?? new Set<string>();
  urls.add(objectUrl);
  ownerPreviewObjectUrls.set(owner, urls);

  return () => {
    urls.delete(objectUrl);
    if (urls.size === 0) ownerPreviewObjectUrls.delete(owner);
  };
}

async function assertOwnerActivityAllowedForSync(ownerUserId: string) {
  try {
    await withOwnerVaultWriterLease(ownerUserId, () =>
      assertOwnerOfflineActivityAllowed(ownerUserId),
    );
  } catch (error) {
    if (error instanceof OwnerOfflineActivityPausedError) throw error;

    // Direct online submission remains available when IndexedDB itself is
    // blocked. A locally initiated pause is checked before database access, and
    // a persisted cross-tab pause is surfaced by the typed error above.
  }
}

async function waitForOwnerSyncDrain(ownerUserId: string): Promise<void> {
  while (true) {
    const attempts = activeOwnerSyncAttempts.get(ownerUserId);
    if (!attempts || attempts.size === 0) return;
    await Promise.allSettled([...attempts].map((attempt) => attempt.done));
  }
}

function revokeOwnerPreviewObjectUrls(ownerUserId: string) {
  const urls = ownerPreviewObjectUrls.get(ownerUserId);
  if (!urls) return;

  for (const objectUrl of urls) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // IndexedDB deletion is the safety boundary. Revocation is best effort
      // for already-created in-memory previews in the current document.
    }
  }
  ownerPreviewObjectUrls.delete(ownerUserId);
}

function createActiveOwnerActivity(
  ownerUserId: string,
  sessionGeneration: string,
): OfflineOwnerActivity {
  const now = Date.now();
  return {
    ownerUserId,
    sessionGeneration,
    lifecycle: "active",
    operations: [],
    updatedAt: now,
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
}

async function assertOwnedActivityScope(
  database: OwnerOfflineDatabase,
  ownerUserId: string,
  scope: OwnerOfflinePurgeScope,
) {
  const sessionGeneration = requireSessionGeneration(scope.sessionGeneration);
  const operationId = requireOperationId(scope.operationId);
  const activity = normalizeStoredOwnerActivity(
    await database.ownerActivity.get(ownerUserId),
  );
  const ownedOperation = activity?.operations.find(
    (operation) => operation.operationId === operationId,
  );
  if (
    !activity ||
    activity.lifecycle !== "active" ||
    activity.sessionGeneration !== sessionGeneration ||
    !ownedOperation ||
    (ownedOperation.phase === "preparing" &&
      ownedOperation.expiresAt <= Date.now())
  ) {
    throw new OwnerOfflineActivityPausedError();
  }
}

function normalizeStoredOwnerActivity(
  value: unknown,
): OfflineOwnerActivity | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OfflineOwnerActivity> & {
    pauseToken?: unknown;
    pausedAt?: unknown;
  };
  if (
    typeof candidate.sessionGeneration === "string" &&
    isOpaqueBoundedValue(candidate.sessionGeneration) &&
    (candidate.lifecycle === "active" ||
      candidate.lifecycle === "signed_out_fence") &&
    Array.isArray(candidate.operations)
  ) {
    return {
      ownerUserId: requireOwnerUserId(String(candidate.ownerUserId ?? "")),
      sessionGeneration: candidate.sessionGeneration,
      lifecycle: candidate.lifecycle,
      operations: candidate.operations.filter((operation) => {
        if (!operation || typeof operation !== "object") return false;
        const item = operation as OfflineOwnerActivity["operations"][number];
        return (
          isOpaqueBoundedValue(item.operationId) &&
          (item.phase === "preparing" || item.phase === "commit_pending") &&
          typeof item.expiresAt === "number" &&
          Number.isFinite(item.expiresAt)
        );
      }),
      updatedAt:
        typeof candidate.updatedAt === "number" &&
        Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : Date.now(),
      expiresAt:
        typeof candidate.expiresAt === "number" &&
        Number.isFinite(candidate.expiresAt)
          ? candidate.expiresAt
          : Number.MAX_SAFE_INTEGER,
    };
  }

  // A v4 pause row may remain after an interrupted pre-OVE-204 page. Preserve
  // its fail-closed TTL rather than treating it as an active modern session.
  if (
    typeof candidate.pauseToken === "string" &&
    typeof candidate.expiresAt === "number" &&
    candidate.expiresAt > Date.now()
  ) {
    const legacyOperationId = `legacy-${candidate.pauseToken}`.slice(0, 128);
    return {
      ownerUserId: requireOwnerUserId(String(candidate.ownerUserId ?? "")),
      sessionGeneration: legacyOperationId,
      lifecycle: "active",
      operations: [
        {
          operationId: legacyOperationId,
          phase: "preparing",
          expiresAt: candidate.expiresAt,
        },
      ],
      updatedAt:
        typeof candidate.pausedAt === "number"
          ? candidate.pausedAt
          : Date.now(),
      expiresAt: candidate.expiresAt,
    };
  }
  return null;
}

function activeOwnerOperations(activity: OfflineOwnerActivity) {
  const now = Date.now();
  return activity.operations
    .filter(
      (operation) =>
        operation.phase === "commit_pending" || operation.expiresAt > now,
    )
    .map((operation) => ({ ...operation }));
}

function ownerActivityExpiry(operations: OfflineOwnerActivity["operations"]) {
  if (operations.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(...operations.map((operation) => operation.expiresAt));
}

function requireSessionGeneration(value: string) {
  if (!isOpaqueBoundedValue(value)) {
    throw new Error("Owner activity requires an opaque session generation.");
  }
  return value;
}

function requireOperationId(value: string) {
  if (!isOpaqueBoundedValue(value)) {
    throw new Error("Owner activity requires an opaque operation id.");
  }
  return value;
}

function isOpaqueBoundedValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function requireOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) throw new Error("Offline data requires an owner user id.");
  return normalized;
}

function throwIfOwnerVaultHydrationCancelled(
  signal: AbortSignal | undefined,
): void {
  if (signal?.aborted) {
    throw new DOMException("Owner vault hydration cancelled.", "AbortError");
  }
}
