"use client";

import { DOCUMENT_MUTATION_GENERATION_HEADER } from "@/lib/auth/document-mutation-generation-transport";
import {
  journalDraftPayloadSha256,
  type DeleteJournalEntryDraftRequestV1,
  type JournalEntryDraftContext,
  type JournalEntryDraftKind,
  type JournalEntryDraftPayloadV1,
  type JournalEntryDraftReceiptV1,
  type SaveJournalEntryDraftRequestV1,
} from "@/lib/garden/entry-contracts";

const DEFAULT_DEADLINE_MS = 2_000;

export type OnlineJournalDraftStatus =
  | "idle"
  | "hydrating"
  | "saving"
  | "saved"
  | "deleting"
  | "deleted"
  | "connection_required"
  | "conflict";

export interface OnlineJournalDraftSnapshot {
  status: OnlineJournalDraftStatus;
  draft: JournalEntryDraftReceiptV1 | null;
  error: OnlineJournalDraftError | null;
}

export class OnlineJournalDraftError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly current: {
    generation: number;
    payloadSha256: string;
    serverRevision: number;
    updatedAt: string;
  } | null;

  constructor(input: {
    code: string;
    status?: number | null;
    retryable: boolean;
    current?: OnlineJournalDraftError["current"];
  }) {
    super("The online journal draft request did not complete.");
    this.name = "OnlineJournalDraftError";
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable;
    this.current = input.current ?? null;
  }
}

export interface OnlineJournalDraftOwner {
  getSnapshot(): OnlineJournalDraftSnapshot;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<JournalEntryDraftReceiptV1 | null>;
  save(
    payload: JournalEntryDraftPayloadV1,
    options: {
      generation: number;
      expectedServerRevision?: number | null;
      keepalive?: boolean;
    },
  ): Promise<JournalEntryDraftReceiptV1>;
  delete(
    receipt?: JournalEntryDraftReceiptV1 | null,
  ): Promise<JournalEntryDraftReceiptV1 | null>;
  retry(): Promise<JournalEntryDraftReceiptV1 | null>;
  replaceContext(context: JournalEntryDraftContext): void;
  replaceDocumentMutationGeneration(generation: string): void;
  abort(): void;
}

type OnlineDraftFetch = (url: string, init?: RequestInit) => Promise<Response>;

interface DraftOperation {
  id: number;
  controller: AbortController;
  aborted: Promise<never>;
}

