"use client";

/**
 * A prepared composer stays frozen until the sign-out coordinator explicitly
 * resumes it. Successful sign-out and approved discard intentionally keep the
 * handle active until the document is replaced so discarded React state cannot
 * recreate an IndexedDB draft.
 */
export interface OwnerComposerPreparationHandle {
  isActive(): boolean;
  /**
   * Bind the durable owner-activity operation created after the initial flush.
   * Renewed flushes may use this exact, still-preparing operation to update the
   * draft while ordinary owner writes remain fenced.
   */
  bindOfflineActivityScope(scope: OwnerComposerOfflineActivityScope): void;
  flushLatest(): Promise<void>;
  resume(): Promise<void>;
}

export interface OwnerComposerOfflineActivityScope {
  operationId: string;
  sessionGeneration: string;
}

export interface OwnerComposerPersistenceWriteContext {
  offlineActivityScope?: OwnerComposerOfflineActivityScope;
}

export interface OwnerComposerPersistenceController<TSnapshot> {
  /** Replace the immutable, complete snapshot that the next write must store. */
  updateSnapshot(snapshot: TSnapshot): number;
  /** Persist the newest generation unless a sign-out preparation froze it. */
  persistLatest(): Promise<void>;
  /** True while one or more independent sign-out preparations own a freeze. */
  isFrozen(): boolean;
  /** Observe freeze transitions so every mutation control can be disabled. */
  subscribeFrozen(listener: (frozen: boolean) => void): () => void;
  /** Unregister this mounted composer and release its in-memory resources. */
  dispose(): void;
}

interface RegisteredOwnerComposerParticipant {
  freeze(token: symbol): void;
  flushLatest(token: symbol): Promise<void>;
  resume(token: symbol, flushNewestGeneration: boolean): Promise<void>;
}

interface OwnerComposerControllerOptions<TSnapshot> {
  ownerUserId: string;
  persist(
    snapshot: TSnapshot,
    context: OwnerComposerPersistenceWriteContext,
  ): Promise<void>;
  /**
   * Autosave/page-suspension writes stop after another durable handoff (submit,
   * queue, or cancel) takes ownership. Sign-out preparation always overrides
   * this callback so it can never turn a required flush into a successful no-op.
   */
  shouldPersistAutomatically?(): boolean;
}

interface SnapshotGeneration<TSnapshot> {
  generation: number;
  snapshot: TSnapshot;
}

const participantsByOwner = new Map<
  string,
  Set<RegisteredOwnerComposerParticipant>
>();
const activePreparationTokensByOwner = new Map<string, Set<symbol>>();
const offlineActivityScopesByPreparationToken = new Map<
  symbol,
  OwnerComposerOfflineActivityScope
>();

/**
 * Freeze every composer for this owner and durably flush its latest complete
 * generation. This must run before the durable owner-activity pause and before
 * the unsynced-data inventory used by sign-out.
 *
 * A rejection is fail-closed: all freezes acquired by this call are released,
 * and the caller must not continue to inventory, purge, or sign out.
 */
export async function prepareOwnerComposerParticipants(
  ownerUserId: string,
): Promise<OwnerComposerPreparationHandle> {
  const owner = requireOwnerUserId(ownerUserId);
  const token = Symbol("owner-composer-preparation");
  const activeTokens = activePreparationTokensByOwner.get(owner) ?? new Set();
  activeTokens.add(token);
  activePreparationTokensByOwner.set(owner, activeTokens);
  let active = true;

  const currentParticipants = () => [...(participantsByOwner.get(owner) ?? [])];
  for (const participant of currentParticipants()) participant.freeze(token);

  const deactivateToken = () => {
    offlineActivityScopesByPreparationToken.delete(token);
    activeTokens.delete(token);
    if (activeTokens.size === 0) activePreparationTokensByOwner.delete(owner);
  };

  const flushEveryCurrentParticipant = async () => {
    const flushedParticipants = new Set<RegisteredOwnerComposerParticipant>();
    while (true) {
      const participants = currentParticipants().filter(
        (participant) => !flushedParticipants.has(participant),
      );
      if (participants.length === 0) return;
      for (const participant of participants) participant.freeze(token);
      const results = await Promise.allSettled(
        participants.map((participant) => participant.flushLatest(token)),
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure) throw failure.reason;
      for (const participant of participants) {
        flushedParticipants.add(participant);
      }
    }
  };

  const resume = async () => {
    if (!active) return;
    // The coordinator resumes the durable owner-activity operation first.
    // Cancellation/Stay must therefore persist through the ordinary session
    // guard, never through a scope that has just been removed from IndexedDB.
    // Keep the composer token itself active so a failed write remains retryable.
    offlineActivityScopesByPreparationToken.delete(token);
    const resumedParticipants = new Set<RegisteredOwnerComposerParticipant>();
    while (true) {
      const participants = currentParticipants().filter(
        (participant) => !resumedParticipants.has(participant),
      );
      if (participants.length === 0) break;
      await Promise.all(
        participants.map((participant) => participant.resume(token, true)),
      );
      for (const participant of participants) {
        resumedParticipants.add(participant);
      }
    }
    deactivateToken();
    active = false;
  };

  try {
    await flushEveryCurrentParticipant();
  } catch (error) {
    deactivateToken();
    await Promise.allSettled(
      currentParticipants().map((participant) =>
        participant.resume(token, false),
      ),
    );
    active = false;
    throw error;
  }

  return {
    isActive: () => active,
    bindOfflineActivityScope: (scope) => {
      if (!active) {
        throw new Error("Cannot bind an inactive composer preparation.");
      }
      offlineActivityScopesByPreparationToken.set(
        token,
        requireOfflineActivityScope(scope),
      );
    },
    flushLatest: async () => {
      if (!active) return;
      await flushEveryCurrentParticipant();
    },
    resume,
  };
}

