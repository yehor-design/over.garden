"use client";

import Dexie, { type Table } from "dexie";

import type { EntrySyncStatus, PlantObjectKind } from "@/db/schema";
import type {
  ActivationSource,
  JournalEntryTarget,
} from "@/lib/garden/entry-contracts";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import type {
  OWNER_COMPOSER_DURABILITY_PROTOCOL,
  OFFLINE_VAULT_GENERATION,
  OwnerComposerDurabilityDisposition,
} from "./owner-composer-durability";

export type OfflineMutationStatus = "queued" | "syncing" | "synced" | "failed";
export type OfflineMutationKind = "journal_entry" | "photo_upload";
export const OFFLINE_QUEUE_CHANGED_EVENT = "overgarden:offline-queue-changed";
export const OFFLINE_SYNC_LEASE_MS = 60_000;

export interface OfflineOwnerActivityOperation {
  operationId: string;
  phase: "preparing" | "commit_pending";
  expiresAt: number;
}

export interface OfflineOwnerActivity {
  ownerUserId: string;
  sessionGeneration: string;
  lifecycle: "active" | "signed_out_fence";
  operations: OfflineOwnerActivityOperation[];
  updatedAt: number;
  expiresAt: number;
}

export class OwnerOfflineActivityPausedError extends Error {
  constructor() {
    super("Offline activity is paused for sign-out.");
    this.name = "OwnerOfflineActivityPausedError";
  }
}

const localOwnerActivityPauseTokens = new Map<string, Set<string>>();
const localOwnerActivitySessionGenerations = new Map<string, string>();

export interface OfflinePhotoIntent {
  fileName: string;
  contentType: string;
  size: number;
  lastModified?: number;
  blob?: Blob;
}

interface OfflineJournalEntryPayloadBase {
  target?: JournalEntryTarget;
  title: string;
  body: string;
  contentDocument?: unknown;
  entryDate: string;
  clientMutationId: string;
  syncStatus?: EntrySyncStatus;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: string[];
  photoIntent?: OfflinePhotoIntent | null;
  photoIntentsByBlockId?: Record<string, OfflinePhotoIntent>;
  processedMediaAssetId?: string | null;
  cover?: OfflineJournalCoverPayload | null;
}

export type OfflineJournalCoverPayload =
  | { mode: "automatic" }
  | { mode: "none" }
  | { mode: "explicit_inline"; mediaAssetId: string }
  | {
      mode: "separate";
      mediaAssetId?: string | null;
      photoIntent?: OfflinePhotoIntent | null;
    }
  | { mode: "keep_as_cover"; mediaAssetId: string };

export interface OfflineFirstPlantEntryPayload extends OfflineJournalEntryPayloadBase {
  target?: "first_plant_entry";
  spaceId?: string | null;
  spaceName?: string;
  plantName: string;
  objectKind?: PlantObjectKind | null;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  activationSource?: ActivationSource | null;
}

export interface OfflinePlantObjectEntryPayload extends OfflineJournalEntryPayloadBase {
  target: "plant_object_entry";
  plantObjectId: string;
}

export interface OfflineSpaceEntryPayload extends OfflineJournalEntryPayloadBase {
  target: "space_entry";
  spaceId: string;
  mentionedPlantObjectIds: string[];
}

export type OfflineJournalEntryPayload =
  | OfflineFirstPlantEntryPayload
  | OfflinePlantObjectEntryPayload
  | OfflineSpaceEntryPayload;

export type OfflineMutationPayload = OfflineJournalEntryPayload | unknown;

export interface OfflineMutation {
  id: string;
  ownerUserId: string;
  kind: OfflineMutationKind;
  payload: OfflineMutationPayload;
  idempotencyKey: string;
  status: OfflineMutationStatus;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  syncResult?: unknown;
  syncLeaseExpiresAt?: number | null;
}

export type OfflineDraftKind =
  | "first_entry"
  | "follow_up_entry"
  | "space_entry";