export function createOnlineJournalDraftOwner(input: {
  draftKey: string;
  draftKind: JournalEntryDraftKind;
  context: JournalEntryDraftContext;
  documentMutationGeneration: string;
  deadlineMs?: number;
  fetchImpl?: OnlineDraftFetch;
}): OnlineJournalDraftOwner {
  const fetchImpl = input.fetchImpl ?? fetch;
  const deadlineMs = Math.max(
    1,
    Math.trunc(input.deadlineMs ?? DEFAULT_DEADLINE_MS),
  );
  const url = `/api/garden/drafts/${encodeURIComponent(input.draftKey)}`;
  const listeners = new Set<() => void>();
  let documentMutationGeneration = requireGeneration(
    input.documentMutationGeneration,
  );
  let draftContext = input.context;
  let operationId = 0;
  let activeController: AbortController | null = null;
  let retryInFlight: Promise<JournalEntryDraftReceiptV1 | null> | null = null;
  let lastRetry: (() => Promise<JournalEntryDraftReceiptV1 | null>) | null =
    null;
  let snapshot: OnlineJournalDraftSnapshot = {
    status: "idle",
    draft: null,
    error: null,
  };

  function publish(next: OnlineJournalDraftSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function hydrate() {
    const run = () =>
      execute({
        pendingStatus: "hydrating",
        method: "GET",
        parse: async (response) => {
          if (response.status === 404) return null;
          const body = await responseBody(response);
          if (!response.ok) throw transportError(response, body);
          return requireDraftReceipt(body?.draft);
        },
      });
    lastRetry = run;
    return run();
  }

  async function save(
    payload: JournalEntryDraftPayloadV1,
    options: {
      generation: number;
      expectedServerRevision?: number | null;
      keepalive?: boolean;
    },
  ) {
    if (!Number.isSafeInteger(options.generation) || options.generation < 1) {
      throw new OnlineJournalDraftError({
        code: "JOURNAL_DRAFT_INVALID",
        retryable: false,
      });
    }
    const preparation = beginOperation();
    let payloadSha256: string;
    try {
      payloadSha256 = await Promise.race([
        journalDraftPayloadSha256(payload),
        preparation.aborted,
      ]);
      if (preparation.id !== operationId) throw supersededError();
    } catch (error) {
      const normalized = normalizeRequestError(error, {
        timedOut: false,
        superseded: preparation.id !== operationId,
      });
      if (
        preparation.id === operationId &&
        activeController === preparation.controller
      ) {
        activeController = null;
      }
      throw normalized;
    }
    const request: SaveJournalEntryDraftRequestV1 = {
      draftKind: input.draftKind,
      context: draftContext,
      payload,
      generation: options.generation,
      payloadSha256,
      expectedServerRevision:
        options.expectedServerRevision === undefined
          ? (snapshot.draft?.serverRevision ?? null)
          : options.expectedServerRevision,
    };
    const body = JSON.stringify(request);
    const run = () =>
      execute({
        pendingStatus: "saving",
        method: "PUT",
        body,
        keepalive: options.keepalive,
        parse: async (response) => {
          const result = await responseBody(response);
          if (!response.ok) throw transportError(response, result);
          return requireDraftReceipt(result?.draft);
        },
      });
    lastRetry = run;
    const saved = await execute(
      {
        pendingStatus: "saving",
        method: "PUT",
        body,
        keepalive: options.keepalive,
        parse: async (response) => {
          const result = await responseBody(response);
          if (!response.ok) throw transportError(response, result);
          return requireDraftReceipt(result?.draft);
        },
      },
      preparation,
    );
    if (!saved) {
      throw new OnlineJournalDraftError({
        code: "JOURNAL_DRAFT_INVALID_RESPONSE",
        retryable: true,
      });
    }
    return saved;
  }

  async function deleteDraft(receipt = snapshot.draft) {
    if (!receipt) return null;
    const request: DeleteJournalEntryDraftRequestV1 = {
      generation: receipt.generation,
      payloadSha256: receipt.payloadSha256,
      expectedServerRevision: receipt.serverRevision,
    };
    const body = JSON.stringify(request);
    const run = () =>
      execute({
        pendingStatus: "deleting",
        method: "DELETE",
        body,
        parse: async (response) => {
          if (response.status === 404) return null;
          const result = await responseBody(response);
          if (!response.ok) throw transportError(response, result);
          return receipt;
        },
        successStatus: "deleted",
        clearDraftOnSuccess: true,
      });
    lastRetry = run;
    return run();
  }

  async function retry() {
    if (retryInFlight) return retryInFlight;
    if (!lastRetry) {
      throw new OnlineJournalDraftError({
        code: "JOURNAL_DRAFT_NOT_RETRYABLE",
        retryable: false,
      });
    }
    if (snapshot.error && !snapshot.error.retryable) throw snapshot.error;
    const running = lastRetry();
    retryInFlight = running;
    try {
      return await running;
    } finally {
      if (retryInFlight === running) retryInFlight = null;
    }
  }

  function replaceDocumentMutationGeneration(generation: string) {
    documentMutationGeneration = requireGeneration(generation);
    supersede();
    lastRetry = null;
    publish({ status: "idle", draft: null, error: null });
  }

  function replaceContext(context: JournalEntryDraftContext) {
    if (
      (draftContext.spaceId ?? null) === (context.spaceId ?? null) &&
      (draftContext.plantObjectId ?? null) ===
        (context.plantObjectId ?? null) &&
      (draftContext.journalEntryId ?? null) === (context.journalEntryId ?? null)
    ) {
      return;
    }
    draftContext = context;
    supersede();
    lastRetry = null;
  }

  function abort() {
    supersede();
    publish({ status: "idle", draft: snapshot.draft, error: null });
  }

  async function execute(
    options: {
      pendingStatus: "hydrating" | "saving" | "deleting";
      method: "GET" | "PUT" | "DELETE";
      body?: string;
      keepalive?: boolean;
      parse: (response: Response) => Promise<JournalEntryDraftReceiptV1 | null>;
      successStatus?: "deleted";
      clearDraftOnSuccess?: boolean;
    },
    prepared?: DraftOperation,
  ): Promise<JournalEntryDraftReceiptV1 | null> {
    const operation = prepared ?? beginOperation();
    if (operation.id !== operationId) throw supersededError();
    const currentOperationId = operation.id;
    const controller = operation.controller;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deadlineMs);
    publish({
      status: options.pendingStatus,
      draft: snapshot.draft,
      error: null,
    });

    try {
      const response = await Promise.race([
        fetchImpl(url, {
          method: options.method,
          headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            [DOCUMENT_MUTATION_GENERATION_HEADER]: documentMutationGeneration,
          },
          ...(options.body ? { body: options.body } : {}),
          ...(options.keepalive ? { keepalive: true } : {}),
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        }),
        operation.aborted,
      ]);
      if (currentOperationId !== operationId) throw supersededError();
      const draft = await options.parse(response);
      if (currentOperationId !== operationId) throw supersededError();
      publish({
        status: options.successStatus ?? (draft ? "saved" : "idle"),
        draft: options.clearDraftOnSuccess ? null : draft,
        error: null,
      });
      return draft;
    } catch (error) {
      const normalized = normalizeRequestError(error, {
        timedOut,
        superseded: currentOperationId !== operationId,
      });
      if (currentOperationId === operationId) {
        publish({
          status:
            normalized.code === "JOURNAL_DRAFT_CONFLICT"
              ? "conflict"
              : "connection_required",
          draft: snapshot.draft,
          error: normalized,
        });
      }
      throw normalized;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (
        currentOperationId === operationId &&
        activeController === controller
      ) {
        activeController = null;
      }
    }
  }

  function beginOperation(): DraftOperation {
    supersede();
    const id = operationId;
    const controller = new AbortController();
    activeController = controller;
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
    return { id, controller, aborted };
  }

  function supersede() {
    operationId += 1;
    activeController?.abort();
    activeController = null;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe,
    hydrate,
    save,
    delete: deleteDraft,
    retry,
    replaceContext,
    replaceDocumentMutationGeneration,
    abort,
  };
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

