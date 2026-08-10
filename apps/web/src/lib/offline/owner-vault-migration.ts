"use client";

import Dexie from "dexie";

import {
  fingerprintOwnerVaultPayload,
  OwnerComposerDurabilityUnconfirmedError,
} from "./owner-composer-durability";
import type {
  OfflineComposerDurabilityRecord,
  OfflineDraftRecord,
  OfflineDraftSummary,
  OfflineMutation,
  OfflineMutationSummary,
  OfflineOwnerActivity,
} from "./queue";
import {
  abandonOwnerVaultExclusiveFence,
  acquireOwnerVaultExclusiveFence,
  deleteResolvedPhysicalOwnerVault,
  finalizeOwnerVaultExclusiveFence,
  hasOwnerVaultBinding,
  OwnerVaultControlDb,
  OwnerVaultDb,
  OWNER_VAULT_OPERATION_DEADLINE_MS,
  waitForOwnerVaultWritersToSettle,
  type OwnerVaultControlRecord,
  type OwnerVaultControlState,
  type OwnerVaultRowCounts,
  type OwnerOfflineDatabase,
} from "./owner-vault";

const MAX_OWNER_VAULT_ROWS = 10_000;
const OWNER_VAULT_CLEANUP_BATCH_ROWS = 32;

export interface OwnerVaultControlReceipt {
  binding: string;
  protocol: OwnerVaultControlRecord["protocol"];
  state: OwnerVaultControlState;
  counts: OwnerVaultRowCounts;
  digest: string;
  sourceCleanupConfirmed: boolean;
  updatedAt: number;
}

export type OwnerVaultMigrationResult =
  | {
      status: "activated";
      counts: OwnerVaultRowCounts;
      digest: string;
      sourceCleanupConfirmed: boolean;
    }
  | {
      status: "conflict_blocked" | "busy" | "degraded";
      sourceCleanupConfirmed: false;
    };

export type OwnerVaultErasureResult =
  | {
      status: "erased_confirmed";
      counts: OwnerVaultRowCounts;
      digest: string;
      durationMs: number;
    }
  | {
      status: "erasure_unconfirmed";
      durationMs: number;
    };

interface SnapshotRow<T> {
  key: string;
  value: T;
}

interface OwnerVaultSnapshot {
  mutations: SnapshotRow<OfflineMutation>[];
  drafts: SnapshotRow<OfflineDraftRecord>[];
  mutationSummaries: SnapshotRow<OfflineMutationSummary>[];
  draftSummaries: SnapshotRow<OfflineDraftSummary>[];
  composerDurability: SnapshotRow<OfflineComposerDurabilityRecord>[];
  ownerActivity: SnapshotRow<OfflineOwnerActivity>[];
  counts: OwnerVaultRowCounts;
  digest: string;
}

type OwnerVaultSnapshotRows = Omit<OwnerVaultSnapshot, "counts" | "digest">;

interface MissingOwnerRows {
  mutations: OfflineMutation[];
  drafts: OfflineDraftRecord[];
  mutationSummaries: OfflineMutationSummary[];
  draftSummaries: OfflineDraftSummary[];
  composerDurability: OfflineComposerDurabilityRecord[];
  ownerActivity: OfflineOwnerActivity[];
}