/**
 * Build and register the persistence participant used by a mounted composer.
 * Every write is serialized. If state advances while an async photo/blob write
 * is in flight, the loop writes the newer generation afterwards, guaranteeing
 * that the final durable value is the newest complete snapshot.
 */
export function createOwnerComposerPersistenceController<TSnapshot>(
  options: OwnerComposerControllerOptions<TSnapshot>,
): OwnerComposerPersistenceController<TSnapshot> {
  const owner = requireOwnerUserId(options.ownerUserId);
  let disposed = false;
  let generation = 0;
  let persistedGeneration = 0;
  let latest: SnapshotGeneration<TSnapshot> | null = null;
  let writeTail: Promise<void> = Promise.resolve();
  const freezeTokens = new Set<symbol>();
  const frozenListeners = new Set<(frozen: boolean) => void>();

  const notifyFrozen = () => {
    const frozen = freezeTokens.size > 0;
    for (const listener of frozenListeners) listener(frozen);
  };

  const flushLatest = (
    offlineActivityScope?: OwnerComposerOfflineActivityScope,
  ) => {
    if (disposed) return Promise.resolve();

    const write = async () => {
      while (
        !disposed &&
        latest !== null &&
        latest.generation !== persistedGeneration
      ) {
        const target = latest;
        await options.persist(target.snapshot, {
          offlineActivityScope,
        });
        persistedGeneration = target.generation;
      }
    };

    const result = writeTail.then(write, write);
    // A failed write must reject its own caller, but must not poison retries or
    // a later sign-out preparation for the lifetime of the mounted composer.
    writeTail = result.catch(() => undefined);
    return result;
  };

  const participant: RegisteredOwnerComposerParticipant = {
    freeze(token) {
      if (disposed || freezeTokens.has(token)) return;
      const wasFrozen = freezeTokens.size > 0;
      freezeTokens.add(token);
      if (!wasFrozen) notifyFrozen();
    },
    async flushLatest(token) {
      if (disposed || !freezeTokens.has(token)) return;
      await flushLatest(offlineActivityScopesByPreparationToken.get(token));
    },
    async resume(token, flushNewestGeneration) {
      if (!freezeTokens.has(token)) return;
      if (freezeTokens.size > 1) {
        freezeTokens.delete(token);
        return;
      }

      // Keep the UI inert while the newest generation is durably written. A
      // Stay/Sync-first action cannot claim recovery or navigate before this.
      if (flushNewestGeneration) {
        await flushLatest(offlineActivityScopesByPreparationToken.get(token));
      }
      freezeTokens.delete(token);
      notifyFrozen();
    },
  };

  const ownerParticipants = participantsByOwner.get(owner) ?? new Set();
  for (const token of activePreparationTokensByOwner.get(owner) ?? []) {
    participant.freeze(token);
  }
  ownerParticipants.add(participant);
  participantsByOwner.set(owner, ownerParticipants);

  const persistBeforeSuspension = () => {
    if (
      disposed ||
      freezeTokens.size > 0 ||
      options.shouldPersistAutomatically?.() === false
    ) {
      return;
    }
    void flushLatest().catch(() => undefined);
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") persistBeforeSuspension();
  };
  const canObserveDocument =
    typeof document !== "undefined" &&
    typeof document.addEventListener === "function";
  const canObserveWindow =
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function";
  if (canObserveDocument) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  if (canObserveWindow) {
    window.addEventListener("pagehide", persistBeforeSuspension);
  }

  return {
    updateSnapshot(snapshot) {
      if (disposed) {
        throw new Error("Cannot update a disposed composer participant.");
      }
      generation += 1;
      latest = { generation, snapshot };
      return generation;
    },
    persistLatest() {
      if (
        disposed ||
        freezeTokens.size > 0 ||
        options.shouldPersistAutomatically?.() === false
      ) {
        return Promise.resolve();
      }
      return flushLatest();
    },
    isFrozen: () => freezeTokens.size > 0,
    subscribeFrozen(listener) {
      if (disposed) {
        listener(false);
        return () => undefined;
      }
      frozenListeners.add(listener);
      listener(freezeTokens.size > 0);
      return () => frozenListeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (canObserveDocument) {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
      if (canObserveWindow) {
        window.removeEventListener("pagehide", persistBeforeSuspension);
      }
      freezeTokens.clear();
      frozenListeners.clear();
      ownerParticipants.delete(participant);
      if (ownerParticipants.size === 0) participantsByOwner.delete(owner);
    },
  };
}

function requireOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) {
    throw new Error("Composer persistence requires an owner user id.");
  }
  return normalized;
}

function requireOfflineActivityScope(
  scope: OwnerComposerOfflineActivityScope,
): OwnerComposerOfflineActivityScope {
  const operationId = scope.operationId.trim();
  const sessionGeneration = scope.sessionGeneration.trim();
  if (!operationId || operationId.length > 128) {
    throw new Error("Composer preparation requires a valid operation id.");
  }
  if (
    sessionGeneration.length < 12 ||
    sessionGeneration.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(sessionGeneration)
  ) {
    throw new Error(
      "Composer preparation requires an opaque session generation.",
    );
  }
  return { operationId, sessionGeneration };
}
