"use client";

import {
  KnownClientStorageError,
  type KnownClientStorageRetirementReceipt,
} from "./known-client-storage";
import { recordUnresolvedAuthorizationServe } from "@/lib/auth/unresolved-authorization";

export const LEGACY_RETIREMENT_DEADLINE_MS = 3_000;

export type LegacyRetirementState =
  | "checking"
  | "deleting"
  | "absent"
  | "served_unresolved"
  | "deletion_blocked";

export interface LegacyRetirementSnapshot {
  state: LegacyRetirementState;
  visible: boolean;
  absenceReads: 0 | 2;
  deletedDatabaseCount: number;
  unregisteredWorkerCount: number;
  unresolvedBindingCount: number;
  unresolvedClass: "ownership_unresolved" | null;
  errorCode: string | null;
  lastAction: "cancelled" | null;
}

export interface LegacyDeviceRetirementPort {
  retire(signal: AbortSignal): Promise<KnownClientStorageRetirementReceipt>;
}

export interface LegacyDeviceRetirementController {
  getSnapshot(): LegacyRetirementSnapshot;
  subscribe(listener: () => void): () => void;
  inspect(): Promise<void>;
  retry(): Promise<void>;
  cancel(): void;
}

/**
 * Removes only the retired runtime's exact browser-owned names. The controller
 * never reads document rows, authenticates an owner, or hydrates application
 * content. Any unresolved owner binding is retained for a later explicit
 * retry while the server-backed product continues with a counted uncertainty.
 */
export function createLegacyDeviceRetirementController(input: {
  port: LegacyDeviceRetirementPort;
  deadlineMs?: number;
}): LegacyDeviceRetirementController {
  const listeners = new Set<() => void>();
  const deadlineMs = boundedDeadline(input.deadlineMs);
  let operationId = 0;
  let active:
    | {
        id: number;
        controller: AbortController;
        promise: Promise<void>;
      }
    | undefined;
  let visibleOnce = false;
  let snapshot: LegacyRetirementSnapshot = {
    state: "checking",
    visible: false,
    absenceReads: 0,
    deletedDatabaseCount: 0,
    unregisteredWorkerCount: 0,
    unresolvedBindingCount: 0,
    unresolvedClass: null,
    errorCode: null,
    lastAction: null,
  };

  const publish = (next: LegacyRetirementSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const patch = (next: Partial<LegacyRetirementSnapshot>) => {
    publish({ ...snapshot, ...next });
  };

  function start(): Promise<void> {
    if (active) return active.promise;
    const id = ++operationId;
    const controller = new AbortController();
    patch({
      state: "deleting",
      visible: visibleOnce,
      unresolvedClass: null,
      errorCode: null,
      lastAction: null,
    });
    const promise = run(id, controller);
    active = { id, controller, promise };
    return promise;
  }

  async function run(id: number, controller: AbortController) {
    try {
      const receipt = await retireWithinDeadline(
        () => input.port.retire(controller.signal),
        controller,
        deadlineMs,
      );
      if (id !== operationId) return;
      if (receipt.absenceReads !== 2) {
        throw new KnownClientStorageError("absence_unconfirmed");
      }
      const unresolved =
        receipt.status === "unresolved_retained" ||
        receipt.unresolvedBindingCount > 0;
      if (unresolved) {
        visibleOnce = true;
        recordUnresolvedAuthorizationServe(
          "legacy_device_retirement",
          "ownership_unresolved",
        );
      }
      patch({
        state: unresolved ? "served_unresolved" : "absent",
        visible: unresolved,
        absenceReads: 2,
        deletedDatabaseCount: boundedCount(receipt.deletedDatabaseCount),
        unregisteredWorkerCount: boundedCount(receipt.unregisteredWorkerCount),
        unresolvedBindingCount: boundedCount(receipt.unresolvedBindingCount),
        unresolvedClass: unresolved ? "ownership_unresolved" : null,
        errorCode: null,
        lastAction: null,
      });
    } catch (error) {
      if (id !== operationId) return;
      visibleOnce = true;
      patch({
        state: "deletion_blocked",
        visible: true,
        unresolvedClass: null,
        errorCode:
          error instanceof RetirementDeadlineError
            ? "client_retirement_timeout"
            : error instanceof KnownClientStorageError
              ? error.code
              : "client_retirement_unavailable",
        lastAction: null,
      });
    } finally {
      if (active?.id === id) active = undefined;
    }
  }

  function cancel() {
    if (!active) return;
    operationId += 1;
    active.controller.abort();
    active = undefined;
    visibleOnce = true;
    patch({
      state: "deletion_blocked",
      visible: true,
      unresolvedClass: null,
      errorCode: "client_retirement_cancelled",
      lastAction: "cancelled",
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    inspect: start,
    retry: start,
    cancel,
  };
}

class RetirementDeadlineError extends Error {}

function retireWithinDeadline<T>(
  operation: () => Promise<T>,
  controller: AbortController,
  deadlineMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", onAbort);
      outcome();
    };
    const onAbort = () =>
      finish(() =>
        reject(timedOut ? new RetirementDeadlineError() : abortError()),
      );
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deadlineMs);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    try {
      operation().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function boundedDeadline(value: number | undefined) {
  if (!Number.isFinite(value)) return LEGACY_RETIREMENT_DEADLINE_MS;
  return Math.max(
    1,
    Math.min(LEGACY_RETIREMENT_DEADLINE_MS, Math.trunc(value!)),
  );
}

function boundedCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return Math.min(10_000, value);
}

function abortError() {
  return new DOMException("Legacy retirement cancelled.", "AbortError");
}
