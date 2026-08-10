"use client";

import Dexie, { type Table } from "dexie";

import type {
  OfflineComposerDurabilityRecord,
  OfflineDraftRecord,
  OfflineDraftSummary,
  OfflineMutation,
  OfflineMutationSummary,
  OfflineOwnerActivity,
} from "./queue";

export const OWNER_VAULT_DATABASE_PREFIX = "overgarden-offline-owner-v1-";
export const OWNER_VAULT_CONTROL_DATABASE = "overgarden-control-v1";
export const OWNER_VAULT_OPERATION_DEADLINE_MS = 3_000;

const OPAQUE_OWNER_BINDING = /^[A-Za-z0-9_-]{43}$/;
const OWNER_VAULT_BINDING_PROTOCOL = "ove288.owner-vault-binding.v1";
const OWNER_VAULT_CONTROL_PROTOCOL = "ove288.owner-vault-control.v1";

export interface OwnerVaultRowCounts {
  mutations: number;
  drafts: number;
  mutationSummaries: number;
  draftSummaries: number;
  composerDurability: number;
  ownerActivity: number;
}

export type OwnerVaultControlState =
  | "migration_unstarted"
  | "copying"
  | "conflict_blocked"
  | "active"
  | "cleanup_deferred"
  | "erasure_unconfirmed"
  | "erased_confirmed";

export interface OwnerVaultControlRecord {
  binding: string;
  protocol: typeof OWNER_VAULT_CONTROL_PROTOCOL;
  state: OwnerVaultControlState;
  counts: OwnerVaultRowCounts;
  digest: string;
  sourceCleanupConfirmed: boolean;
  operationId?: string;
  leaseExpiresAt?: number;
  updatedAt: number;
}

interface OwnerVaultWriterLeaseRecord {
  key: string;
  binding: string;
  operationId: string;
  expiresAt: number;
  updatedAt: number;
}

export class OwnerVaultControlDb extends Dexie {
  vaults!: Table<OwnerVaultControlRecord, string>;
  writerLeases!: Table<OwnerVaultWriterLeaseRecord, string>;

  constructor() {
    super(OWNER_VAULT_CONTROL_DATABASE);
    this.version(1).stores({
      vaults: "binding, state, updatedAt",
      writerLeases: "key, binding, expiresAt",
    });
  }
}

export class OwnerVaultWriterFencedError extends Error {
  constructor() {
    super("The owner vault is exclusively fenced.");
    this.name = "OwnerVaultWriterFencedError";
  }
}

export class OwnerVaultUnavailableError extends Error {
  constructor() {
    super("The authenticated owner vault is unavailable.");
    this.name = "OwnerVaultUnavailableError";
  }
}

export interface OwnerVaultExclusiveFence {
  binding: string;
  operationId: string;
  previous: OwnerVaultControlRecord | null;
}

/** Current physical schema for one opaque owner namespace. */
export class OwnerVaultDb extends Dexie {
  mutations!: Table<OfflineMutation, string>;
  drafts!: Table<OfflineDraftRecord, [string, string]>;
  mutationSummaries!: Table<OfflineMutationSummary, [string, string]>;
  draftSummaries!: Table<OfflineDraftSummary, [string, string]>;
  composerDurability!: Table<OfflineComposerDurabilityRecord, [string, string]>;
  ownerActivity!: Table<OfflineOwnerActivity, string>;

  readonly binding: string;