export interface OfflineDraftRecord<TPayload = unknown> {
  id: string;
  ownerUserId: string;
  kind: OfflineDraftKind;
  payload: TPayload;
  createdAt: number;
  updatedAt: number;
}

/**
 * Payload-free commit metadata. The compound owner/draft key is an internal
 * storage boundary and is never copied into an inspection receipt.
 */
export interface OfflineComposerDurabilityRecord {
  ownerUserId: string;
  draftId: string;
  protocol: typeof OWNER_COMPOSER_DURABILITY_PROTOCOL;
  participantNonce: string;
  generation: number;
  disposition: OwnerComposerDurabilityDisposition;
  storedByteLength: number;
  storedDigest: string;
  vaultGeneration: typeof OFFLINE_VAULT_GENERATION;
  updatedAt: number;
}

/**
 * A deliberately payload-free device-local projection for the garden workspace.
 * It is not a recovery record: composers and sync always read the canonical
 * draft/mutation tables. Keeping this narrow record in a separate table means
 * the workspace never has to hydrate private prose or photo bytes merely to
 * tell an owner that local work exists.
 */
export interface OfflineDraftSummary {
  id: string;
  ownerUserId: string;
  kind: OfflineDraftKind;
  createdAt: number;
  updatedAt: number;
  entryDate: string | null;
  targetObjectId: string | null;
  targetSpaceId: string | null;
}

export interface OfflineMutationSummary {
  id: string;
  ownerUserId: string;
  kind: OfflineMutationKind;
  status: OfflineMutationStatus;
  /** Numeric because IndexedDB compound keys do not support boolean values. */
  workspaceVisible: 0 | 1;
  createdAt: number;
  updatedAt: number;
  target: JournalEntryTarget | null;
  targetObjectId: string | null;
  targetSpaceId: string | null;
}

export interface OfflineSummaryPage<T> {
  items: T[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export const OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE = 24;
const MAX_OFFLINE_WORKSPACE_SUMMARY_PAGE = 100;
const SUMMARY_TIMESTAMP_MIN = Number.MIN_SAFE_INTEGER;
const SUMMARY_TIMESTAMP_MAX = Number.MAX_SAFE_INTEGER;

class OverGardenOfflineDb extends Dexie {
  mutations!: Table<OfflineMutation, string>;
  drafts!: Table<OfflineDraftRecord, [string, string]>;
  mutationSummaries!: Table<OfflineMutationSummary, [string, string]>;
  draftSummaries!: Table<OfflineDraftSummary, [string, string]>;
  composerDurability!: Table<OfflineComposerDurabilityRecord, [string, string]>;
  ownerActivity!: Table<OfflineOwnerActivity, string>;

  constructor() {
    super("overgarden-offline");
    this.version(1).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
    });
    this.version(2).stores({
      mutations: "id, kind, status, idempotencyKey, createdAt, updatedAt",
      drafts: "id, kind, createdAt, updatedAt",
    });
    this.version(3)
      .stores({
        mutations:
          "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
        drafts:
          "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
      })
      .upgrade(async (transaction) => {
        // Legacy records had no owner boundary. They cannot be attributed safely,
        // so discard them instead of exposing one account's drafts to another.
        await Promise.all([
          transaction.table("mutations").clear(),
          transaction.table("drafts").clear(),
        ]);
      });
    this.version(4).stores({
      mutations:
        "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
      drafts:
        "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
      ownerActivity: "ownerUserId, expiresAt",
    });
    this.version(5)
      .stores({
        mutations:
          "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
        drafts:
          "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
        mutationSummaries:
          "[ownerUserId+id], ownerUserId, [ownerUserId+status+createdAt], [ownerUserId+workspaceVisible+updatedAt], [ownerUserId+updatedAt]",
        draftSummaries:
          "[ownerUserId+id], ownerUserId, [ownerUserId+kind+updatedAt], [ownerUserId+updatedAt]",
        ownerActivity: "ownerUserId, expiresAt",
      })
      .upgrade(async (transaction) => {
        const drafts = transaction.table("drafts");
        const mutations = transaction.table("mutations");
        const draftSummaries = transaction.table("draftSummaries");
        const mutationSummaries = transaction.table("mutationSummaries");

        await Promise.all([
          drafts
            .toCollection()
            .each((record: OfflineDraftRecord) =>
              draftSummaries.put(offlineDraftSummary(record)),
            ),
          mutations
            .toCollection()
            .each((record: OfflineMutation) =>
              mutationSummaries.put(offlineMutationSummary(record)),
            ),
        ]);
      });
    this.version(6).stores({
      mutations:
        "id, ownerUserId, &[ownerUserId+idempotencyKey], [ownerUserId+status], createdAt, updatedAt",
      drafts:
        "[ownerUserId+id], ownerUserId, [ownerUserId+kind], createdAt, updatedAt",
      mutationSummaries:
        "[ownerUserId+id], ownerUserId, [ownerUserId+status+createdAt], [ownerUserId+workspaceVisible+updatedAt], [ownerUserId+updatedAt]",
      draftSummaries:
        "[ownerUserId+id], ownerUserId, [ownerUserId+kind+updatedAt], [ownerUserId+updatedAt]",
      composerDurability: "[ownerUserId+draftId], ownerUserId, updatedAt",
      ownerActivity: "ownerUserId, expiresAt",
    });
  }
}

