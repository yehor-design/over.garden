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

export { OwnerOfflineActivityPausedError } from "./queue";

const OWNER_ACTIVITY_PAUSE_TTL_MS = 5 * 60_000;
const COMMIT_PENDING_RECOVERY_GRACE_MS = 10 * 60_000;
const UNSYNCED_MUTATION_STATUSES = [
  "queued",
  "syncing",
  "failed",
] as const satisfies readonly OfflineMutationStatus[];

type UnsyncedMutationStatus = (typeof UNSYNCED_MUTATION_STATUSES)[number];

export interface UnsyncedOwnerDataSummary {
  hasUnsyncedData: boolean;
  totalCount: number;
  draftCount: number;
  mutationCount: number;
  mediaCount: number;
  statusCounts: Record<UnsyncedMutationStatus, number>;
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

const EMPTY_STATUS_COUNTS: Record<UnsyncedMutationStatus, number> = {
  queued: 0,
  syncing: 0,
  failed: 0,
};

export async function summarizeUnsyncedOwnerData(
  ownerUserId: string,
  scope?: OwnerOfflinePurgeScope,
): Promise<UnsyncedOwnerDataSummary> {
  const owner = requireOwnerUserId(ownerUserId);
  const database = offlineDb;
  if (!database) return emptyUnsyncedOwnerDataSummary();

  return database.transaction(
    "r",
    database.drafts,
    database.mutations,
    database.ownerActivity,
    async () => {
      if (scope) {
        await assertOwnedActivityScope(database, owner, scope);
      }
      const [drafts, mutations] = await Promise.all([
        database.drafts.where("ownerUserId").equals(owner).toArray(),
        database.mutations.where("ownerUserId").equals(owner).toArray(),
      ]);
      const unsyncedMutations = mutations.filter((mutation) =>
        UNSYNCED_MUTATION_STATUSES.includes(
          mutation.status as UnsyncedMutationStatus,
        ),
      );
      const statusCounts = unsyncedMutations.reduce(
        (counts, mutation) => {
          counts[mutation.status as UnsyncedMutationStatus] += 1;
          return counts;
        },
        { ...EMPTY_STATUS_COUNTS },
      );
      const draftCount = drafts.length;
      const mutationCount = unsyncedMutations.length;
      const mediaCount = countNestedBlobs([
        ...drafts.map((draft) => draft.payload),
        ...unsyncedMutations.map((mutation) => mutation.payload),
      ]);

      return {
        hasUnsyncedData: draftCount + mutationCount > 0,
        totalCount: draftCount + mutationCount,
        draftCount,
        mutationCount,
        mediaCount,
        statusCounts,
      };
    },
  );
}

export async function hydrateOwnerOfflineActivitySession(
  ownerUserId: string,
  sessionGeneration: string,
): Promise<OwnerActivitySessionHydrationResult> {
  const owner = requireOwnerUserId(ownerUserId);
  const generation = requireSessionGeneration(sessionGeneration);
  const localGeneration = readLocalOwnerActivitySessionGeneration(owner);
  if (localGeneration && localGeneration !== generation) {
    return "document_session_changed";
  }

  const database = offlineDb;
  if (!database) {
    setLocalOwnerActivitySessionGeneration(owner, generation);
    return "ready";
  }

  const result = await database.transaction(
    "rw",
    database.ownerActivity,
    async () => {
      const stored = normalizeStoredOwnerActivity(
        await database.ownerActivity.get(owner),
      );
      if (!stored || stored.sessionGeneration !== generation) {
        await database.ownerActivity.put(
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
        await database.ownerActivity.put({
          ...stored,
          operations: activeOperations,
          updatedAt: Date.now(),
          expiresAt: ownerActivityExpiry(activeOperations),
        });
      }
      return activeOperations.length > 0
        ? ("blocked" as const)
        : ("ready" as const);
    },
  );

  setLocalOwnerActivitySessionGeneration(owner, generation);
  return result;
}

export async function finalizeOwnerOfflineActivityForSignedOut(
  ownerUserId: string,
  sessionGeneration: string,
): Promise<"fenced" | "generation_changed"> {
  const owner = requireOwnerUserId(ownerUserId);
  const generation = requireSessionGeneration(sessionGeneration);
  const database = offlineDb;
  if (!database) return "fenced";

  return database.transaction("rw", database.ownerActivity, async () => {
    const activity = normalizeStoredOwnerActivity(
      await database.ownerActivity.get(owner),
    );
    if (activity && activity.sessionGeneration !== generation) {
      // A newer authoritative document already installed generation B. Never
      // overwrite it with A's fence, but A is still safely unable to write and
      // may complete its hard navigation.
      return "generation_changed" as const;
    }
    if (
      activity?.lifecycle === "signed_out_fence" &&
      activity.sessionGeneration === generation
    ) {
      return "fenced" as const;
    }
    await database.ownerActivity.put({
      ...(activity ?? createActiveOwnerActivity(owner, generation)),
      lifecycle: "signed_out_fence",
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    return "fenced" as const;
  });
}

export async function finalizeOwnerOfflineActivityForSessionChange(
  ownerUserId: string,
  sessionGeneration: string,
): Promise<"fenced" | "generation_changed"> {
  const owner = requireOwnerUserId(ownerUserId);
  const generation = requireSessionGeneration(sessionGeneration);
  const database = offlineDb;
  if (!database) return "fenced";

  return database.transaction("rw", database.ownerActivity, async () => {
    const activity = normalizeStoredOwnerActivity(
      await database.ownerActivity.get(owner),
    );
    if (activity && activity.sessionGeneration !== generation) {
      return "generation_changed" as const;
    }
    await database.ownerActivity.put({
      ...(activity ?? createActiveOwnerActivity(owner, generation)),
      lifecycle: "signed_out_fence",
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    return "fenced" as const;
  });
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
  const database = offlineDb;
  pauseOwnerOfflineActivityLocally(owner, operationId);

  try {
    if (database) {
      await database.transaction("rw", database.ownerActivity, async () => {
        const storedActivity = normalizeStoredOwnerActivity(
          await database.ownerActivity.get(owner),
        );
        const activity =
          storedActivity ?? createActiveOwnerActivity(owner, sessionGeneration);
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
        await database.ownerActivity.put({
          ...activity,
          operations,
          updatedAt: pausedAt,
          expiresAt: ownerActivityExpiry(operations),
        });
      });
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
    await database.transaction("rw", database.ownerActivity, async () => {
      const activity = normalizeStoredOwnerActivity(
        await database.ownerActivity.get(owner),
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
          ownedOperation.expiresAt = Date.now() + OWNER_ACTIVITY_PAUSE_TTL_MS;
        }
      } else {
        const filtered = operations.filter(
          (operation) => operation.operationId !== operationId,
        );
        operations.splice(0, operations.length, ...filtered);
      }
      await database.ownerActivity.put({
        ...activity,
        operations,
        updatedAt: Date.now(),
        expiresAt: ownerActivityExpiry(operations),
      });
    });
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
  const database = offlineDb;
  if (!database) {
    revokeOwnerPreviewObjectUrls(owner);
    return { draftCount: 0, mutationCount: 0, totalCount: 0 };
  }

  const result = await database.transaction(
    "rw",
    database.drafts,
    database.draftSummaries,
    database.mutations,
    database.mutationSummaries,
    database.ownerActivity,
    async () => {
      await assertOwnedActivityScope(database, owner, {
        operationId,
        sessionGeneration,
      });
      const draftCount = await database.drafts
        .where("ownerUserId")
        .equals(owner)
        .delete();
      await database.draftSummaries.where("ownerUserId").equals(owner).delete();
      let mutationCount = 0;

      for (const status of UNSYNCED_MUTATION_STATUSES) {
        mutationCount += await database.mutations
          .where("[ownerUserId+status]")
          .equals([owner, status])
          .delete();
      }
      await database.mutationSummaries
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
    database.drafts,
    database.draftSummaries,
    database.mutations,
    database.mutationSummaries,
    database.ownerActivity,
    async () => {
      const draftCount = await database.drafts
        .where("ownerUserId")
        .equals(owner)
        .delete();
      await database.draftSummaries.where("ownerUserId").equals(owner).delete();
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
    await assertOwnerOfflineActivityAllowed(ownerUserId);
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

function emptyUnsyncedOwnerDataSummary(): UnsyncedOwnerDataSummary {
  return {
    hasUnsyncedData: false,
    totalCount: 0,
    draftCount: 0,
    mutationCount: 0,
    mediaCount: 0,
    statusCounts: { ...EMPTY_STATUS_COUNTS },
  };
}

const MAX_MEDIA_INVENTORY_NODES = 10_000;

function countNestedBlobs(root: unknown): number {
  if (typeof Blob === "undefined") return 0;

  const seen = new WeakSet<object>();
  const pending: unknown[] = [root];
  let count = 0;
  let visited = 0;

  while (pending.length > 0 && visited < MAX_MEDIA_INVENTORY_NODES) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    visited += 1;

    if (value instanceof Blob) {
      count += 1;
      continue;
    }
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    pending.push(...Object.values(value));
  }

  return count;
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
  database: NonNullable<typeof offlineDb>,
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