export async function migrateLegacyOwnerVault(
  input: {
    ownerUserId: string;
    binding: string;
    source: OwnerOfflineDatabase;
    target: OwnerVaultDb;
  },
  options: {
    beforeSourceCleanup?: () => Promise<void>;
    cleanupMode?: "foreground" | "background";
    signal?: AbortSignal;
  } = {},
): Promise<OwnerVaultMigrationResult> {
  const deadlineAt = performance.now() + OWNER_VAULT_OPERATION_DEADLINE_MS;
  throwIfCancelled(options.signal, deadlineAt);
  const owner = requireOwner(input.ownerUserId);
  if (!hasOwnerVaultBinding(input.binding)) {
    throw new TypeError("An opaque owner vault binding is required.");
  }
  if (input.target.binding !== input.binding) {
    throw new Error("The migration target does not match the owner binding.");
  }

  const fence = await acquireOwnerVaultExclusiveFence(input.binding, "copying");
  if (!fence) {
    return { status: "busy", sourceCleanupConfirmed: false };
  }
  let finalized = false;
  try {
    const writersSettled = await waitForOwnerVaultWritersToSettle(fence, {
      deadlineAt,
      signal: options.signal,
    });
    if (!writersSettled) {
      await abandonOwnerVaultExclusiveFence(fence);
      finalized = true;
      return { status: "busy", sourceCleanupConfirmed: false };
    }
    const source = await readOwnerSnapshot(input.source, owner);
    throwIfCancelled(options.signal, deadlineAt);
    const targetBefore = await readOwnerSnapshot(input.target, owner);
    throwIfCancelled(options.signal, deadlineAt);
    const comparison = await compareSnapshots(source, targetBefore);
    const resumableTarget =
      fence.previous?.state === "active" ||
      fence.previous?.state === "cleanup_deferred" ||
      totalRows(source.counts) === 0 ||
      totalRows(targetBefore.counts) === 0 ||
      snapshotsEqual(source, targetBefore) ||
      (comparison.targetOnlyCount === 0 && !comparison.conflict);

    if (!resumableTarget || comparison.conflict) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "conflict_blocked",
        counts: source.counts,
        digest: source.digest,
        sourceCleanupConfirmed: false,
      });
      finalized = true;
      return { status: "conflict_blocked", sourceCleanupConfirmed: false };
    }

    await copyMissingRows(input.target, comparison.missing);
    throwIfCancelled(options.signal, deadlineAt);
    const committed = await independentlyReopenAndRead(
      input.target,
      input.binding,
      owner,
      options.signal,
    );
    throwIfCancelled(options.signal, deadlineAt);
    const committedComparison = snapshotsEqual(source, committed)
      ? exactSnapshotComparison()
      : await compareSnapshots(source, committed);
    if (
      committedComparison.conflict ||
      totalMissingRows(committedComparison.missing) > 0
    ) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "migration_unstarted",
        counts: source.counts,
        digest: source.digest,
        sourceCleanupConfirmed: false,
      });
      finalized = true;
      return { status: "degraded", sourceCleanupConfirmed: false };
    }

    if (
      options.cleanupMode !== "background" &&
      totalRows(source.counts) > OWNER_VAULT_CLEANUP_BATCH_ROWS
    ) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "cleanup_deferred",
        counts: committed.counts,
        digest: committed.digest,
        sourceCleanupConfirmed: false,
      });
      finalized = true;
      return {
        status: "activated",
        counts: committed.counts,
        digest: committed.digest,
        sourceCleanupConfirmed: false,
      };
    }

    await options.beforeSourceCleanup?.();
    throwIfCancelled(options.signal, deadlineAt);
    const freshSource = await readOwnerSnapshot(input.source, owner);
    throwIfCancelled(options.signal, deadlineAt);
    if (freshSource.digest !== source.digest) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "cleanup_deferred",
        counts: committed.counts,
        digest: committed.digest,
        sourceCleanupConfirmed: false,
      });
      finalized = true;
      return {
        status: "activated",
        counts: committed.counts,
        digest: committed.digest,
        sourceCleanupConfirmed: false,
      };
    }

    const sourceDeleted = await deleteExactOwnerSnapshotRows(
      input.source,
      owner,
      options.cleanupMode === "background"
        ? freshSource
        : boundedCleanupSnapshot(freshSource, OWNER_VAULT_CLEANUP_BATCH_ROWS),
      () => throwIfCancelled(options.signal, deadlineAt),
      options.signal,
    );
    if (!sourceDeleted) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "cleanup_deferred",
        counts: committed.counts,
        digest: committed.digest,
        sourceCleanupConfirmed: false,
      });
      finalized = true;
      return {
        status: "activated",
        counts: committed.counts,
        digest: committed.digest,
        sourceCleanupConfirmed: false,
      };
    }
    throwIfCancelled(options.signal, deadlineAt);
    const afterCleanup = await readOwnerSnapshot(input.source, owner);
    const sourceCleanupConfirmed = totalRows(afterCleanup.counts) === 0;
    await finalizeOwnerVaultExclusiveFence(fence, {
      state: sourceCleanupConfirmed ? "active" : "cleanup_deferred",
      counts: committed.counts,
      digest: committed.digest,
      sourceCleanupConfirmed,
    });
    finalized = true;
    return {
      status: "activated",
      counts: committed.counts,
      digest: committed.digest,
      sourceCleanupConfirmed,
    };
  } catch (error) {
    if (error instanceof OwnerComposerDurabilityUnconfirmedError) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "migration_unstarted",
        counts: emptyCounts(),
        digest: emptyDigest(),
        sourceCleanupConfirmed: false,
      });
      finalized = true;
      return { status: "degraded", sourceCleanupConfirmed: false };
    }
    throw error;
  } finally {
    if (!finalized) await abandonOwnerVaultExclusiveFence(fence);
  }
}

