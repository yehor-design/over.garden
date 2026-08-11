"use client";

import {
  DOCUMENT_MUTATION_ADMISSION_DEADLINE_MS,
  isDocumentMutationAdmissionTransportResult,
  type DocumentMutationAdmissionTransportResultV1,
} from "@/lib/auth/document-mutation-generation-transport";
import {
  OFFLINE_QUEUE_CHANGED_EVENT,
  type OfflineMutation,
  type OfflineMutationSyncCandidate,
} from "./queue";

export type { OfflineMutationSyncCandidate } from "./queue";

export const FOREGROUND_AUTOSYNC_TRIGGERS = [
  "initial_scan",
  "queue_changed",
  "online",
  "window_focus",
  "document_visible",
  "manual",
] as const;

export type ForegroundAutosyncTrigger =
  (typeof FOREGROUND_AUTOSYNC_TRIGGERS)[number];
export type ForegroundAutosyncAutomaticTrigger = Exclude<
  ForegroundAutosyncTrigger,
  "manual"
>;

export const FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS =
  DOCUMENT_MUTATION_ADMISSION_DEADLINE_MS;

export type ForegroundAutosyncReceiptState =
  | "empty_without_admission"
  | "coalesced_without_claim"
  | "synced"
  | "manual_recovery"
  | "stale_context"
  | "cancelled";

export interface ForegroundAutosyncReceipt {
  state: ForegroundAutosyncReceiptState;
  triggers: ForegroundAutosyncTrigger[];
  eligibleCount: number;
  attemptedCount: number;
  syncedCount: number;
  admissionDurationMs: number | null;
}

export interface ForegroundAutosyncDependencies<TResult = unknown> {
  recoverExpiredClaims(ownerUserId: string): Promise<number>;
  listAutomaticCandidates(
    ownerUserId: string,
  ): Promise<OfflineMutationSyncCandidate[]>;
  getManualCandidate(
    ownerUserId: string,
    mutationId: string,
  ): Promise<OfflineMutationSyncCandidate | null>;
  admit(input: {
    documentMutationGeneration: string;
    deadlineMs: number;
    signal: AbortSignal;
  }): Promise<DocumentMutationAdmissionTransportResultV1>;
  markAdmissionFailure(
    ownerUserId: string,
    candidates: readonly OfflineMutationSyncCandidate[],
    options: { lastError: string },
  ): Promise<number>;
  claimAutomatic(
    ownerUserId: string,
    candidate: OfflineMutationSyncCandidate,
  ): Promise<OfflineMutation | undefined>;
  claimManual(
    ownerUserId: string,
    candidate: OfflineMutationSyncCandidate,
  ): Promise<OfflineMutation | undefined>;
  syncClaimed(
    mutation: OfflineMutation,
    input: {
      expectedOwnerUserId: string;
      documentMutationGeneration: string;
      signal: AbortSignal;
    },
  ): Promise<TResult>;
  withLease(
    opaqueLeaseKey: string,
    signal: AbortSignal,
    operation: () => Promise<void>,
  ): Promise<void>;
  monotonicNow(): number;
}

export interface ForegroundAutosyncCoordinator<TResult = unknown> {
  request(trigger: ForegroundAutosyncAutomaticTrigger): void;
  runManual(mutationId: string): Promise<TResult>;
  whenIdle(): Promise<void>;
  dispose(): void;
}

interface ForegroundAutosyncEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface ForegroundAutosyncVisibilityTarget extends ForegroundAutosyncEventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

interface ForegroundAutosyncCoordinatorInput<TResult> {
  ownerUserId: string;
  documentMutationGeneration: string;
  isCurrent(): boolean;
  dependencies: ForegroundAutosyncDependencies<TResult>;
  onAdmissionResult?: (
    result: Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH">,
  ) => void;
  onReceipt?: (receipt: ForegroundAutosyncReceipt) => void;
}

interface ManualRequest<TResult> {
  mutationId: string;
  resolve(value: TResult): void;
  reject(reason: unknown): void;
}