export const offlineDb =
  typeof indexedDB === "undefined" ? undefined : new OverGardenOfflineDb();

export async function enqueueOfflineMutation(
  input: Pick<OfflineMutation, "ownerUserId" | "kind" | "payload"> & {
    idempotencyKey?: string;
  },
): Promise<OfflineMutation> {
  if (!offlineDb) {
    throw new Error("Offline queue is only available when IndexedDB exists.");
  }

  const ownerUserId = requireOwnerUserId(input.ownerUserId);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const result = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    offlineDb.mutationSummaries,
    offlineDb.ownerActivity,
    async () => {
      await assertOwnerOfflineActivityAllowed(ownerUserId);
      const now = Date.now();
      const existing = await offlineDb.mutations
        .where("[ownerUserId+idempotencyKey]")
        .equals([ownerUserId, idempotencyKey])
        .first();

      if (existing) {
        if (existing.status === "queued" || existing.status === "failed") {
          const updated: OfflineMutation = {
            ...existing,
            payload: input.payload,
            status: "queued",
            updatedAt: now,
            lastError: undefined,
            syncLeaseExpiresAt: null,
          };
          await putOfflineMutationWithSummary(offlineDb, updated);
          return { mutation: updated, changed: true };
        }

        return { mutation: existing, changed: false };
      }

      const mutation: OfflineMutation = {
        id: crypto.randomUUID(),
        ownerUserId,
        kind: input.kind,
        payload: input.payload,
        idempotencyKey,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        syncLeaseExpiresAt: null,
      };

      await offlineDb.mutations.add(mutation);
      await offlineDb.mutationSummaries.put(offlineMutationSummary(mutation));
      return { mutation, changed: true };
    },
  );

  if (result.changed) publishOfflineQueueChanged();
  return result.mutation;
}

export async function listQueuedMutations(
  ownerUserId: string,
): Promise<OfflineMutation[]> {
  return listOfflineMutations(ownerUserId, ["queued"]);
}

export async function listOfflineMutations(
  ownerUserId: string,
  statuses?: OfflineMutationStatus[],
): Promise<OfflineMutation[]> {
  if (!offlineDb) return [];
  const owner = requireOwnerUserId(ownerUserId);
  const mutations = await offlineDb.mutations
    .where("ownerUserId")
    .equals(owner)
    .filter(
      (mutation) =>
        !statuses ||
        statuses.length === 0 ||
        statuses.includes(mutation.status),
    )
    .toArray();

  return mutations.sort((left, right) => left.createdAt - right.createdAt);
}

