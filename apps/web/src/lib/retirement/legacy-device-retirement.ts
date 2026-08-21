"use client";

export const LEGACY_RETIREMENT_BATCH_SIZE = 200;
export const LEGACY_RETIREMENT_NETWORK_DEADLINE_MS = 30_000;
export const LEGACY_RETIREMENT_STORAGE_DEADLINE_MS = 3_000;

export type LegacyRetirementState =
  | "checking"
  | "absent"
  | "detected"
  | "offered"
  | "transferring"
  | "verifying"
  | "deleting"
  | "completed"
  | "failed_retryable"
  | "conflict_blocked"
  | "another_account"
  | "foreign_or_orphan_retained"
  | "divergent_copy"
  | "bounded_inventory"
  | "discard_confirmation"
  | "deletion_blocked"
  | "session_changed";

export type LegacyRetirementFaultState = Extract<
  LegacyRetirementState,
  | "failed_retryable"
  | "conflict_blocked"
  | "another_account"
  | "foreign_or_orphan_retained"
  | "bounded_inventory"
  | "deletion_blocked"
  | "session_changed"
>;

export interface LegacyRetirementIdentity {
  ownerUserId: string;
  ownerVaultBinding: string;
  sessionGeneration: string;
  documentMutationGeneration: string;
}

export interface LegacyRetirementItem {
  /** Opaque, document-local handle. It must never encode content or identity. */
  token: string;
  kind: "draft" | "mutation" | "synced_receipt" | "photo_upload";
  mediaIntentCount: number;
  updatedAt: number;
}

export interface LegacyRetirementInventory {
  items: LegacyRetirementItem[];
  bounded: boolean;
  foreignBindingCount: number;
  foreignOwnerResidueCount: number;
  capability:
    | "enumeration_available"
    | "registry_fallback"
    | "enumeration_unavailable";
}

export type LegacyRetirementTransferResult =
  | { status: "verified" }
  | {
      status: "divergent_copy";
      deviceUpdatedAt: number;
      serverUpdatedAt: number;
    }
  | { status: "another_account" };

export interface LegacyRetirementFinalizeReceipt {
  status: "completed" | "deletion_blocked";
  absenceReads: 0 | 1 | 2;
  foreignOwnerResidue: boolean;
  foreignOrOrphanRetained: boolean;
}

export interface LegacyDeviceRetirementPort {
  inspect(
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ): Promise<LegacyRetirementInventory>;
  assertSession(
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ): Promise<boolean>;
  transferAndVerify(
    item: LegacyRetirementItem,
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
    divergenceChoice?: "device" | "server",
  ): Promise<LegacyRetirementTransferResult>;
  deleteVerifiedBatch(
    items: LegacyRetirementItem[],
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ): Promise<void>;
  discardCurrentOwner(
    items: LegacyRetirementItem[],
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ): Promise<void>;
  finalize(
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ): Promise<LegacyRetirementFinalizeReceipt>;
}

export interface LegacyRetirementSnapshot {
  state: LegacyRetirementState;
  visible: boolean;
  counts: {
    drafts: number;
    mutations: number;
    syncedReceipts: number;
    photoUploads: number;
    mediaIntents: number;
    total: number;
  };
  progress: { verified: number; deleted: number; total: number };
  capability: LegacyRetirementInventory["capability"] | null;
  absenceReads: 0 | 1 | 2;
  foreignResidue: { bindings: number; sharedRows: number };
  divergence: {
    itemKind: LegacyRetirementItem["kind"];
    deviceUpdatedAt: number;
    serverUpdatedAt: number;
  } | null;
  discardConfirmationStep: 0 | 1 | 2;
  errorCode: string | null;
  lastAction: "cancelled" | null;
}

export class LegacyRetirementPortError extends Error {
  constructor(
    readonly state: LegacyRetirementFaultState,
    readonly code: string,
  ) {
    super("Legacy device retirement did not complete.");
    this.name = "LegacyRetirementPortError";
  }
}

export interface LegacyDeviceRetirementController {
  getSnapshot(): LegacyRetirementSnapshot;
  subscribe(listener: () => void): () => void;
  inspect(): Promise<void>;
  transfer(): Promise<void>;
  retry(): Promise<void>;
  cancel(): void;
  requestDiscard(): void;
  cancelDiscard(): void;
  confirmDiscard(): Promise<void>;
  resolveDivergence(choice: "device" | "server"): Promise<void>;
}