interface CandidateSnapshot {
  automatic: OfflineMutationSyncCandidate[];
  manual: Map<string, OfflineMutationSyncCandidate>;
}

const fallbackLeaseTails = new Map<string, Promise<void>>();

export class ForegroundAutosyncAdmissionError extends Error {
  readonly documentMutationAdmission: Exclude<
    DocumentMutationAdmissionTransportResultV1,
    "MATCH"
  >;

  constructor(
    result: Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH">,
  ) {
    super("Foreground autosync requires manual recovery.");
    this.name = "ForegroundAutosyncAdmissionError";
    this.documentMutationAdmission = result;
  }
}

export class ForegroundAutosyncIneligibleError extends Error {
  constructor() {
    super("The offline mutation is not eligible for manual sync.");
    this.name = "ForegroundAutosyncIneligibleError";
  }
}

export function createForegroundAutosyncCoordinator<TResult>(
  input: ForegroundAutosyncCoordinatorInput<TResult>,
): ForegroundAutosyncCoordinator<TResult> {
  const ownerUserId = requireBoundedValue(input.ownerUserId, 160);
  const documentMutationGeneration = requireBoundedValue(
    input.documentMutationGeneration,
    4_096,
  );
  const lifetime = new AbortController();
  const pendingTriggers = new Set<ForegroundAutosyncTrigger>();
  const pendingManual = new Map<string, ManualRequest<TResult>[]>();
  const idleWaiters = new Set<() => void>();
  let scheduled = false;
  let activeBatches = 0;
  let runChain = Promise.resolve();

  const schedule = () => {
    if (lifetime.signal.aborted || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (lifetime.signal.aborted) {
        rejectPendingManual(pendingManual, abortError());
        resolveIdleIfReady();
        return;
      }
      const triggers = new Set(pendingTriggers);
      pendingTriggers.clear();
      const manual = new Map(pendingManual);
      pendingManual.clear();
      if (triggers.size === 0) {
        resolveIdleIfReady();
        return;
      }

      activeBatches += 1;
      runChain = runChain
        .then(() =>
          runForegroundAutosyncBatch({
            ownerUserId,
            documentMutationGeneration,
            triggers,
            manual,
            lifetime,
            input,
          }),
        )
        .catch(() => undefined)
        .finally(() => {
          activeBatches -= 1;
          resolveIdleIfReady();
        });
    });
  };

  const resolveIdleIfReady = () => {
    if (
      scheduled ||
      activeBatches > 0 ||
      pendingTriggers.size > 0 ||
      pendingManual.size > 0
    ) {
      return;
    }
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  };

  return {
    request(trigger) {
      if (lifetime.signal.aborted) return;
      pendingTriggers.add(trigger);
      schedule();
    },
    runManual(mutationId) {
      if (lifetime.signal.aborted) return Promise.reject(abortError());
      const normalizedId = requireBoundedValue(mutationId, 160);
      pendingTriggers.add("manual");
      const promise = new Promise<TResult>((resolve, reject) => {
        const requests = pendingManual.get(normalizedId) ?? [];
        requests.push({ mutationId: normalizedId, resolve, reject });
        pendingManual.set(normalizedId, requests);
      });
      schedule();
      return promise;
    },
    whenIdle() {
      if (
        !scheduled &&
        activeBatches === 0 &&
        pendingTriggers.size === 0 &&
        pendingManual.size === 0
      ) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => idleWaiters.add(resolve));
    },
    dispose() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      rejectPendingManual(pendingManual, abortError());
      pendingTriggers.clear();
      resolveIdleIfReady();
    },
  };
}