export async function readOwnerVaultControlReceipt(
  binding: string,
): Promise<OwnerVaultControlReceipt | null> {
  if (!hasOwnerVaultBinding(binding)) return null;
  const database = new OwnerVaultControlDb();
  try {
    const record = await database.vaults.get(binding);
    if (!record) return null;
    return {
      binding: record.binding,
      protocol: record.protocol,
      state: record.state,
      counts: { ...record.counts },
      digest: record.digest,
      sourceCleanupConfirmed: record.sourceCleanupConfirmed,
      updatedAt: record.updatedAt,
    };
  } finally {
    database.close();
  }
}

export async function eraseCurrentDeviceOwnerVault(
  input: {
    ownerUserId: string;
    binding: string;
    legacy: OwnerOfflineDatabase;
  },
  options: { signal?: AbortSignal } = {},
): Promise<OwnerVaultErasureResult> {
  const startedAt = performance.now();
  const deadlineAt = startedAt + OWNER_VAULT_OPERATION_DEADLINE_MS;
  const owner = requireOwner(input.ownerUserId);
  if (!hasOwnerVaultBinding(input.binding)) {
    throw new TypeError("An opaque owner vault binding is required.");
  }
  throwIfCancelled(options.signal, deadlineAt);
  const fence = await acquireOwnerVaultExclusiveFence(
    input.binding,
    "erasure_unconfirmed",
  );
  if (!fence) {
    return {
      status: "erasure_unconfirmed",
      durationMs: boundedDuration(startedAt),
    };
  }

  let snapshot: OwnerVaultSnapshot | null = null;
  let finalized = false;
  try {
    const writersSettled = await waitForOwnerVaultWritersToSettle(fence, {
      deadlineAt,
      signal: options.signal,
    });
    if (!writersSettled) {
      await abandonOwnerVaultExclusiveFence(fence);
      finalized = true;
      return {
        status: "erasure_unconfirmed",
        durationMs: boundedDuration(startedAt),
      };
    }
    snapshot = await readOwnerSnapshot(input.legacy, owner);
    throwIfCancelled(options.signal, deadlineAt);
    const targetDeletion = await deleteResolvedPhysicalOwnerVault(
      owner,
      input.binding,
    );
    throwIfCancelled(options.signal, deadlineAt);
    if (!targetDeletion.absenceConfirmed) {
      throw new Error("The exact owner vault absence was not confirmed.");
    }
    const legacyDeleted = await deleteExactOwnerSnapshotRows(
      input.legacy,
      owner,
      snapshot,
      () => throwIfCancelled(options.signal, deadlineAt),
      options.signal,
    );
    if (!legacyDeleted) {
      throw new Error("Exact-owner legacy snapshot changed during erasure.");
    }
    throwIfCancelled(options.signal, deadlineAt);
    const remainingLegacy = await readOwnerSnapshot(input.legacy, owner);
    throwIfCancelled(options.signal, deadlineAt);
    if (totalRows(remainingLegacy.counts) !== 0) {
      throw new Error("Exact-owner legacy residue remains.");
    }
    await finalizeOwnerVaultExclusiveFence(fence, {
      state: "erased_confirmed",
      counts: snapshot.counts,
      digest: snapshot.digest,
      sourceCleanupConfirmed: true,
    });
    finalized = true;
    return {
      status: "erased_confirmed",
      counts: snapshot.counts,
      digest: snapshot.digest,
      durationMs: boundedDuration(startedAt),
    };
  } catch {
    if (!finalized) {
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: "erasure_unconfirmed",
        counts: snapshot?.counts ?? emptyCounts(),
        digest: snapshot?.digest ?? emptyDigest(),
        sourceCleanupConfirmed: false,
      }).catch(() => undefined);
      finalized = true;
    }
    return {
      status: "erasure_unconfirmed",
      durationMs: boundedDuration(startedAt),
    };
  } finally {
    if (!finalized) await abandonOwnerVaultExclusiveFence(fence);
  }
}