  constructor(binding: string) {
    const normalizedBinding = requireOwnerVaultBinding(binding);
    super(offlineOwnerVaultDatabaseName(normalizedBinding));
    this.binding = normalizedBinding;
    this.version(1).stores({
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

export interface OwnerOfflineDatabase extends Dexie {
  mutations: Table<OfflineMutation, string>;
  drafts: Table<OfflineDraftRecord, [string, string]>;
  mutationSummaries: Table<OfflineMutationSummary, [string, string]>;
  draftSummaries: Table<OfflineDraftSummary, [string, string]>;
  composerDurability: Table<OfflineComposerDurabilityRecord, [string, string]>;
  ownerActivity: Table<OfflineOwnerActivity, string>;
}

export type ActiveOwnerOfflineDatabase = OwnerOfflineDatabase;

interface ActiveOwnerVault {
  binding: string;
  database: ActiveOwnerOfflineDatabase;
  lifetime: AbortController;
}

// Raw owner ids are retained only in this document-local authorization map.
// IndexedDB discovery and the physical database name use the opaque binding.
const activeOwnerVaults = new Map<string, ActiveOwnerVault>();

export async function withOwnerVaultWriterLease<T>(
  ownerUserId: string,
  operation: (database: OwnerOfflineDatabase) => Promise<T>,
): Promise<T> {
  const owner = requireOwnerUserId(ownerUserId);
  const active = activeOwnerVaults.get(owner);
  if (!active) throw new OwnerVaultWriterFencedError();
  // Pre-OVE-288 tests exercise the known logical schema directly. The seam is
  // installed only under NODE_ENV=test and never writes a production control
  // record or weakens the physical runtime path.
  if (!(active.database instanceof OwnerVaultDb)) {
    if (process.env.NODE_ENV !== "test")
      throw new OwnerVaultWriterFencedError();
    return operation(active.database);
  }

  const operationId = crypto.randomUUID();
  const leaseKey = `${active.binding}:${operationId}`;
  const control = new OwnerVaultControlDb();
  let leaseAcquired = false;
  try {
    leaseAcquired = await control.transaction(
      "rw",
      control.vaults,
      control.writerLeases,
      async () => {
        const now = Date.now();
        const vault = await control.vaults.get(active.binding);
        if (vault?.operationId) {
          return false;
        }
        await control.writerLeases
          .where("binding")
          .equals(active.binding)
          .and((lease) => lease.expiresAt <= now)
          .delete();
        await control.writerLeases.put({
          key: leaseKey,
          binding: active.binding,
          operationId,
          expiresAt: now + OWNER_VAULT_OPERATION_DEADLINE_MS * 2,
          updatedAt: now,
        });
        return true;
      },
    );
    if (!leaseAcquired) throw new OwnerVaultWriterFencedError();
    return await operation(active.database);
  } finally {
    if (leaseAcquired) {
      await control.writerLeases.delete(leaseKey).catch(() => undefined);
    }
    control.close();
  }
}

export async function acquireOwnerVaultExclusiveFence(
  binding: string,
  state: Extract<OwnerVaultControlState, "copying" | "erasure_unconfirmed">,
): Promise<OwnerVaultExclusiveFence | null> {
  const opaqueBinding = requireOwnerVaultBinding(binding);
  const operationId = crypto.randomUUID();
  const control = new OwnerVaultControlDb();
  try {
    return await control.transaction(
      "rw",
      control.vaults,
      control.writerLeases,
      async () => {
        const now = Date.now();
        const previous = (await control.vaults.get(opaqueBinding)) ?? null;
        if (previous?.operationId && (previous.leaseExpiresAt ?? 0) > now) {
          return null;
        }
        await control.writerLeases
          .where("binding")
          .equals(opaqueBinding)
          .and((lease) => lease.expiresAt <= now)
          .delete();
        await control.vaults.put({
          binding: opaqueBinding,
          protocol: OWNER_VAULT_CONTROL_PROTOCOL,
          state,
          counts: previous?.counts ?? emptyOwnerVaultCounts(),
          digest: previous?.digest ?? "0".repeat(64),
          sourceCleanupConfirmed: false,
          operationId,
          leaseExpiresAt: now + OWNER_VAULT_OPERATION_DEADLINE_MS * 4,
          updatedAt: now,
        });
        return { binding: opaqueBinding, operationId, previous };
      },
    );
  } finally {
    control.close();
  }
}

export async function waitForOwnerVaultWritersToSettle(
  fence: OwnerVaultExclusiveFence,
  options: {
    deadlineAt?: number;
    signal?: AbortSignal;
  } = {},
): Promise<boolean> {
  const deadlineAt =
    options.deadlineAt ?? performance.now() + OWNER_VAULT_OPERATION_DEADLINE_MS;
  const control = new OwnerVaultControlDb();
  try {
    while (true) {
      throwIfOwnerVaultWaitCancelled(options.signal);
      const remainingWriters = await control.transaction(
        "rw",
        control.vaults,
        control.writerLeases,
        async () => {
          const now = Date.now();
          const current = await control.vaults.get(fence.binding);
          if (current?.operationId !== fence.operationId) {
            throw new Error("Owner vault exclusive fence changed.");
          }
          await control.writerLeases
            .where("binding")
            .equals(fence.binding)
            .and((lease) => lease.expiresAt <= now)
            .delete();
          return control.writerLeases
            .where("binding")
            .equals(fence.binding)
            .count();
        },
      );
      if (remainingWriters === 0) return true;
      const remainingMs = deadlineAt - performance.now();
      if (remainingMs <= 0) return false;
      await waitForOwnerVaultRetry(
        Math.min(20, Math.max(1, Math.ceil(remainingMs))),
        options.signal,
      );
    }
  } finally {
    control.close();
  }
}

export async function finalizeOwnerVaultExclusiveFence(
  fence: OwnerVaultExclusiveFence,
  receipt: Pick<
    OwnerVaultControlRecord,
    "state" | "counts" | "digest" | "sourceCleanupConfirmed"
  >,
): Promise<void> {
  const control = new OwnerVaultControlDb();
  try {
    await control.transaction("rw", control.vaults, async () => {
      const current = await control.vaults.get(fence.binding);
      if (current?.operationId !== fence.operationId) {
        throw new Error("Owner vault exclusive fence changed.");
      }
      await control.vaults.put({
        binding: fence.binding,
        protocol: OWNER_VAULT_CONTROL_PROTOCOL,
        ...receipt,
        updatedAt: Date.now(),
      });
    });
  } finally {
    control.close();
  }
}

export async function abandonOwnerVaultExclusiveFence(
  fence: OwnerVaultExclusiveFence,
): Promise<void> {
  await finalizeOwnerVaultExclusiveFence(fence, {
    state: fence.previous?.state ?? "migration_unstarted",
    counts: fence.previous?.counts ?? emptyOwnerVaultCounts(),
    digest: fence.previous?.digest ?? "0".repeat(64),
    sourceCleanupConfirmed: fence.previous?.sourceCleanupConfirmed ?? false,
  });
}

export function offlineOwnerVaultDatabaseName(binding: string): string {
  return `${OWNER_VAULT_DATABASE_PREFIX}${requireOwnerVaultBinding(binding)}`;
}

export function hasOwnerVaultBinding(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_OWNER_BINDING.test(value);
}

export async function fetchAuthenticatedOwnerVaultBinding(
  expectedSessionGeneration: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<string | null> {
  if (!hasOwnerVaultBinding(expectedSessionGeneration) || !fetcher) return null;
  try {
    const response = await fetcher("/api/offline/owner-vault-binding", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const value = (await response.json()) as Record<string, unknown>;
    return value.protocol === OWNER_VAULT_BINDING_PROTOCOL &&
      hasOwnerVaultBinding(value.binding) &&
      value.sessionGeneration === expectedSessionGeneration
      ? value.binding
      : null;
  } catch {
    return null;
  }
}

export async function activatePhysicalOwnerVault(
  ownerUserId: string,
  binding: string,
): Promise<OwnerVaultDb> {
  const owner = requireOwnerUserId(ownerUserId);
  const opaqueBinding = requireOwnerVaultBinding(binding);
  const current = activeOwnerVaults.get(owner);
  if (current?.binding === opaqueBinding)
    return current.database as OwnerVaultDb;

  for (const [activeOwner, vault] of activeOwnerVaults) {
    if (activeOwner !== owner && vault.binding === opaqueBinding) {
      throw new Error("The opaque owner vault binding is already active.");
    }
  }

  if (current) {
    current.lifetime.abort();
    if (current.database instanceof OwnerVaultDb) current.database.close();
    activeOwnerVaults.delete(owner);
  }

  const database = new OwnerVaultDb(opaqueBinding);
  await database.open();
  activeOwnerVaults.set(owner, {
    binding: opaqueBinding,
    database,
    lifetime: new AbortController(),
  });
  return database;
}

export function resolveOwnerOfflineDatabase(
  ownerUserId: string,
): ActiveOwnerOfflineDatabase | undefined {
  const owner = normalizedOwnerUserId(ownerUserId);
  return owner ? activeOwnerVaults.get(owner)?.database : undefined;
}

export function requireOwnerOfflineDatabase(
  ownerUserId: string,
): ActiveOwnerOfflineDatabase {
  const owner = requireOwnerUserId(ownerUserId);
  const database = activeOwnerVaults.get(owner)?.database;
  if (!database) throw new OwnerVaultUnavailableError();
  return database;
}

export function readActiveOwnerVaultBinding(
  ownerUserId: string,
): string | null {
  const owner = normalizedOwnerUserId(ownerUserId);
  return owner ? (activeOwnerVaults.get(owner)?.binding ?? null) : null;
}

export function readActiveOwnerVaultLifetimeSignal(
  ownerUserId: string,
  binding: string,
): AbortSignal | null {
  const owner = normalizedOwnerUserId(ownerUserId);
  if (!owner || !hasOwnerVaultBinding(binding)) return null;
  const active = activeOwnerVaults.get(owner);
  return active?.binding === binding ? active.lifetime.signal : null;
}

export async function deactivatePhysicalOwnerVault(
  ownerUserId: string,
): Promise<void> {
  const owner = normalizedOwnerUserId(ownerUserId);
  if (!owner) return;
  const active = activeOwnerVaults.get(owner);
  if (!active) return;
  activeOwnerVaults.delete(owner);
  active.lifetime.abort();
  if (active.database instanceof OwnerVaultDb) active.database.close();
}

export async function deleteResolvedPhysicalOwnerVault(
  ownerUserId: string,
  binding: string,
): Promise<{ attempted: true; absenceConfirmed: boolean }> {
  const owner = requireOwnerUserId(ownerUserId);
  const opaqueBinding = requireOwnerVaultBinding(binding);
  const active = activeOwnerVaults.get(owner);
  if (active && active.binding !== opaqueBinding) {
    throw new Error("The active owner vault binding changed.");
  }
  for (const [activeOwner, vault] of activeOwnerVaults) {
    if (activeOwner !== owner && vault.binding === opaqueBinding) {
      throw new Error("The owner vault binding is active for another owner.");
    }
  }
  const databaseName = offlineOwnerVaultDatabaseName(opaqueBinding);
  if (active) {
    activeOwnerVaults.delete(owner);
    active.lifetime.abort();
    active.database.close();
  }
  await Dexie.delete(databaseName);
  return {
    attempted: true,
    absenceConfirmed: !(await Dexie.exists(databaseName)),
  };
}

/**
 * Compatibility seam for the pre-OVE-288 unit corpus. Production hydration
 * never calls this path; it exists so legacy logical-isolation tests can keep
 * exercising their fixtures while new coverage proves the physical boundary.
 */
export function activateLegacyOwnerDatabaseForTesting(
  ownerUserId: string,
  database: OwnerOfflineDatabase,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The legacy owner database seam is test-only.");
  }
  const owner = requireOwnerUserId(ownerUserId);
  const current = activeOwnerVaults.get(owner);
  if (current) {
    current.lifetime.abort();
    if (current.database instanceof OwnerVaultDb) current.database.close();
  }
  activeOwnerVaults.set(owner, {
    binding: `legacy-test-${owner}`,
    database,
    lifetime: new AbortController(),
  });
}

function requireOwnerVaultBinding(value: string): string {
  if (!hasOwnerVaultBinding(value)) {
    throw new TypeError("An opaque owner vault binding is required.");
  }
  return value;
}

function requireOwnerUserId(value: string): string {
  const owner = normalizedOwnerUserId(value);
  if (!owner) throw new TypeError("An owner user id is required.");
  return owner;
}

function normalizedOwnerUserId(value: string): string | null {
  if (typeof value !== "string") return null;
  const owner = value.trim();
  return owner.length > 0 ? owner : null;
}

function emptyOwnerVaultCounts(): OwnerVaultRowCounts {
  return {
    mutations: 0,
    drafts: 0,
    mutationSummaries: 0,
    draftSummaries: 0,
    composerDurability: 0,
    ownerActivity: 0,
  };
}

function throwIfOwnerVaultWaitCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("Owner vault fence wait cancelled.", "AbortError");
  }
}

function waitForOwnerVaultRetry(
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(
        new DOMException("Owner vault fence wait cancelled.", "AbortError"),
      );
    };
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