export function installForegroundAutosyncEventTriggers(
  coordinator: Pick<ForegroundAutosyncCoordinator, "request">,
  browserWindow: ForegroundAutosyncEventTarget = window,
  browserDocument: ForegroundAutosyncVisibilityTarget = document,
) {
  const queueChanged: EventListener = () =>
    coordinator.request("queue_changed");
  const online: EventListener = () => coordinator.request("online");
  const focused: EventListener = () => coordinator.request("window_focus");
  const visible: EventListener = () => {
    if (browserDocument.visibilityState === "visible") {
      coordinator.request("document_visible");
    }
  };
  browserWindow.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, queueChanged);
  browserWindow.addEventListener("online", online);
  browserWindow.addEventListener("focus", focused);
  browserDocument.addEventListener("visibilitychange", visible);
  coordinator.request("initial_scan");

  return () => {
    browserWindow.removeEventListener(
      OFFLINE_QUEUE_CHANGED_EVENT,
      queueChanged,
    );
    browserWindow.removeEventListener("online", online);
    browserWindow.removeEventListener("focus", focused);
    browserDocument.removeEventListener("visibilitychange", visible);
  };
}

async function runForegroundAutosyncBatch<TResult>(input: {
  ownerUserId: string;
  documentMutationGeneration: string;
  triggers: Set<ForegroundAutosyncTrigger>;
  manual: Map<string, ManualRequest<TResult>[]>;
  lifetime: AbortController;
  input: ForegroundAutosyncCoordinatorInput<TResult>;
}) {
  const triggers = FOREGROUND_AUTOSYNC_TRIGGERS.filter((trigger) =>
    input.triggers.has(trigger),
  );
  const receipt: ForegroundAutosyncReceipt = {
    state: "empty_without_admission",
    triggers,
    eligibleCount: 0,
    attemptedCount: 0,
    syncedCount: 0,
    admissionDurationMs: null,
  };

  try {
    const initial = await readCandidates(input);
    receipt.eligibleCount = candidateCount(initial);
    if (receipt.eligibleCount === 0) return;
    if (!input.input.isCurrent()) {
      receipt.state = "stale_context";
      rejectManualRequests(
        input.manual,
        new ForegroundAutosyncIneligibleError(),
      );
      return;
    }

    const leaseKey = opaqueForegroundAutosyncLeaseKey(
      input.ownerUserId,
      input.documentMutationGeneration,
    );
    await input.input.dependencies.withLease(
      leaseKey,
      input.lifetime.signal,
      async () => {
        if (input.lifetime.signal.aborted) throw abortError();
        if (!input.input.isCurrent()) {
          receipt.state = "stale_context";
          rejectManualRequests(
            input.manual,
            new ForegroundAutosyncIneligibleError(),
          );
          return;
        }

        const current = await readCandidates(input);
        receipt.eligibleCount = candidateCount(current);
        if (receipt.eligibleCount === 0) return;

        const deadline = admissionDeadlineSignal(input.lifetime.signal);
        const startedAt = input.input.dependencies.monotonicNow();
        let admissionElapsedMs = 0;
        let admission: DocumentMutationAdmissionTransportResultV1 =
          "MUTATION_ADMISSION_UNAVAILABLE";
        try {
          admission = await input.input.dependencies.admit({
            documentMutationGeneration: input.documentMutationGeneration,
            deadlineMs: FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
            signal: deadline.signal,
          });
        } catch (error) {
          if (input.lifetime.signal.aborted) throw error;
          admission = "MUTATION_ADMISSION_UNAVAILABLE";
        } finally {
          admissionElapsedMs = Math.max(
            0,
            input.input.dependencies.monotonicNow() - startedAt,
          );
          receipt.admissionDurationMs = Math.min(
            FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
            admissionElapsedMs,
          );
          deadline.dispose();
        }

        if (input.lifetime.signal.aborted) throw abortError();
        if (!input.input.isCurrent()) {
          receipt.state = "stale_context";
          rejectManualRequests(
            input.manual,
            new ForegroundAutosyncIneligibleError(),
          );
          return;
        }
        if (
          deadline.signal.aborted ||
          admissionElapsedMs > FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS
        ) {
          admission = "MUTATION_ADMISSION_UNAVAILABLE";
        }

        const candidates = allCandidates(current);
        if (admission !== "MATCH") {
          await input.input.dependencies
            .markAdmissionFailure(input.ownerUserId, candidates, {
              lastError: admissionFailureMessage(admission),
            })
            .catch(() => 0);
          receipt.state = "manual_recovery";
          input.input.onAdmissionResult?.(admission);
          rejectManualRequests(
            input.manual,
            new ForegroundAutosyncAdmissionError(admission),
          );
          return;
        }

        const jobs = [
          ...current.manual.values(),
          ...current.automatic.filter(
            (candidate) => !current.manual.has(candidate.id),
          ),
        ];
        const settledManual = new Set<string>();
        let stopped = false;

        for (let index = 0; index < jobs.length; index += 1) {
          const candidate = jobs[index];
          if (!candidate || stopped) break;
          if (input.lifetime.signal.aborted) throw abortError();
          if (!input.input.isCurrent()) {
            receipt.state = "stale_context";
            break;
          }

          const claimed =
            candidate.mode === "manual"
              ? await input.input.dependencies.claimManual(
                  input.ownerUserId,
                  candidate,
                )
              : await input.input.dependencies.claimAutomatic(
                  input.ownerUserId,
                  candidate,
                );
          if (!claimed) continue;
          receipt.attemptedCount += 1;

          try {
            const result = await input.input.dependencies.syncClaimed(claimed, {
              expectedOwnerUserId: input.ownerUserId,
              documentMutationGeneration: input.documentMutationGeneration,
              signal: input.lifetime.signal,
            });
            if (input.lifetime.signal.aborted || !input.input.isCurrent()) {
              receipt.state = "stale_context";
              if (candidate.mode === "manual") {
                rejectManualMutation(
                  input.manual,
                  candidate.id,
                  new ForegroundAutosyncIneligibleError(),
                );
                settledManual.add(candidate.id);
              }
              break;
            }
            receipt.syncedCount += 1;
            receipt.state = "synced";
            if (candidate.mode === "manual") {
              resolveManualMutation(input.manual, candidate.id, result);
              settledManual.add(candidate.id);
            }
          } catch (error) {
            if (candidate.mode === "manual") {
              rejectManualMutation(input.manual, candidate.id, error);
              settledManual.add(candidate.id);
            }
            if (isAbortError(error) || input.lifetime.signal.aborted) {
              receipt.state = "cancelled";
              throw error;
            }
            const admissionResult = admissionResultFromError(error);
            if (admissionResult) {
              input.input.onAdmissionResult?.(admissionResult);
            }
            receipt.state = "manual_recovery";
            const remaining = jobs.slice(index + 1);
            await input.input.dependencies
              .markAdmissionFailure(input.ownerUserId, remaining, {
                lastError: "Foreground sync stopped; manual recovery required.",
              })
              .catch(() => 0);
            for (const pending of remaining) {
              if (pending.mode !== "manual") continue;
              rejectManualMutation(input.manual, pending.id, error);
              settledManual.add(pending.id);
            }
            stopped = true;
          }
        }

        for (const mutationId of input.manual.keys()) {
          if (settledManual.has(mutationId)) continue;
          rejectManualMutation(
            input.manual,
            mutationId,
            new ForegroundAutosyncIneligibleError(),
          );
        }
        if (
          receipt.attemptedCount === 0 &&
          receipt.state === "empty_without_admission"
        ) {
          receipt.state = "coalesced_without_claim";
        }
      },
    );
  } catch (error) {
    receipt.state =
      isAbortError(error) || input.lifetime.signal.aborted
        ? "cancelled"
        : "manual_recovery";
    rejectManualRequests(input.manual, error);
  } finally {
    input.input.onReceipt?.(receipt);
  }
}