async function readOwnerSnapshot(
  database: OwnerOfflineDatabase,
  ownerUserId: string,
): Promise<OwnerVaultSnapshot> {
  const rows = await database.transaction("r", ownerVaultTables(database), () =>
    readOwnerSnapshotRows(database, ownerUserId),
  );
  return completeOwnerSnapshot(rows);
}

async function readOwnerSnapshotRows(
  database: OwnerOfflineDatabase,
  ownerUserId: string,
): Promise<OwnerVaultSnapshotRows> {
  const [
    mutations,
    drafts,
    mutationSummaries,
    draftSummaries,
    composer,
    activity,
  ] = (await readBoundedOwnerTables(database, ownerUserId)) as [
    OfflineMutation[],
    OfflineDraftRecord[],
    OfflineMutationSummary[],
    OfflineDraftSummary[],
    OfflineComposerDurabilityRecord[],
    OfflineOwnerActivity[],
  ];

  return {
    mutations: snapshotRows(mutations, (row) => row.id),
    drafts: snapshotRows(drafts, (row) => `${row.ownerUserId}:${row.id}`),
    mutationSummaries: snapshotRows(
      mutationSummaries,
      (row) => `${row.ownerUserId}:${row.id}`,
    ),
    draftSummaries: snapshotRows(
      draftSummaries,
      (row) => `${row.ownerUserId}:${row.id}`,
    ),
    composerDurability: snapshotRows(
      composer,
      (row) => `${row.ownerUserId}:${row.draftId}`,
    ),
    ownerActivity: snapshotRows(activity, (row) => row.ownerUserId),
  };
}

async function readBoundedOwnerTables(
  database: OwnerOfflineDatabase,
  ownerUserId: string,
) {
  let remaining = MAX_OWNER_VAULT_ROWS;
  const bounded = async <T>(read: (limit: number) => Promise<T[]>) => {
    const rows = await read(remaining + 1);
    if (rows.length > remaining) {
      throw new OwnerComposerDurabilityUnconfirmedError("inventory_bounded");
    }
    remaining -= rows.length;
    return rows;
  };
  return [
    await bounded((limit) =>
      database.mutations
        .where("ownerUserId")
        .equals(ownerUserId)
        .limit(limit)
        .toArray(),
    ),
    await bounded((limit) =>
      database.drafts
        .where("ownerUserId")
        .equals(ownerUserId)
        .limit(limit)
        .toArray(),
    ),
    await bounded((limit) =>
      database.mutationSummaries
        .where("ownerUserId")
        .equals(ownerUserId)
        .limit(limit)
        .toArray(),
    ),
    await bounded((limit) =>
      database.draftSummaries
        .where("ownerUserId")
        .equals(ownerUserId)
        .limit(limit)
        .toArray(),
    ),
    await bounded((limit) =>
      database.composerDurability
        .where("ownerUserId")
        .equals(ownerUserId)
        .limit(limit)
        .toArray(),
    ),
    await bounded((limit) =>
      database.ownerActivity
        .where("ownerUserId")
        .equals(ownerUserId)
        .limit(limit)
        .toArray(),
    ),
  ];
}