export async function listOfflineMutationSummaries(
  ownerUserId: string,
  options: {
    page?: number;
    statuses?: readonly OfflineMutationStatus[];
  } = {},
): Promise<OfflineSummaryPage<OfflineMutationSummary>> {
  const database = offlineDb;
  const page = normalizeWorkspaceSummaryPage(options.page);
  const statuses = normalizeSummaryStatuses(options.statuses);
  const owner = normalizedOwnerUserId(ownerUserId);
  if (!database || !owner || statuses.length === 0) {
    return emptyOfflineSummaryPage(page);
  }

  const rows = await database.mutationSummaries
    .where("[ownerUserId+workspaceVisible+updatedAt]")
    .between(
      [owner, 1, SUMMARY_TIMESTAMP_MIN],
      [owner, 1, SUMMARY_TIMESTAMP_MAX],
      true,
      true,
    )
    .reverse()
    .offset((page - 1) * OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE)
    .limit(OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE + 1)
    .toArray();
  const allowed = rows.filter((row) => statuses.includes(row.status));

  return {
    items: allowed.slice(0, OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE),
    hasMore: allowed.length > OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
    page,
    pageSize: OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
  };
}

export async function getOfflineMutation(
  ownerUserId: string,
  id: string,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const mutation = await offlineDb.mutations.get(id);
  return mutation?.ownerUserId === requireOwnerUserId(ownerUserId)
    ? mutation
    : undefined;
}

export async function updateOfflineMutationStatus(
  ownerUserId: string,
  id: string,
  status: OfflineMutationStatus,
  options: {
    lastError?: string;
    syncResult?: unknown;
  } = {},
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const updated = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    offlineDb.mutationSummaries,
    offlineDb.ownerActivity,
    async () => {
      await assertOwnerOfflineActivityAllowed(owner);
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      const next: OfflineMutation = {
        ...mutation,
        status,
        updatedAt: Date.now(),
        lastError: options.lastError,
        syncResult: options.syncResult,
        syncLeaseExpiresAt:
          status === "syncing" ? Date.now() + OFFLINE_SYNC_LEASE_MS : null,
      };
      await putOfflineMutationWithSummary(offlineDb, next);
      return next;
    },
  );
  if (!updated) return undefined;
  publishOfflineQueueChanged();
  return updated;
}

export async function updateOfflineMutationPayload(
  ownerUserId: string,
  id: string,
  payload: OfflineMutationPayload,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const updated = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    offlineDb.mutationSummaries,
    offlineDb.ownerActivity,
    async () => {
      await assertOwnerOfflineActivityAllowed(owner);
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      const next = { ...mutation, payload, updatedAt: Date.now() };
      await putOfflineMutationWithSummary(offlineDb, next);
      return next;
    },
  );
  if (!updated) return undefined;
  publishOfflineQueueChanged();
  return updated;
}

export async function claimOfflineMutationForSync(
  ownerUserId: string,
  id: string,
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const now = Date.now();
  const claimed = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    offlineDb.mutationSummaries,
    offlineDb.ownerActivity,
    async () => {
      await assertOwnerOfflineActivityAllowed(owner);
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      if (mutation.status === "synced") return undefined;
      if (
        mutation.status === "syncing" &&
        (mutation.syncLeaseExpiresAt ?? 0) > now
      ) {
        return undefined;
      }

      const next: OfflineMutation = {
        ...mutation,
        status: "syncing",
        updatedAt: now,
        lastError: undefined,
        syncLeaseExpiresAt: now + OFFLINE_SYNC_LEASE_MS,
      };
      await putOfflineMutationWithSummary(offlineDb, next);
      return next;
    },
  );
  if (claimed) publishOfflineQueueChanged();
  return claimed;
}

/**
 * Settle only the exact sync claim that this document already started. This is
 * the one mutation transition allowed while an owner sign-out operation is in
 * `preparing`: aborting the network attempt must release `syncing` immediately
 * so the sign-out inventory and a later Stay/Sync-first retry see `failed`
 * instead of waiting for the lease to expire.
 *
 * This cannot claim, retry, enqueue, change payload, cross a commit fence, or
 * recreate a deleted mutation. A newer lease always wins over a stale caller.
 */