async function readCandidates<TResult>(input: {
  ownerUserId: string;
  manual: Map<string, ManualRequest<TResult>[]>;
  input: ForegroundAutosyncCoordinatorInput<TResult>;
}): Promise<CandidateSnapshot> {
  await input.input.dependencies.recoverExpiredClaims(input.ownerUserId);
  const manualIds = [...input.manual.keys()];
  const [automatic, manualValues] = await Promise.all([
    input.input.dependencies.listAutomaticCandidates(input.ownerUserId),
    Promise.all(
      manualIds.map((mutationId) =>
        input.input.dependencies.getManualCandidate(
          input.ownerUserId,
          mutationId,
        ),
      ),
    ),
  ]);
  const manual = new Map<string, OfflineMutationSyncCandidate>();
  manualValues.forEach((candidate, index) => {
    const mutationId = manualIds[index];
    if (candidate && mutationId && candidate.mode === "manual") {
      manual.set(mutationId, candidate);
      return;
    }
    if (mutationId) {
      rejectManualMutation(
        input.manual,
        mutationId,
        new ForegroundAutosyncIneligibleError(),
      );
    }
  });
  return {
    automatic: automatic.filter(
      (candidate) =>
        candidate.mode === "automatic" && !manual.has(candidate.id),
    ),
    manual,
  };
}