async function completeOwnerSnapshot(
  snapshot: OwnerVaultSnapshotRows,
): Promise<OwnerVaultSnapshot> {
  const counts: OwnerVaultRowCounts = {
    mutations: snapshot.mutations.length,
    drafts: snapshot.drafts.length,
    mutationSummaries: snapshot.mutationSummaries.length,
    draftSummaries: snapshot.draftSummaries.length,
    composerDurability: snapshot.composerDurability.length,
    ownerActivity: snapshot.ownerActivity.length,
  };
  return {
    ...snapshot,
    counts,
    digest: await fingerprintSnapshotRows(snapshot),
  };
}

async function fingerprintSnapshotRows(
  snapshot: OwnerVaultSnapshotRows,
): Promise<string> {
  return (
    await fingerprintOwnerVaultPayload(
      snapshotTableNames().flatMap((table) =>
        snapshot[table].map((row) => ({
          table,
          key: row.key,
          value: row.value,
        })),
      ),
    )
  ).storedDigest;
}

function snapshotRows<T>(
  rows: T[],
  keyOf: (row: T) => string,
): SnapshotRow<T>[] {
  return rows
    .map((value) => ({ key: keyOf(value), value }))
    .sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    );
}

async function compareSnapshots(
  source: OwnerVaultSnapshot,
  target: OwnerVaultSnapshot,
): Promise<{
  conflict: boolean;
  missing: MissingOwnerRows;
  targetOnlyCount: number;
}> {
  if (snapshotsEqual(source, target)) return exactSnapshotComparison();
  if (totalRows(target.counts) === 0) {
    return {
      conflict: false,
      missing: snapshotValues(source),
      targetOnlyCount: 0,
    };
  }

  const mutations = partitionRows(source.mutations, target.mutations);
  const drafts = partitionRows(source.drafts, target.drafts);
  const mutationSummaries = partitionRows(
    source.mutationSummaries,
    target.mutationSummaries,
  );
  const draftSummaries = partitionRows(
    source.draftSummaries,
    target.draftSummaries,
  );
  const composerDurability = partitionRows(
    source.composerDurability,
    target.composerDurability,
  );
  const ownerActivity = partitionRows(
    source.ownerActivity,
    target.ownerActivity,
  );
  const matchedSource: OwnerVaultSnapshotRows = {
    mutations: mutations.matchedSource,
    drafts: drafts.matchedSource,
    mutationSummaries: mutationSummaries.matchedSource,
    draftSummaries: draftSummaries.matchedSource,
    composerDurability: composerDurability.matchedSource,
    ownerActivity: ownerActivity.matchedSource,
  };
  const matchedTarget: OwnerVaultSnapshotRows = {
    mutations: mutations.matchedTarget,
    drafts: drafts.matchedTarget,
    mutationSummaries: mutationSummaries.matchedTarget,
    draftSummaries: draftSummaries.matchedTarget,
    composerDurability: composerDurability.matchedTarget,
    ownerActivity: ownerActivity.matchedTarget,
  };
  return {
    conflict:
      (await fingerprintSnapshotRows(matchedSource)) !==
      (await fingerprintSnapshotRows(matchedTarget)),
    missing: {
      mutations: mutations.missing,
      drafts: drafts.missing,
      mutationSummaries: mutationSummaries.missing,
      draftSummaries: draftSummaries.missing,
      composerDurability: composerDurability.missing,
      ownerActivity: ownerActivity.missing,
    },
    targetOnlyCount:
      mutations.targetOnlyCount +
      drafts.targetOnlyCount +
      mutationSummaries.targetOnlyCount +
      draftSummaries.targetOnlyCount +
      composerDurability.targetOnlyCount +
      ownerActivity.targetOnlyCount,
  };
}

function exactSnapshotComparison(): {
  conflict: false;
  missing: MissingOwnerRows;
  targetOnlyCount: 0;
} {
  return {
    conflict: false,
    missing: emptyMissingRows(),
    targetOnlyCount: 0,
  };
}