export async function settleClaimedOfflineMutationFailure(
  ownerUserId: string,
  id: string,
  claim: Pick<OfflineMutation, "updatedAt" | "syncLeaseExpiresAt">,
  options: { lastError: string },
): Promise<OfflineMutation | undefined> {
  if (!offlineDb || claim.syncLeaseExpiresAt === null) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const updated = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    offlineDb.mutationSummaries,
    offlineDb.ownerActivity,
    async () => {
      const activity = normalizeOwnerActivity(
        await offlineDb.ownerActivity.get(owner),
      );
      const localGeneration = localOwnerActivitySessionGenerations.get(owner);
      const canSettleDuringPreparation =
        Boolean(localGeneration) &&
        activity?.lifecycle === "active" &&
        activity.sessionGeneration === localGeneration &&
        activity.operations.some(
          (operation) =>
            operation.phase === "preparing" && operation.expiresAt > Date.now(),
        );
      if (!canSettleDuringPreparation) {
        await assertOwnerOfflineActivityAllowed(owner);
      }

      const mutation = await offlineDb.mutations.get(id);
      if (
        !mutation ||
        mutation.ownerUserId !== owner ||
        mutation.status !== "syncing" ||
        mutation.updatedAt !== claim.updatedAt ||
        mutation.syncLeaseExpiresAt !== claim.syncLeaseExpiresAt
      ) {
        return undefined;
      }

      const next: OfflineMutation = {
        ...mutation,
        status: "failed",
        updatedAt: Date.now(),
        lastError: boundedOfflineSyncError(options.lastError),
        syncLeaseExpiresAt: null,
      };
      await putOfflineMutationWithSummary(offlineDb, next);
      return next;
    },
  );
  if (updated) publishOfflineQueueChanged();
  return updated;
}

export async function completeOfflineMutation(
  ownerUserId: string,
  id: string,
  options: {
    payload: OfflineMutationPayload;
    syncResult: unknown;
  },
): Promise<OfflineMutation | undefined> {
  if (!offlineDb) return undefined;
  const owner = requireOwnerUserId(ownerUserId);
  const completed = await offlineDb.transaction(
    "rw",
    offlineDb.mutations,
    offlineDb.mutationSummaries,
    offlineDb.ownerActivity,
    async () => {
      await assertOwnerOfflineActivityAllowed(owner);
      const mutation = await offlineDb.mutations.get(id);
      if (!mutation || mutation.ownerUserId !== owner) return undefined;
      const next: OfflineMutation = {
        ...mutation,
        payload: options.payload,
        status: "synced",
        updatedAt: Date.now(),
        lastError: undefined,
        syncResult: options.syncResult,
        syncLeaseExpiresAt: null,
      };
      await putOfflineMutationWithSummary(offlineDb, next);
      return next;
    },
  );
  if (completed) publishOfflineQueueChanged();
  return completed;
}