function allCandidates(snapshot: CandidateSnapshot) {
  return [...snapshot.manual.values(), ...snapshot.automatic];
}

function candidateCount(snapshot: CandidateSnapshot) {
  return snapshot.manual.size + snapshot.automatic.length;
}

function resolveManualMutation<TResult>(
  requests: Map<string, ManualRequest<TResult>[]>,
  mutationId: string,
  result: TResult,
) {
  for (const request of requests.get(mutationId) ?? []) request.resolve(result);
}

function rejectManualMutation<TResult>(
  requests: Map<string, ManualRequest<TResult>[]>,
  mutationId: string,
  error: unknown,
) {
  for (const request of requests.get(mutationId) ?? []) request.reject(error);
}

function rejectManualRequests<TResult>(
  requests: Map<string, ManualRequest<TResult>[]>,
  error: unknown,
) {
  for (const mutationRequests of requests.values()) {
    for (const request of mutationRequests) request.reject(error);
  }
}

function rejectPendingManual<TResult>(
  requests: Map<string, ManualRequest<TResult>[]>,
  error: unknown,
) {
  rejectManualRequests(requests, error);
  requests.clear();
}

function admissionResultFromError(
  error: unknown,
): Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH"> | null {
  if (!error || typeof error !== "object") return null;
  const result = (error as { documentMutationAdmission?: unknown })
    .documentMutationAdmission;
  return isDocumentMutationAdmissionTransportResult(result) &&
    result !== "MATCH"
    ? result
    : null;
}

function admissionFailureMessage(
  result: Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH">,
) {
  return `Foreground admission ${result.toLowerCase()}; manual recovery required.`;
}

function admissionDeadlineSignal(parent: AbortSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent.reason);
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });
  const timeout = globalThis.setTimeout(
    () =>
      controller.abort(
        new DOMException("Admission timed out.", "TimeoutError"),
      ),
    FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
  );
  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timeout);
      parent.removeEventListener("abort", abortFromParent);
    },
  };
}

export async function withForegroundAutosyncLease(
  opaqueLeaseKey: string,
  signal: AbortSignal,
  operation: () => Promise<void>,
) {
  if (signal.aborted) throw abortError();
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(
      opaqueLeaseKey,
      { mode: "exclusive", signal },
      operation,
    );
    return;
  }

  const previous = fallbackLeaseTails.get(opaqueLeaseKey) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  fallbackLeaseTails.set(opaqueLeaseKey, tail);
  await waitForLease(previous, signal);
  try {
    await operation();
  } finally {
    release();
    if (fallbackLeaseTails.get(opaqueLeaseKey) === tail) {
      void tail.finally(() => {
        if (fallbackLeaseTails.get(opaqueLeaseKey) === tail) {
          fallbackLeaseTails.delete(opaqueLeaseKey);
        }
      });
    }
  }
}

async function waitForLease(previous: Promise<void>, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    previous.then(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
    );
  });
}

function opaqueForegroundAutosyncLeaseKey(
  ownerUserId: string,
  documentMutationGeneration: string,
) {
  const input = `${ownerUserId}\u0000${documentMutationGeneration}`;
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `overgarden:foreground-autosync:${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function requireBoundedValue(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error("Foreground autosync requires a bounded current context.");
  }
  return normalized;
}

function abortError() {
  return new DOMException("Foreground autosync was cancelled.", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
