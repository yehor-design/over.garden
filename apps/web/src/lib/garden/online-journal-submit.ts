"use client";

import { AUTH_INTENT_RETURN_HEADER } from "@/lib/auth/auth-intent-http-contract";
import { DOCUMENT_MUTATION_GENERATION_HEADER } from "@/lib/auth/document-mutation-generation-transport";
import {
  isDocumentMutationAdmissionTransportResult,
  type DocumentMutationAdmissionTransportResultV1,
} from "@/lib/auth/document-mutation-generation-transport";
import type {
  FirstPlantEntryResponse,
  JournalDraftEditEntryRequest,
  JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import {
  journalDraftPublicationBody,
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
} from "@/lib/garden/entry-contracts";
import type { OnlineJournalDraftOwner } from "@/lib/garden/online-journal-draft";
import type { OnlineComposerPhotoIntent } from "@/lib/garden/composer-photo-selection";
import { isAllowedComposerImageSize } from "@/lib/media/image-limits";

const DEFAULT_SUBMIT_DEADLINE_MS = 15_000;

export type OnlineJournalPublicationResult =
  | FirstPlantEntryResponse
  | {
      entry: {
        id: string;
        title: string;
        clientMutationId: string;
        journalRevision: number;
        [key: string]: unknown;
      };
      isReplay: boolean;
    };

export type OnlineJournalSubmitStatus =
  | "idle"
  | "publishing"
  | "consuming_draft"
  | "published"
  | "connection_required";

export interface OnlineJournalSubmitSnapshot {
  status: OnlineJournalSubmitStatus;
  result: OnlineJournalPublicationResult | null;
  error: OnlineJournalSubmitError | null;
}

export class OnlineJournalSubmitError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly authIntentUrl: string | null;
  readonly documentMutationAdmission: Exclude<
    DocumentMutationAdmissionTransportResultV1,
    "MATCH"
  > | null;

  constructor(input: {
    code: string;
    status?: number | null;
    retryable: boolean;
    authIntentUrl?: string | null;
    documentMutationAdmission?: Exclude<
      DocumentMutationAdmissionTransportResultV1,
      "MATCH"
    > | null;
  }) {
    super("The online journal publication did not complete.");
    this.name = "OnlineJournalSubmitError";
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable;
    this.authIntentUrl = input.authIntentUrl ?? null;
    this.documentMutationAdmission = input.documentMutationAdmission ?? null;
  }
}

export interface OnlineJournalSubmitOwner {
  getSnapshot(): OnlineJournalSubmitSnapshot;
  subscribe(listener: () => void): () => void;
  submit(
    draft: JournalEntryDraftReceiptV1,
  ): Promise<OnlineJournalPublicationResult>;
  retry(): Promise<OnlineJournalPublicationResult>;
  replaceDocumentMutationGeneration(generation: string): void;
  abort(): void;
}

type OnlineSubmitFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function createOnlineJournalSubmitOwner(input: {
  documentMutationGeneration: string;
  draftOwner: OnlineJournalDraftOwner;
  fetchImpl?: OnlineSubmitFetch;
  deadlineMs?: number;
}): OnlineJournalSubmitOwner {
  const fetchImpl = input.fetchImpl ?? fetch;
  const deadlineMs = Math.max(
    1,
    Math.trunc(input.deadlineMs ?? DEFAULT_SUBMIT_DEADLINE_MS),
  );
  const listeners = new Set<() => void>();
  let documentMutationGeneration = requireGeneration(
    input.documentMutationGeneration,
  );
  let operationId = 0;
  let activeController: AbortController | null = null;
  let retryInFlight: Promise<OnlineJournalPublicationResult> | null = null;
  let lastRetry: (() => Promise<OnlineJournalPublicationResult>) | null = null;
  let snapshot: OnlineJournalSubmitSnapshot = {
    status: "idle",
    result: null,
    error: null,
  };

  function publish(next: OnlineJournalSubmitSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function submit(draft: JournalEntryDraftReceiptV1) {
    const publication = buildPublicationRequest(draft);
    const run = () => execute(draft, publication);
    lastRetry = run;
    return run();
  }

  async function retry() {
    if (retryInFlight) return retryInFlight;
    if (!lastRetry) {
      throw new OnlineJournalSubmitError({
        code: "JOURNAL_SUBMIT_NOT_RETRYABLE",
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
    input.draftOwner.replaceDocumentMutationGeneration(generation);
    lastRetry = null;
    publish({ status: "idle", result: null, error: null });
  }

  function abort() {
    supersede();
    input.draftOwner.abort();
    publish({ status: "idle", result: snapshot.result, error: null });
  }

  async function execute(
    draft: JournalEntryDraftReceiptV1,
    publication: {
      url: string;
      method: "POST" | "PATCH";
      body: string;
      authReturnTo: string;
    },
  ): Promise<OnlineJournalPublicationResult> {
    supersede();
    const currentOperationId = operationId;
    const controller = new AbortController();
    activeController = controller;
    let timedOut = false;
    let publicationSucceeded = false;
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deadlineMs);
    publish({ status: "publishing", result: snapshot.result, error: null });

    try {
      const response = await Promise.race([
        fetchImpl(publication.url, {
          method: publication.method,
          headers: {
            "Content-Type": "application/json",
            [AUTH_INTENT_RETURN_HEADER]: publication.authReturnTo,
            [DOCUMENT_MUTATION_GENERATION_HEADER]: documentMutationGeneration,
            [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
          },
          body: publication.body,
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        }),
        aborted,
      ]);
      if (currentOperationId !== operationId) throw supersededError();
      const resultBody = await responseRecord(response);
      if (!response.ok) throw submitTransportError(response, resultBody);
      const result = requirePublicationResult(resultBody);
      publicationSucceeded = true;
      publish({ status: "consuming_draft", result, error: null });

      try {
        await input.draftOwner.delete(draft);
        const remaining = await input.draftOwner.hydrate();
        if (remaining) throw new Error("Draft still exists after consumption.");
      } catch {
        throw new OnlineJournalSubmitError({
          code: "JOURNAL_DRAFT_CONSUMPTION_UNCONFIRMED",
          retryable: true,
        });
      }
      if (currentOperationId !== operationId) throw supersededError();
      publish({ status: "published", result, error: null });
      return result;
    } catch (error) {
      const normalized = normalizeSubmitError(error, {
        timedOut,
        superseded: currentOperationId !== operationId,
        publicationSucceeded,
      });
      if (currentOperationId === operationId) {
        publish({
          status: "connection_required",
          result: snapshot.result,
          error: normalized,
        });
      }
      throw normalized;
    } finally {
      clearTimeout(timeout);
      if (currentOperationId === operationId) activeController = null;
    }
  }

  function supersede() {
    operationId += 1;
    activeController?.abort();
    activeController = null;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe,
    submit,
    retry,
    replaceDocumentMutationGeneration,
    abort,
  };
}

function buildPublicationRequest(draft: JournalEntryDraftReceiptV1) {
  const request = draft.payload.request;
  if (
    !request ||
    typeof request.clientMutationId !== "string" ||
    request.clientMutationId.length < 1
  ) {
    throw new OnlineJournalSubmitError({
      code: "JOURNAL_SUBMIT_INVALID",
      retryable: false,
    });
  }

  if (draft.draftKind === "edit_entry") {
    const edit = request as JournalDraftEditEntryRequest;
    return {
      url: `/api/garden/entries/${encodeURIComponent(edit.entryId)}`,
      method: "PATCH" as const,
      body: JSON.stringify(journalDraftPublicationBody(draft.payload)),
      authReturnTo: "/garden",
    };
  }

  return {
    url: "/api/garden/entries",
    method: "POST" as const,
    body: JSON.stringify(journalDraftPublicationBody(draft.payload)),
    authReturnTo:
      draft.draftKind === "follow_up" && draft.context.plantObjectId
        ? `/garden/objects/${draft.context.plantObjectId}`
        : "/garden",
  };
}

async function responseRecord(
  response: Response,
): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requirePublicationResult(
  value: Record<string, unknown>,
): OnlineJournalPublicationResult {
  const entry = value.entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new OnlineJournalSubmitError({
      code: "JOURNAL_SUBMIT_INVALID_RESPONSE",
      retryable: true,
    });
  }
  const row = entry as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.clientMutationId !== "string") {
    throw new OnlineJournalSubmitError({
      code: "JOURNAL_SUBMIT_INVALID_RESPONSE",
      retryable: true,
    });
  }
  return value as unknown as OnlineJournalPublicationResult;
}

function submitTransportError(
  response: Response,
  body: Record<string, unknown>,
) {
  const code =
    typeof body.code === "string" ? body.code : "JOURNAL_SUBMIT_UNAVAILABLE";
  const authIntentUrl = boundedAuthIntentUrl(body.authIntentUrl);
  const admission = isDocumentMutationAdmissionTransportResult(body.code)
    ? body.code
    : null;
  return new OnlineJournalSubmitError({
    code,
    status: response.status,
    retryable:
      response.status >= 500 ||
      response.status === 408 ||
      response.status === 429,
    authIntentUrl,
    documentMutationAdmission:
      admission && admission !== "MATCH" ? admission : null,
  });
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * Upload one current-tab media selection through the canonical private
 * quarantine -> processing path. The returned processed asset id is the only
 * media value that may be persisted in a server draft.
 */
export async function uploadOnlineComposerPhoto(input: {
  intent: OnlineComposerPhotoIntent;
  /** Stable UUID used only by the temporary legacy-device retirement bridge. */
  stableUploadGenerationId?: string;
  authReturnTo: string;
  documentMutationGeneration: string;
  signal?: AbortSignal;
  fetchImpl?: OnlineSubmitFetch;
  deadlineMs?: number;
}): Promise<{ mediaAssetId: string; publicUrl: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const generation = requireGeneration(input.documentMutationGeneration);
  const { intent } = input;
  if (
    !ALLOWED_IMAGE_TYPES.has(intent.contentType) ||
    !isAllowedComposerImageSize(intent.size) ||
    !intent.blob ||
    intent.blob.size !== intent.size
  ) {
    throw new OnlineJournalSubmitError({
      code: "JOURNAL_MEDIA_INVALID",
      retryable: false,
    });
  }

  const deadlineMs = Math.max(
    1,
    Math.trunc(input.deadlineMs ?? DEFAULT_SUBMIT_DEADLINE_MS),
  );
  const controller = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
  const abortFromCaller = () => {
    externallyAborted = true;
    controller.abort();
  };
  if (input.signal?.aborted) abortFromCaller();
  else input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadlineMs);
  const raceAbort = <T>(promise: Promise<T>) =>
    Promise.race([promise, aborted]);

  try {
    const reservationResponse = await raceAbort(
      fetchImpl("/api/media/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [AUTH_INTENT_RETURN_HEADER]: input.authReturnTo,
          [DOCUMENT_MUTATION_GENERATION_HEADER]: generation,
          [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
        },
        body: JSON.stringify({
          contentType: intent.contentType,
          sizeBytes: intent.size,
          ...(input.stableUploadGenerationId
            ? { uploadGenerationId: input.stableUploadGenerationId }
            : {}),
        }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    const reservationBody = await raceAbort(
      responseRecord(reservationResponse),
    );
    if (!reservationResponse.ok) {
      throw submitTransportError(reservationResponse, reservationBody);
    }
    const mediaAssetId = reservationBody.mediaAssetId;
    const uploadUrl = reservationBody.uploadUrl;
    const uploadRequired = reservationBody.uploadRequired !== false;
    if (
      typeof mediaAssetId !== "string" ||
      (uploadRequired && typeof uploadUrl !== "string")
    ) {
      throw new OnlineJournalSubmitError({
        code: "JOURNAL_MEDIA_INVALID_RESPONSE",
        retryable: true,
      });
    }

    if (uploadRequired) {
      const quarantineResponse = await raceAbort(
        fetchImpl(uploadUrl as string, {
          method: "PUT",
          headers: { "Content-Type": intent.contentType },
          body: intent.blob!,
          signal: controller.signal,
        }),
      );
      if (!quarantineResponse.ok) {
        throw new OnlineJournalSubmitError({
          code: "JOURNAL_MEDIA_UPLOAD_FAILED",
          status: quarantineResponse.status,
          retryable: true,
        });
      }
    }

    const processResponse = await raceAbort(
      fetchImpl("/api/media/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [AUTH_INTENT_RETURN_HEADER]: input.authReturnTo,
          [DOCUMENT_MUTATION_GENERATION_HEADER]: generation,
          [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
        },
        body: JSON.stringify({ mediaAssetId }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    const processBody = await raceAbort(responseRecord(processResponse));
    if (!processResponse.ok) {
      throw submitTransportError(processResponse, processBody);
    }
    const mediaAsset = processBody.mediaAsset;
    const publicUrl = processBody.publicUrl;
    if (
      !mediaAsset ||
      typeof mediaAsset !== "object" ||
      Array.isArray(mediaAsset) ||
      (mediaAsset as Record<string, unknown>).status !== "processed" ||
      (mediaAsset as Record<string, unknown>).id !== mediaAssetId ||
      typeof publicUrl !== "string" ||
      publicUrl.length < 1
    ) {
      throw new OnlineJournalSubmitError({
        code: "JOURNAL_MEDIA_PROCESSING_UNCONFIRMED",
        retryable: true,
      });
    }
    return { mediaAssetId, publicUrl };
  } catch (error) {
    if (error instanceof OnlineJournalSubmitError) throw error;
    throw new OnlineJournalSubmitError({
      code: timedOut
        ? "JOURNAL_MEDIA_TIMEOUT"
        : externallyAborted
          ? "JOURNAL_MEDIA_REQUEST_ABORTED"
          : "JOURNAL_MEDIA_CONNECTION_REQUIRED",
      retryable: timedOut || !externallyAborted,
    });
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function boundedAuthIntentUrl(value: unknown) {
  return typeof value === "string" &&
    value.length <= 2_048 &&
    /^\/auth\/intent\?intent=[A-Za-z0-9._~-]+$/.test(value)
    ? value
    : null;
}

function normalizeSubmitError(
  error: unknown,
  state: {
    timedOut: boolean;
    superseded: boolean;
    publicationSucceeded: boolean;
  },
) {
  if (state.superseded) return supersededError();
  if (error instanceof OnlineJournalSubmitError) return error;
  if (state.publicationSucceeded) {
    return new OnlineJournalSubmitError({
      code: "JOURNAL_DRAFT_CONSUMPTION_UNCONFIRMED",
      retryable: true,
    });
  }
  if (state.timedOut) {
    return new OnlineJournalSubmitError({
      code: "JOURNAL_SUBMIT_TIMEOUT",
      retryable: true,
    });
  }
  return new OnlineJournalSubmitError({
    code: "JOURNAL_SUBMIT_CONNECTION_REQUIRED",
    retryable: true,
  });
}

function supersededError() {
  return new OnlineJournalSubmitError({
    code: "JOURNAL_SUBMIT_REQUEST_SUPERSEDED",
    retryable: false,
  });
}

function requireGeneration(value: string) {
  if (typeof value !== "string" || value.length < 1) {
    throw new OnlineJournalSubmitError({
      code: "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
      retryable: false,
    });
  }
  return value;
}