export async function assertOwnerOfflineActivityAllowed(
  ownerUserId: string,
): Promise<void> {
  const owner = requireOwnerUserId(ownerUserId);
  if ((localOwnerActivityPauseTokens.get(owner)?.size ?? 0) > 0) {
    throw new OwnerOfflineActivityPausedError();
  }
  if (!offlineDb) return;
  const storedActivity = (await offlineDb.ownerActivity.get(owner)) as
    | OfflineOwnerActivity
    | LegacyOfflineOwnerActivity
    | undefined;
  const activity = normalizeOwnerActivity(storedActivity);
  const localGeneration = localOwnerActivitySessionGenerations.get(owner);

  if (!localGeneration) {
    throw new OwnerOfflineActivityPausedError();
  }

  if (!activity) {
    await offlineDb.ownerActivity.put(
      activeOwnerActivity(owner, localGeneration),
    );
    return;
  }

  if (
    activity.sessionGeneration !== localGeneration ||
    activity.lifecycle === "signed_out_fence"
  ) {
    throw new OwnerOfflineActivityPausedError();
  }

  const activeOperations = activity.operations.filter(
    (operation) =>
      operation.phase === "commit_pending" || operation.expiresAt > Date.now(),
  );
  if (activeOperations.length > 0) {
    throw new OwnerOfflineActivityPausedError();
  }

  if (activity.operations.length > 0) {
    await offlineDb.ownerActivity.put({
      ...activity,
      operations: [],
      updatedAt: Date.now(),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
  }
}

export function pauseOwnerOfflineActivityLocally(
  ownerUserId: string,
  pauseToken: string,
): void {
  const owner = requireOwnerUserId(ownerUserId);
  const pauseTokens = localOwnerActivityPauseTokens.get(owner) ?? new Set();
  pauseTokens.add(pauseToken);
  localOwnerActivityPauseTokens.set(owner, pauseTokens);
}

export function resumeOwnerOfflineActivityLocally(
  ownerUserId: string,
  pauseToken: string,
): void {
  const owner = requireOwnerUserId(ownerUserId);
  const pauseTokens = localOwnerActivityPauseTokens.get(owner);
  if (!pauseTokens) return;
  pauseTokens.delete(pauseToken);
  if (pauseTokens.size === 0) localOwnerActivityPauseTokens.delete(owner);
}

export function readLocalOwnerActivitySessionGeneration(ownerUserId: string) {
  return localOwnerActivitySessionGenerations.get(
    requireOwnerUserId(ownerUserId),
  );
}

export function setLocalOwnerActivitySessionGeneration(
  ownerUserId: string,
  sessionGeneration: string,
) {
  localOwnerActivitySessionGenerations.set(
    requireOwnerUserId(ownerUserId),
    requireOwnerActivitySessionGeneration(sessionGeneration),
  );
}

export function offlineDraftSummary(
  record: OfflineDraftRecord,
): OfflineDraftSummary {
  const payload = asRecord(record.payload);
  const draft = asRecord(payload?.draft);

  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    kind: record.kind,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    entryDate: normalizedSummaryDate(draft?.entryDate),
    targetObjectId:
      record.kind === "follow_up_entry"
        ? normalizedSummaryReference(payload?.plantObjectId)
        : null,
    targetSpaceId:
      record.kind === "space_entry"
        ? normalizedSummaryReference(payload?.spaceId)
        : record.kind === "first_entry"
          ? normalizedSummaryReference(draft?.spaceId)
          : null,
  };
}

export function offlineMutationSummary(
  mutation: OfflineMutation,
): OfflineMutationSummary {
  const payload = asRecord(mutation.payload);
  const target = normalizedJournalEntryTarget(payload?.target);

  return {
    id: mutation.id,
    ownerUserId: mutation.ownerUserId,
    kind: mutation.kind,
    status: mutation.status,
    workspaceVisible: mutation.status === "synced" ? 0 : 1,
    createdAt: mutation.createdAt,
    updatedAt: mutation.updatedAt,
    target,
    targetObjectId:
      target === "plant_object_entry"
        ? normalizedSummaryReference(payload?.plantObjectId)
        : null,
    targetSpaceId:
      target === "space_entry" || target === "first_plant_entry"
        ? normalizedSummaryReference(payload?.spaceId)
        : null,
  };
}

async function putOfflineMutationWithSummary(
  database: OverGardenOfflineDb,
  mutation: OfflineMutation,
) {
  await database.mutations.put(mutation);
  await database.mutationSummaries.put(offlineMutationSummary(mutation));
}

function emptyOfflineSummaryPage<T>(page: number): OfflineSummaryPage<T> {
  return {
    items: [],
    hasMore: false,
    page,
    pageSize: OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
  };
}

function normalizeWorkspaceSummaryPage(value: number | undefined) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(
    MAX_OFFLINE_WORKSPACE_SUMMARY_PAGE,
    Math.max(1, Math.trunc(value ?? 1)),
  );
}

function normalizeSummaryStatuses(
  values: readonly OfflineMutationStatus[] | undefined,
): OfflineMutationStatus[] {
  const allowed = new Set<OfflineMutationStatus>([
    "queued",
    "syncing",
    "failed",
    "synced",
  ]);
  const requested = values ?? ["queued", "syncing", "failed"];
  return [...new Set(requested.filter((value) => allowed.has(value)))];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedSummaryReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 160 ? normalized : null;
}

function normalizedSummaryDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizedJournalEntryTarget(
  value: unknown,
): JournalEntryTarget | null {
  return value === "first_plant_entry" ||
    value === "plant_object_entry" ||
    value === "space_entry"
    ? value
    : null;
}

function requireOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) throw new Error("Offline data requires an owner user id.");
  return normalized;
}

function normalizedOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  return normalized.length > 0 ? normalized : null;
}

function boundedOfflineSyncError(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "Sync failed.").slice(0, 160);
}

export function publishOfflineQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
}

interface LegacyOfflineOwnerActivity {
  ownerUserId: string;
  pauseToken: string;
  pausedAt: number;
  expiresAt: number;
}

function normalizeOwnerActivity(
  value: OfflineOwnerActivity | LegacyOfflineOwnerActivity | undefined,
): OfflineOwnerActivity | null {
  if (!value) return null;
  if (
    "sessionGeneration" in value &&
    "lifecycle" in value &&
    "operations" in value &&
    isOwnerActivitySessionGeneration(value.sessionGeneration) &&
    (value.lifecycle === "active" || value.lifecycle === "signed_out_fence") &&
    Array.isArray(value.operations)
  ) {
    return {
      ownerUserId: requireOwnerUserId(value.ownerUserId),
      sessionGeneration: value.sessionGeneration,
      lifecycle: value.lifecycle,
      operations: value.operations.filter(isOwnerActivityOperation),
      updatedAt:
        typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
          ? value.updatedAt
          : Date.now(),
      expiresAt:
        typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)
          ? value.expiresAt
          : Number.MAX_SAFE_INTEGER,
    };
  }

  if (
    "pauseToken" in value &&
    typeof value.pauseToken === "string" &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt)
  ) {
    if (value.expiresAt <= Date.now()) return null;
    return {
      ownerUserId: requireOwnerUserId(value.ownerUserId),
      sessionGeneration: `legacy-${value.pauseToken}`.slice(0, 128),
      lifecycle: "active",
      operations: [
        {
          operationId: `legacy-${value.pauseToken}`.slice(0, 128),
          phase: "preparing",
          expiresAt: value.expiresAt,
        },
      ],
      updatedAt: value.pausedAt,
      expiresAt: value.expiresAt,
    };
  }

  return null;
}

function isOwnerActivityOperation(
  value: unknown,
): value is OfflineOwnerActivityOperation {
  if (typeof value !== "object" || value === null) return false;
  const operation = value as Partial<OfflineOwnerActivityOperation>;
  return (
    typeof operation.operationId === "string" &&
    operation.operationId.length > 0 &&
    operation.operationId.length <= 128 &&
    (operation.phase === "preparing" || operation.phase === "commit_pending") &&
    typeof operation.expiresAt === "number" &&
    Number.isFinite(operation.expiresAt)
  );
}

function activeOwnerActivity(
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

function requireOwnerActivitySessionGeneration(sessionGeneration: string) {
  if (!isOwnerActivitySessionGeneration(sessionGeneration)) {
    throw new Error("Owner activity requires an opaque session generation.");
  }
  return sessionGeneration;
}

function isOwnerActivitySessionGeneration(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

// A File from <input type="file"> is backed by the on-disk file. iOS Safari and
// other WebKit builds can drop that backing store across a reload or tab
// eviction, which is exactly the offline -> reconnect -> retry window for a
// queued photo. Copy the bytes into an in-memory Blob so the persisted intent is
// owned by IndexedDB and survives that window instead of pointing at a file that
// may no longer be readable.
export async function createOfflinePhotoIntent(
  file: File,
): Promise<OfflinePhotoIntent> {
  const bytes = await file.arrayBuffer();
  return {
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    lastModified: file.lastModified,
    blob: new Blob([bytes], { type: file.type }),
  };
}