function snapshotValues(snapshot: OwnerVaultSnapshot): MissingOwnerRows {
  return {
    mutations: snapshot.mutations.map((row) => row.value),
    drafts: snapshot.drafts.map((row) => row.value),
    mutationSummaries: snapshot.mutationSummaries.map((row) => row.value),
    draftSummaries: snapshot.draftSummaries.map((row) => row.value),
    composerDurability: snapshot.composerDurability.map((row) => row.value),
    ownerActivity: snapshot.ownerActivity.map((row) => row.value),
  };
}

function emptyMissingRows(): MissingOwnerRows {
  return {
    mutations: [],
    drafts: [],
    mutationSummaries: [],
    draftSummaries: [],
    composerDurability: [],
    ownerActivity: [],
  };
}

function partitionRows<T>(
  source: SnapshotRow<T>[],
  target: SnapshotRow<T>[],
): {
  missing: T[];
  matchedSource: SnapshotRow<T>[];
  matchedTarget: SnapshotRow<T>[];
  targetOnlyCount: number;
} {
  const targetRows = new Map(target.map((row) => [row.key, row]));
  const missing: T[] = [];
  const matchedSource: SnapshotRow<T>[] = [];
  const matchedTarget: SnapshotRow<T>[] = [];
  for (const sourceRow of source) {
    const targetRow = targetRows.get(sourceRow.key);
    if (targetRow === undefined) missing.push(sourceRow.value);
    else {
      matchedSource.push(sourceRow);
      matchedTarget.push(targetRow);
    }
  }
  return {
    missing,
    matchedSource,
    matchedTarget,
    targetOnlyCount: target.length - matchedTarget.length,
  };
}

function totalMissingRows(rows: MissingOwnerRows): number {
  return Object.values(rows).reduce((total, table) => total + table.length, 0);
}

function snapshotsEqual(
  left: OwnerVaultSnapshot,
  right: OwnerVaultSnapshot,
): boolean {
  return (
    left.digest === right.digest &&
    snapshotTableNames().every(
      (table) => left.counts[table] === right.counts[table],
    )
  );
}

function boundedCleanupSnapshot(
  snapshot: OwnerVaultSnapshot,
  limit: number,
): OwnerVaultSnapshot {
  let remaining = limit;
  const take = <T>(rows: SnapshotRow<T>[]) => {
    const selected = rows.slice(0, remaining);
    remaining -= selected.length;
    return selected;
  };
  const rows: OwnerVaultSnapshotRows = {
    mutations: take(snapshot.mutations),
    drafts: take(snapshot.drafts),
    mutationSummaries: take(snapshot.mutationSummaries),
    draftSummaries: take(snapshot.draftSummaries),
    composerDurability: take(snapshot.composerDurability),
    ownerActivity: take(snapshot.ownerActivity),
  };
  return {
    ...rows,
    counts: {
      mutations: rows.mutations.length,
      drafts: rows.drafts.length,
      mutationSummaries: rows.mutationSummaries.length,
      draftSummaries: rows.draftSummaries.length,
      composerDurability: rows.composerDurability.length,
      ownerActivity: rows.ownerActivity.length,
    },
    // Cleanup consumes only keys; this digest is deliberately not persisted.
    digest: snapshot.digest,
  };
}

async function copyMissingRows(
  target: OwnerVaultDb,
  rows: MissingOwnerRows,
): Promise<void> {
  await target.transaction(
    "rw",
    [
      target.mutations,
      target.drafts,
      target.mutationSummaries,
      target.draftSummaries,
      target.composerDurability,
      target.ownerActivity,
    ],
    async () => {
      if (rows.mutations.length) await target.mutations.bulkPut(rows.mutations);
      if (rows.drafts.length) await target.drafts.bulkPut(rows.drafts);
      if (rows.mutationSummaries.length) {
        await target.mutationSummaries.bulkPut(rows.mutationSummaries);
      }
      if (rows.draftSummaries.length) {
        await target.draftSummaries.bulkPut(rows.draftSummaries);
      }
      if (rows.composerDurability.length) {
        await target.composerDurability.bulkPut(rows.composerDurability);
      }
      if (rows.ownerActivity.length) {
        await target.ownerActivity.bulkPut(rows.ownerActivity);
      }
    },
  );
}