export function createLegacyDeviceRetirementController(input: {
  identity: LegacyRetirementIdentity;
  port: LegacyDeviceRetirementPort;
  networkDeadlineMs?: number;
  storageDeadlineMs?: number;
}): LegacyDeviceRetirementController {
  const networkDeadlineMs = boundedDeadline(
    input.networkDeadlineMs,
    LEGACY_RETIREMENT_NETWORK_DEADLINE_MS,
  );
  const storageDeadlineMs = boundedDeadline(
    input.storageDeadlineMs,
    LEGACY_RETIREMENT_STORAGE_DEADLINE_MS,
  );
  const listeners = new Set<() => void>();
  let inventory: LegacyRetirementInventory | null = null;
  let activeController: AbortController | null = null;
  let operationId = 0;
  let visibleOnce = false;
  let divergentItem: LegacyRetirementItem | null = null;
  let snapshot = initialSnapshot();

  const publish = (next: LegacyRetirementSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const patch = (next: Partial<LegacyRetirementSnapshot>) => {
    publish({ ...snapshot, ...next });
  };

  const beginOperation = () => {
    operationId += 1;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    return { id: operationId, controller };
  };

  const isCurrent = (id: number) => id === operationId;

  async function inspect() {
    const operation = beginOperation();
    patch({
      state: "checking",
      visible: visibleOnce,
      errorCode: null,
      lastAction: null,
      divergence: null,
      discardConfirmationStep: 0,
    });
    try {
      const inspected = await withinDeadline(
        (signal) => input.port.inspect(input.identity, signal),
        storageDeadlineMs,
        operation.controller.signal,
      );
      if (!isCurrent(operation.id)) return;
      inventory = sanitizedInventory(inspected);
      const counts = countInventory(inventory.items);
      patch({
        state: "detected",
        counts,
        progress: { verified: 0, deleted: 0, total: counts.total },
        capability: inventory.capability,
        foreignResidue: {
          bindings: inventory.foreignBindingCount,
          sharedRows: inventory.foreignOwnerResidueCount,
        },
      });
      if (inventory.bounded) {
        visibleOnce = true;
        patch({ state: "bounded_inventory", visible: true });
        return;
      }
      if (inventory.items.length > 0) {
        visibleOnce = true;
        patch({ state: "offered", visible: true });
        return;
      }
      if (
        inventory.foreignBindingCount > 0 ||
        inventory.foreignOwnerResidueCount > 0
      ) {
        visibleOnce = true;
        patch({ state: "foreign_or_orphan_retained", visible: true });
        return;
      }
      patch({ state: "absent", visible: false });
      await finalize(operation);
    } catch (error) {
      settleFailure(error, operation.id);
    } finally {
      if (isCurrent(operation.id)) activeController = null;
    }
  }

  async function transfer() {
    if (!inventory || inventory.items.length === 0) return;
    if (
      snapshot.state !== "offered" &&
      snapshot.state !== "failed_retryable" &&
      snapshot.state !== "conflict_blocked"
    ) {
      return;
    }
    const operation = beginOperation();
    patch({
      state: "transferring",
      visible: true,
      errorCode: null,
      lastAction: null,
      divergence: null,
      discardConfirmationStep: 0,
    });
    try {
      const completed = await transferItems(inventory.items, operation);
      if (!isCurrent(operation.id) || !completed) return;
      await finalize(operation);
    } catch (error) {
      settleFailure(error, operation.id);
    } finally {
      if (isCurrent(operation.id)) activeController = null;
    }
  }

  async function transferItems(
    items: LegacyRetirementItem[],
    operation: { id: number; controller: AbortController },
  ) {
    for (
      let offset = 0;
      offset < items.length;
      offset += LEGACY_RETIREMENT_BATCH_SIZE
    ) {
      const batch = items.slice(offset, offset + LEGACY_RETIREMENT_BATCH_SIZE);
      const verified: LegacyRetirementItem[] = [];
      for (const item of batch) {
        if (!(await sessionStillMatches(operation))) return false;
        const result = await withinDeadline(
          (signal) =>
            input.port.transferAndVerify(item, input.identity, signal),
          networkDeadlineMs,
          operation.controller.signal,
        );
        if (!isCurrent(operation.id)) return;
        if (result.status === "another_account") {
          throw new LegacyRetirementPortError(
            "another_account",
            "another_account",
          );
        }
        if (result.status === "divergent_copy") {
          divergentItem = item;
          patch({
            state: "divergent_copy",
            divergence: {
              itemKind: item.kind,
              deviceUpdatedAt: boundedTimestamp(result.deviceUpdatedAt),
              serverUpdatedAt: boundedTimestamp(result.serverUpdatedAt),
            },
          });
          return false;
        }
        verified.push(item);
        patch({
          progress: {
            ...snapshot.progress,
            verified: snapshot.progress.verified + 1,
          },
        });
      }
      if (!isCurrent(operation.id) || verified.length !== batch.length)
        return false;
      patch({ state: "verifying" });
      if (!(await sessionStillMatches(operation))) return false;
      patch({ state: "deleting" });
      await withinDeadline(
        (signal) =>
          input.port.deleteVerifiedBatch(verified, input.identity, signal),
        storageDeadlineMs,
        operation.controller.signal,
      );
      if (!isCurrent(operation.id)) return;
      const deletedTokens = new Set(verified.map(({ token }) => token));
      if (inventory) {
        inventory = {
          ...inventory,
          items: inventory.items.filter(
            ({ token }) => !deletedTokens.has(token),
          ),
        };
      }
      patch({
        state: "transferring",
        progress: {
          ...snapshot.progress,
          deleted: snapshot.progress.deleted + verified.length,
        },
      });
    }
    return true;
  }

  async function sessionStillMatches(operation: {
    id: number;
    controller: AbortController;
  }) {
    const matches = await withinDeadline(
      (signal) => input.port.assertSession(input.identity, signal),
      networkDeadlineMs,
      operation.controller.signal,
    );
    if (!isCurrent(operation.id)) return false;
    if (!matches) {
      patch({ state: "session_changed", errorCode: "session_changed" });
      return false;
    }
    return true;
  }

  async function finalize(operation: {
    id: number;
    controller: AbortController;
  }) {
    if (!isCurrent(operation.id)) return;
    patch({ state: "deleting" });
    const receipt = await withinDeadline(
      (signal) => input.port.finalize(input.identity, signal),
      storageDeadlineMs,
      operation.controller.signal,
    );
    if (!isCurrent(operation.id)) return;
    if (receipt.status !== "completed" || receipt.absenceReads !== 2) {
      throw new LegacyRetirementPortError(
        "deletion_blocked",
        "absence_unconfirmed",
      );
    }
    inventory = { ...inventory!, items: [] };
    divergentItem = null;
    patch({
      state: "completed",
      visible: visibleOnce,
      absenceReads: 2,
      errorCode: null,
      divergence: null,
      discardConfirmationStep: 0,
      foreignResidue: {
        bindings: receipt.foreignOrOrphanRetained
          ? Math.max(1, snapshot.foreignResidue.bindings)
          : 0,
        sharedRows: receipt.foreignOwnerResidue
          ? Math.max(1, snapshot.foreignResidue.sharedRows)
          : 0,
      },
    });
  }

  async function retry() {
    if (
      snapshot.state === "failed_retryable" ||
      snapshot.state === "conflict_blocked"
    ) {
      await transfer();
      return;
    }
    await inspect();
  }

  function cancel() {
    if (!activeController) return;
    operationId += 1;
    activeController.abort();
    activeController = null;
    patch({
      state: inventory?.items.length ? "offered" : "completed",
      visible: Boolean(inventory?.items.length) || visibleOnce,
      errorCode: null,
      lastAction: "cancelled",
      divergence: null,
      discardConfirmationStep: 0,
    });
  }

  function requestDiscard() {
    if (!inventory?.items.length || activeController) return;
    patch({
      state: "discard_confirmation",
      discardConfirmationStep: 1,
      errorCode: null,
      lastAction: null,
    });
  }

  function cancelDiscard() {
    if (snapshot.state !== "discard_confirmation") return;
    patch({ state: "offered", discardConfirmationStep: 0 });
  }

  async function confirmDiscard() {
    if (snapshot.state !== "discard_confirmation" || !inventory?.items.length)
      return;
    if (snapshot.discardConfirmationStep === 1) {
      patch({ discardConfirmationStep: 2 });
      return;
    }
    const operation = beginOperation();
    patch({ state: "deleting", errorCode: null });
    try {
      if (!(await sessionStillMatches(operation))) return;
      await withinDeadline(
        (signal) =>
          input.port.discardCurrentOwner(
            inventory!.items,
            input.identity,
            signal,
          ),
        storageDeadlineMs,
        operation.controller.signal,
      );
      if (!isCurrent(operation.id)) return;
      patch({
        progress: {
          ...snapshot.progress,
          deleted: snapshot.progress.total,
        },
      });
      await finalize(operation);
    } catch (error) {
      settleFailure(error, operation.id);
    } finally {
      if (isCurrent(operation.id)) activeController = null;
    }
  }

  async function resolveDivergence(choice: "device" | "server") {
    const currentInventory = inventory;
    if (
      snapshot.state !== "divergent_copy" ||
      !divergentItem ||
      !currentInventory
    ) {
      return;
    }
    const item = divergentItem;
    const operation = beginOperation();
    patch({ state: "transferring", errorCode: null });
    try {
      if (!(await sessionStillMatches(operation))) return;
      const result = await withinDeadline(
        (signal) =>
          input.port.transferAndVerify(item, input.identity, signal, choice),
        networkDeadlineMs,
        operation.controller.signal,
      );
      if (!isCurrent(operation.id)) return;
      if (result.status !== "verified") {
        throw new LegacyRetirementPortError(
          "conflict_blocked",
          "divergence_unresolved",
        );
      }
      patch({ state: "deleting" });
      await withinDeadline(
        (signal) =>
          input.port.deleteVerifiedBatch([item], input.identity, signal),
        storageDeadlineMs,
        operation.controller.signal,
      );
      if (!isCurrent(operation.id)) return;
      const remaining = currentInventory.items.filter(
        (candidate) => candidate.token !== item.token,
      );
      inventory = { ...currentInventory, items: remaining };
      divergentItem = null;
      if (remaining.length > 0) {
        patch({
          state: "offered",
          divergence: null,
          progress: {
            ...snapshot.progress,
            verified: snapshot.progress.verified + 1,
            deleted: snapshot.progress.deleted + 1,
          },
        });
      } else {
        await finalize(operation);
      }
    } catch (error) {
      settleFailure(error, operation.id);
    } finally {
      if (isCurrent(operation.id)) activeController = null;
    }
  }

  function settleFailure(error: unknown, id: number) {
    if (!isCurrent(id) || isAbort(error)) return;
    const normalized =
      error instanceof LegacyRetirementPortError
        ? error
        : new LegacyRetirementPortError(
            "failed_retryable",
            error instanceof DeadlineError
              ? "operation_timeout"
              : "operation_unavailable",
          );
    patch({ state: normalized.state, errorCode: normalized.code });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    inspect,
    transfer,
    retry,
    cancel,
    requestDiscard,
    cancelDiscard,
    confirmDiscard,
    resolveDivergence,
  };
}

function initialSnapshot(): LegacyRetirementSnapshot {
  return {
    state: "checking",
    visible: false,
    counts: countInventory([]),
    progress: { verified: 0, deleted: 0, total: 0 },
    capability: null,
    absenceReads: 0,
    foreignResidue: { bindings: 0, sharedRows: 0 },
    divergence: null,
    discardConfirmationStep: 0,
    errorCode: null,
    lastAction: null,
  };
}

function sanitizedInventory(
  value: LegacyRetirementInventory,
): LegacyRetirementInventory {
  if (!value || !Array.isArray(value.items)) {
    throw new LegacyRetirementPortError(
      "failed_retryable",
      "inventory_unavailable",
    );
  }
  const tokens = new Set<string>();
  const items = value.items.map((item) => {
    if (
      !item ||
      typeof item.token !== "string" ||
      !/^[A-Za-z0-9._~-]{1,160}$/.test(item.token) ||
      tokens.has(item.token) ||
      !["draft", "mutation", "synced_receipt", "photo_upload"].includes(
        item.kind,
      ) ||
      !Number.isSafeInteger(item.mediaIntentCount) ||
      item.mediaIntentCount < 0
    ) {
      throw new LegacyRetirementPortError(
        "failed_retryable",
        "inventory_corrupt",
      );
    }
    tokens.add(item.token);
    return {
      token: item.token,
      kind: item.kind,
      mediaIntentCount: Math.min(10_000, item.mediaIntentCount),
      updatedAt: boundedTimestamp(item.updatedAt),
    };
  });
  return {
    items,
    bounded: value.bounded === true,
    foreignBindingCount: boundedCount(value.foreignBindingCount),
    foreignOwnerResidueCount: boundedCount(value.foreignOwnerResidueCount),
    capability: [
      "enumeration_available",
      "registry_fallback",
      "enumeration_unavailable",
    ].includes(value.capability)
      ? value.capability
      : "enumeration_unavailable",
  };
}

function countInventory(items: LegacyRetirementItem[]) {
  return {
    drafts: items.filter(({ kind }) => kind === "draft").length,
    mutations: items.filter(({ kind }) => kind === "mutation").length,
    syncedReceipts: items.filter(({ kind }) => kind === "synced_receipt")
      .length,
    photoUploads: items.filter(({ kind }) => kind === "photo_upload").length,
    mediaIntents: items.reduce(
      (total, item) => total + item.mediaIntentCount,
      0,
    ),
    total: items.length,
  };
}

class DeadlineError extends Error {}

async function withinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<T> {
  if (parentSignal.aborted) throw abortError();
  const deadlineController = new AbortController();
  const signal = AbortSignal.any([parentSignal, deadlineController.signal]);
  let timedOut = false;
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(timedOut ? new DeadlineError() : abortError()),
      { once: true },
    );
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    deadlineController.abort();
  }, timeoutMs);
  try {
    return await Promise.race([operation(signal), aborted]);
  } finally {
    clearTimeout(timeout);
  }
}

function boundedDeadline(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(fallback, Math.trunc(value!)));
}

function boundedCount(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10_000) : 0;
}

function boundedTimestamp(value: number) {
  return Number.isFinite(value) && value >= 0
    ? Math.min(Math.trunc(value), 8_640_000_000_000_000)
    : 0;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError() {
  return new DOMException("Legacy retirement cancelled.", "AbortError");
}