function transportError(
  response: Response,
  body: Record<string, unknown>,
): OnlineJournalDraftError {
  const code =
    typeof body.code === "string" ? body.code : "JOURNAL_DRAFT_UNAVAILABLE";
  return new OnlineJournalDraftError({
    code,
    status: response.status,
    retryable:
      response.status >= 500 ||
      response.status === 408 ||
      response.status === 429,
    current: boundedCurrent(body.current),
  });
}

function normalizeRequestError(
  error: unknown,
  state: { timedOut: boolean; superseded: boolean },
) {
  if (state.superseded) return supersededError();
  if (state.timedOut) {
    return new OnlineJournalDraftError({
      code: "JOURNAL_DRAFT_TIMEOUT",
      retryable: true,
    });
  }
  if (error instanceof OnlineJournalDraftError) return error;
  return new OnlineJournalDraftError({
    code: "JOURNAL_DRAFT_CONNECTION_REQUIRED",
    retryable: true,
  });
}

function supersededError() {
  return new OnlineJournalDraftError({
    code: "JOURNAL_DRAFT_REQUEST_SUPERSEDED",
    retryable: false,
  });
}

function requireDraftReceipt(value: unknown): JournalEntryDraftReceiptV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OnlineJournalDraftError({
      code: "JOURNAL_DRAFT_INVALID_RESPONSE",
      retryable: true,
    });
  }
  const draft = value as JournalEntryDraftReceiptV1;
  if (
    typeof draft.draftKey !== "string" ||
    !Number.isSafeInteger(draft.generation) ||
    !Number.isSafeInteger(draft.serverRevision) ||
    typeof draft.payloadSha256 !== "string" ||
    typeof draft.updatedAt !== "string"
  ) {
    throw new OnlineJournalDraftError({
      code: "JOURNAL_DRAFT_INVALID_RESPONSE",
      retryable: true,
    });
  }
  return draft;
}

function boundedCurrent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const current = value as Record<string, unknown>;
  if (
    typeof current.generation !== "number" ||
    typeof current.payloadSha256 !== "string" ||
    typeof current.serverRevision !== "number" ||
    typeof current.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    generation: current.generation,
    payloadSha256: current.payloadSha256,
    serverRevision: current.serverRevision,
    updatedAt: current.updatedAt,
  };
}

function requireGeneration(value: string) {
  if (typeof value !== "string" || value.length < 1) {
    throw new OnlineJournalDraftError({
      code: "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
      retryable: false,
    });
  }
  return value;
}
