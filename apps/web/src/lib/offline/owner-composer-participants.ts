"use client";

/**
 * A prepared composer stays frozen until its owner-state transition explicitly
 * resumes it. A committed transition intentionally keeps the handle active
 * until the document is replaced so stale React state cannot recreate an
 * IndexedDB draft.
 */
export interface OwnerComposerTransitionPreparationHandle {
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

/**
 * Backwards-compatible OVE-204 name used by the sign-out convergence flow.
 */
export type OwnerComposerPreparationHandle =
  OwnerComposerTransitionPreparationHandle;

/** Payload-free document-wide preparation used by global shell transitions. */
export interface AllOwnerComposerTransitionPreparationHandle {
  isActive(): boolean;
  flushLatest(): Promise<void>;
  sealForDocumentReplacement(): Promise<void>;
  isDocumentReplacementParticipantSetStable(): boolean;
  resume(): Promise<void>;
  /** Release the locale-transition fence without an additional persistence wait. */
  cancel(): Promise<void>;
}

export interface StartedAllOwnerComposerTransitionPreparation
  extends AllOwnerComposerTransitionPreparationHandle {
  /** The initial durable flush started after the synchronous fence acquisition. */
  ready: Promise<void>;
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
  /** Persist the newest generation unless an owner transition froze it. */
  persistLatest(): Promise<void>;
  /** True while one or more independent owner transitions own a freeze. */
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
   * queue, or cancel) takes ownership. Owner-transition preparation always
   * overrides this callback so a required flush cannot become a successful
   * no-op.
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
const activeAllOwnerPreparationTokens = new Set<symbol>();
const sealedDocumentReplacementTokens = new Set<symbol>();
let allOwnerParticipantRevision = 0;
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
export async function prepareOwnerComposerTransitionParticipants(
  ownerUserId: string,
): Promise<OwnerComposerTransitionPreparationHandle> {
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
 * Prepare owner composers for OVE-204 sign-out/session convergence.
 *
 * This delegates to the generic owner-transition primitive so locale changes
 * and sign-out retain exactly the same freeze, latest-generation, and retry
 * semantics.
 */
export async function prepareOwnerComposerParticipants(
  ownerUserId: string,
): Promise<OwnerComposerPreparationHandle> {
  return prepareOwnerComposerTransitionParticipants(ownerUserId);
}

/**
 * Freeze and durably flush every composer currently mounted in this document,
 * regardless of owner. A single shell registration can therefore protect
 * account hydration races without receiving an owner id or any draft payload.
 *
 * The global token is inherited by composers and owner buckets mounted while a
 * flush or destination request is in flight. `flushLatest` reaches a fixed
 * point across those new participants. A failed preparation releases every
 * freeze it acquired; a failed resume keeps the handle active for retry.
 */
export function startAllOwnerComposerTransitionParticipants(): StartedAllOwnerComposerTransitionPreparation {
  const token = Symbol("all-owner-composer-transition-preparation");
  activeAllOwnerPreparationTokens.add(token);
  let active = true;
  let sealedParticipantRevision: number | null = null;

  const currentParticipants = () => [
    ...new Set(
      [...participantsByOwner.values()].flatMap((participants) => [
        ...participants,
      ]),
    ),
  ];
  for (const participant of currentParticipants()) participant.freeze(token);

  const deactivateToken = () => {
    activeAllOwnerPreparationTokens.delete(token);
    sealedDocumentReplacementTokens.delete(token);
    sealedParticipantRevision = null;
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

  const release = async (flushNewestGeneration: boolean) => {
    if (!active) return;
    const resumedParticipants = new Set<RegisteredOwnerComposerParticipant>();
    while (true) {
      const participants = currentParticipants().filter(
        (participant) => !resumedParticipants.has(participant),
      );
      if (participants.length === 0) break;
      await Promise.all(
        participants.map((participant) =>
          participant.resume(token, flushNewestGeneration),
        ),
      );
      for (const participant of participants) {
        resumedParticipants.add(participant);
      }
    }
    deactivateToken();
    active = false;
  };

  const ready = flushEveryCurrentParticipant();
  return {
    isActive: () => active,
    ready,
    flushLatest: async () => {
      if (!active) return;
      await flushEveryCurrentParticipant();
    },
    sealForDocumentReplacement: async () => {
      if (!active) return;
      sealedDocumentReplacementTokens.add(token);
      try {
        await flushEveryCurrentParticipant();
        sealedParticipantRevision = allOwnerParticipantRevision;
      } catch (error) {
        sealedDocumentReplacementTokens.delete(token);
        sealedParticipantRevision = null;
        throw error;
      }
    },
    isDocumentReplacementParticipantSetStable: () =>
      active &&
      sealedParticipantRevision !== null &&
      sealedParticipantRevision === allOwnerParticipantRevision,
    resume: () => release(true),
    cancel: () => release(false),
  };
}

/**
 * Compatibility wrapper for OVE-204 and callers that need preparation only
 * after the initial flush. Locale transitions use the started form above so a
 * stalled IndexedDB write can always be cancelled through its acquired fence.
 */
export async function prepareAllOwnerComposerTransitionParticipants(): Promise<AllOwnerComposerTransitionPreparationHandle> {
  const preparation = startAllOwnerComposerTransitionParticipants();
  try {
    await preparation.ready;
    return preparation;
  } catch (error) {
    await preparation.cancel().catch(() => undefined);
    throw error;
  }
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
  const inheritedSealedFreezeTokens = new Set<symbol>();
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
      if (sealedDocumentReplacementTokens.has(token)) {
        inheritedSealedFreezeTokens.add(token);
      }
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
        inheritedSealedFreezeTokens.delete(token);
        return;
      }

      // Keep the UI inert while the newest generation is durably written. A
      // Stay/Sync-first action cannot claim recovery or navigate before this.
      if (flushNewestGeneration) {
        await flushLatest(offlineActivityScopesByPreparationToken.get(token));
      }
      freezeTokens.delete(token);
      inheritedSealedFreezeTokens.delete(token);
      notifyFrozen();
    },
  };

  const ownerParticipants = participantsByOwner.get(owner) ?? new Set();
  for (const token of activePreparationTokensByOwner.get(owner) ?? []) {
    participant.freeze(token);
  }
  for (const token of activeAllOwnerPreparationTokens) {
    participant.freeze(token);
  }
  ownerParticipants.add(participant);
  participantsByOwner.set(owner, ownerParticipants);
  allOwnerParticipantRevision += 1;

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
      if (
        [...freezeTokens].some(
          (token) =>
            sealedDocumentReplacementTokens.has(token) &&
            !inheritedSealedFreezeTokens.has(token),
        )
      ) {
        return generation;
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
      inheritedSealedFreezeTokens.clear();
      frozenListeners.clear();
      if (ownerParticipants.delete(participant)) {
        allOwnerParticipantRevision += 1;
      }
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