async function independentlyReopenAndRead(
  target: OwnerVaultDb,
  binding: string,
  ownerUserId: string,
  signal: AbortSignal | undefined,
): Promise<OwnerVaultSnapshot> {
  target.close();
  const verifier = new OwnerVaultDb(binding);
  try {
    if (signal?.aborted) {
      throw new DOMException("Owner vault operation cancelled.", "AbortError");
    }
    await verifier.open();
    return await readOwnerSnapshot(verifier, ownerUserId);
  } finally {
    verifier.close();
    if (!signal?.aborted) {
      await target.open();
      if (signal?.aborted) target.close();
    }
  }
}

async function deleteExactOwnerSnapshotRows(
  source: OwnerOfflineDatabase,
  ownerUserId: string,
  snapshot: OwnerVaultSnapshot,
  assertContinuation: () => void,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  return source.transaction("rw", ownerVaultTables(source), async () => {
    const transaction = Dexie.currentTransaction;
    const abortTransaction = () => transaction?.abort();
    signal?.addEventListener("abort", abortTransaction, { once: true });
    if (signal?.aborted) abortTransaction();

    try {
      // Re-read and fingerprint under the same read-write transaction that
      // performs deletion. An older tab that committed first is observed; a
      // writer queued later runs after this transaction and recreates its row.
      // There is no digest-check/delete race that can remove a late update.
      const currentRows = await readOwnerSnapshotRows(source, ownerUserId);
      const current = await Dexie.waitFor(completeOwnerSnapshot(currentRows));
      if (!snapshotsEqual(current, snapshot)) return false;
      assertContinuation();
      await Promise.all([
        source.mutations.bulkDelete(
          snapshot.mutations.map((row) => row.value.id),
        ),
        source.drafts.bulkDelete(
          snapshot.drafts.map((row) => [row.value.ownerUserId, row.value.id]),
        ),
        source.mutationSummaries.bulkDelete(
          snapshot.mutationSummaries.map((row) => [
            row.value.ownerUserId,
            row.value.id,
          ]),
        ),
        source.draftSummaries.bulkDelete(
          snapshot.draftSummaries.map((row) => [
            row.value.ownerUserId,
            row.value.id,
          ]),
        ),
        source.composerDurability.bulkDelete(
          snapshot.composerDurability.map((row) => [
            row.value.ownerUserId,
            row.value.draftId,
          ]),
        ),
        source.ownerActivity.bulkDelete(
          snapshot.ownerActivity.map((row) => row.value.ownerUserId),
        ),
      ]);
      return true;
    } finally {
      signal?.removeEventListener("abort", abortTransaction);
    }
  });
}

function ownerVaultTables(database: OwnerOfflineDatabase) {
  return [
    database.mutations,
    database.drafts,
    database.mutationSummaries,
    database.draftSummaries,
    database.composerDurability,
    database.ownerActivity,
  ] as const;
}

function snapshotTableNames() {
  return [
    "mutations",
    "drafts",
    "mutationSummaries",
    "draftSummaries",
    "composerDurability",
    "ownerActivity",
  ] as const;
}

function emptyCounts(): OwnerVaultRowCounts {
  return {
    mutations: 0,
    drafts: 0,
    mutationSummaries: 0,
    draftSummaries: 0,
    composerDurability: 0,
    ownerActivity: 0,
  };
}

function totalRows(counts: OwnerVaultRowCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function emptyDigest(): string {
  return "0".repeat(64);
}

function boundedDuration(startedAt: number): number {
  return Math.max(
    0,
    Math.min(60_000, Math.round(performance.now() - startedAt)),
  );
}

function requireOwner(value: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("An owner user id is required.");
  }
  return value.trim();
}

function throwIfCancelled(
  signal: AbortSignal | undefined,
  deadlineAt: number,
): void {
  if (signal?.aborted || performance.now() >= deadlineAt) {
    throw new DOMException("Owner vault operation cancelled.", "AbortError");
  }
}
