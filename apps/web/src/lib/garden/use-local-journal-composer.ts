"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { DOCUMENT_MUTATION_GENERATION_HEADER } from "@/lib/auth/document-mutation-generation-transport";
import { isDocumentMutationAdmissionTransportResult } from "@/lib/auth/document-mutation-generation-transport";
import {
  BoundedJsonResponseError,
  readBoundedJsonResponse,
} from "@/lib/bounded-json-response";
import type {
  AtomicJournalCreateContext,
  AtomicJournalCreateRequest,
  AtomicJournalCreateResponse,
} from "@/lib/garden/entry-contracts";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "@/lib/garden/entry-contracts";
import {
  LocalJournalMediaCoordinator,
  LocalJournalMediaError,
  type LocalJournalMediaSelection,
  type LocalJournalMediaSnapshot,
} from "@/lib/garden/local-journal-media-coordinator";
import {
  listJournalDocumentImageMediaIds,
  normalizeJournalDocumentOrThrow,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import { BrowserJournalImageEncoder } from "@/lib/media/browser-journal-image-encoder";
import { BrowserEphemeralMediaStager } from "@/lib/media/ephemeral-staging-client";
import { stableJson } from "@/lib/media/ephemeral-staging-crypto";

const EMPTY_MEDIA_SNAPSHOT: LocalJournalMediaSnapshot = { items: [] };
const ATOMIC_PUBLICATION_DEADLINE_MS = 70_000;

export type LocalJournalComposerStatus =
  | "idle"
  | "freezing"
  | "waiting_media"
  | "publishing"
  | "published"
  | "failed";

export interface LocalJournalComposerState {
  status: LocalJournalComposerStatus;
  errorCode: string | null;
}

export interface LocalJournalPublicationInput {
  context: AtomicJournalCreateContext;
  title: string;
  document: JournalDocumentV1;
  coverMediaAssetId: string | null;
  disclosureAccepted: boolean;
  returnTo?: string;
}

export class LocalJournalComposerError extends Error {
  constructor(
    readonly code: string,
    readonly details?: {
      status?: number;
      documentMutationAdmission?: unknown;
      authIntentUrl?: string;
    },
  ) {
    super(code);
    this.name = "LocalJournalComposerError";
  }
}

export interface LocalJournalComposerDependencies {
  fetcher?: typeof fetch;
  createId?: () => string;
  createCoordinator?: (input: {
    stagingSessionId: string;
    documentMutationGeneration: string;
    createId: () => string;
  }) => LocalJournalMediaCoordinator;
  currentLocation?: () => string;
}

export interface LocalJournalComposerController {
  state: LocalJournalComposerState;
  media: LocalJournalMediaSnapshot;
  readOnly: boolean;
  selectImage(
    file: File,
    blockId: string,
    mediaAssetId?: string,
  ): LocalJournalMediaSelection;
  replaceImage(mediaAssetId: string, file: File): LocalJournalMediaSelection;
  retryImage(mediaAssetId: string): LocalJournalMediaSelection;
  removeImage(mediaAssetId: string): Promise<void>;
  publish(
    input: LocalJournalPublicationInput,
  ): Promise<AtomicJournalCreateResponse>;
  cancelPublishing(): void;
  abandon(): void;
}

export function useLocalJournalComposer(input: {
  documentMutationGeneration: string | null | undefined;
  fallbackReturnTo: string;
  dirty: boolean;
  enabled?: boolean;
  dependencies?: LocalJournalComposerDependencies;
}): LocalJournalComposerController {
  const enabled = input.enabled ?? true;
  const [dependencies] = useState(() => input.dependencies);
  const [createId] = useState<() => string>(
    () => dependencies?.createId ?? (() => crypto.randomUUID()),
  );
  const coordinator = useMemo(() => {
    if (!enabled || !input.documentMutationGeneration) return null;
    const stagingSessionId = createId();
    const factory = dependencies?.createCoordinator;
    return factory
      ? factory({
          stagingSessionId,
          documentMutationGeneration: input.documentMutationGeneration,
          createId,
        })
      : new LocalJournalMediaCoordinator({
          stagingSessionId,
          encoder: new BrowserJournalImageEncoder(),
          stager: new BrowserEphemeralMediaStager({
            documentMutationGeneration: input.documentMutationGeneration,
          }),
          createId,
        });
  }, [createId, dependencies, enabled, input.documentMutationGeneration]);
  const media = useSyncExternalStore(
    coordinator?.subscribe ?? subscribeEmpty,
    coordinator?.getSnapshot ?? getEmptySnapshot,
    getEmptySnapshot,
  );
  const [state, setState] = useState<LocalJournalComposerState>({
    status: "idle",
    errorCode: null,
  });
  const mountedRef = useRef(true);
  const publishedRef = useRef(false);
  const publishControllerRef = useRef<AbortController | null>(null);
  const publicationRef = useRef<{
    semanticKey: string;
    request: AtomicJournalCreateRequest;
  } | null>(null);
  const publicationFlightRef =
    useRef<Promise<AtomicJournalCreateResponse> | null>(null);

  const updateState = useCallback((next: LocalJournalComposerState) => {
    if (mountedRef.current) setState(next);
  }, []);

  const abandon = useCallback(() => {
    publishControllerRef.current?.abort();
    publishControllerRef.current = null;
    if (!publishedRef.current) coordinator?.destroy();
  }, [coordinator]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abandon();
    };
  }, [abandon]);

  useEffect(() => {
    if (!enabled || publishedRef.current) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!input.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onPageHide = () => abandon();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [abandon, enabled, input.dirty]);

  const requireCoordinator = useCallback(() => {
    if (!coordinator) {
      throw new LocalJournalComposerError("document_session_not_ready");
    }
    return coordinator;
  }, [coordinator]);

  const selectImage = useCallback(
    (file: File, blockId: string, mediaAssetId?: string) => {
      const selection = requireCoordinator().add(file, {
        blockId,
        mediaAssetId,
      });
      // Immediate insertion callers intentionally do not await this Promise.
      // Marking the rejection observed prevents a failed block from becoming an
      // unhandled rejection while its state remains available for explicit retry.
      void selection.ready.catch(() => undefined);
      return selection;
    },
    [requireCoordinator],
  );

  const replaceImage = useCallback(
    (mediaAssetId: string, file: File) => {
      const selection = requireCoordinator().replace(mediaAssetId, file);
      void selection.ready.catch(() => undefined);
      publicationRef.current = null;
      return selection;
    },
    [requireCoordinator],
  );

  const retryImage = useCallback(
    (mediaAssetId: string) => {
      const selection = requireCoordinator().retry(mediaAssetId);
      void selection.ready.catch(() => undefined);
      return selection;
    },
    [requireCoordinator],
  );

  const removeImage = useCallback(
    async (mediaAssetId: string) => {
      await requireCoordinator().remove(mediaAssetId);
      publicationRef.current = null;
    },
    [requireCoordinator],
  );

  const publish = useCallback(
    (publicationInput: LocalJournalPublicationInput) => {
      if (publicationFlightRef.current) return publicationFlightRef.current;
      const flight = (async () => {
        updateState({ status: "freezing", errorCode: null });
        const document = normalizeJournalDocumentOrThrow(
          JSON.parse(stableJson(publicationInput.document)),
        );
        const returnTo = normalizeJournalComposerReturnTo(
          publicationInput.returnTo ?? currentLocation(dependencies),
          input.fallbackReturnTo,
          typeof location === "undefined"
            ? "https://over.garden"
            : location.origin,
        );
        const semanticInput = {
          context: publicationInput.context,
          title: publicationInput.title,
          document,
          coverMediaAssetId: publicationInput.coverMediaAssetId,
          disclosureAccepted: publicationInput.disclosureAccepted,
          returnTo,
        };
        const semanticKey = stableJson(semanticInput);
        let request =
          publicationRef.current?.semanticKey === semanticKey
            ? publicationRef.current.request
            : null;

        try {
          if (!request) {
            updateState({ status: "waiting_media", errorCode: null });
            const orderedMediaAssetIds =
              listJournalDocumentImageMediaIds(document);
            if (
              publicationInput.coverMediaAssetId &&
              !orderedMediaAssetIds.includes(publicationInput.coverMediaAssetId)
            ) {
              orderedMediaAssetIds.push(publicationInput.coverMediaAssetId);
            }
            const controller = new AbortController();
            publishControllerRef.current = controller;
            const frozen = await abortable(
              requireCoordinator().freeze(orderedMediaAssetIds),
              controller.signal,
            );
            request = {
              publishId: createId(),
              clientMutationId: createId(),
              ...semanticInput,
              mediaClaimReceipts: frozen.mediaClaimReceipts,
            };
            publicationRef.current = { semanticKey, request };
          }

          updateState({ status: "publishing", errorCode: null });
          const controller =
            publishControllerRef.current ?? new AbortController();
          publishControllerRef.current = controller;
          const { response, body: responseBody } = await deadlineJsonFetch(
            dependencies?.fetcher ?? fetch,
            "/api/garden/entries",
            {
              method: "POST",
              redirect: "error",
              credentials: "same-origin",
              cache: "no-store",
              headers: {
                "content-type": "application/json",
                [DOCUMENT_MUTATION_GENERATION_HEADER]:
                  input.documentMutationGeneration ?? "",
                [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]:
                  ATOMIC_JOURNAL_CREATE_PROTOCOL,
              },
              body: JSON.stringify(request),
              signal: controller.signal,
            },
            128 * 1_024,
            ATOMIC_PUBLICATION_DEADLINE_MS,
          );
          if (!response.ok) {
            throw responseError(response, responseBody);
          }
          const result = parseAtomicResponse(responseBody);
          publishedRef.current = true;
          coordinator?.completePublication();
          updateState({ status: "published", errorCode: null });
          return result;
        } catch (error) {
          coordinator?.releasePublicationFreeze();
          const normalized = normalizeComposerError(error);
          updateState(
            normalized.code === "publication_cancelled"
              ? { status: "idle", errorCode: null }
              : { status: "failed", errorCode: normalized.code },
          );
          throw normalized;
        } finally {
          publishControllerRef.current = null;
        }
      })();
      publicationFlightRef.current = flight;
      const clear = () => {
        if (publicationFlightRef.current === flight) {
          publicationFlightRef.current = null;
        }
      };
      void flight.then(clear, clear);
      return flight;
    },
    [
      coordinator,
      createId,
      dependencies,
      input.documentMutationGeneration,
      input.fallbackReturnTo,
      requireCoordinator,
      updateState,
    ],
  );

  const cancelPublishing = useCallback(() => {
    coordinator?.cancelPublicationWait();
    publishControllerRef.current?.abort();
    publishControllerRef.current = null;
    updateState({ status: "idle", errorCode: null });
  }, [coordinator, updateState]);

  return {
    state,
    media,
    readOnly:
      state.status === "freezing" ||
      state.status === "waiting_media" ||
      state.status === "publishing" ||
      state.status === "published",
    selectImage,
    replaceImage,
    retryImage,
    removeImage,
    publish,
    cancelPublishing,
    abandon,
  };
}

function currentLocation(
  dependencies: LocalJournalComposerDependencies | undefined,
) {
  if (dependencies?.currentLocation) return dependencies.currentLocation();
  if (typeof location === "undefined") return "/garden";
  return `${location.pathname}${location.search}${location.hash}`;
}

function subscribeEmpty() {
  return () => undefined;
}

function getEmptySnapshot() {
  return EMPTY_MEDIA_SNAPSHOT;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      new LocalJournalComposerError("publication_cancelled"),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new LocalJournalComposerError("publication_cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function deadlineJsonFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  maxResponseBytes: number,
  deadlineMs: number,
) {
  const source = init.signal;
  const controller = new AbortController();
  const abort = () => controller.abort();
  source?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, deadlineMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const body = await boundedJson(response, maxResponseBytes);
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted && !source?.aborted) {
      throw new LocalJournalComposerError("publication_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    source?.removeEventListener("abort", abort);
  }
}

async function boundedJson(response: Response, maxBytes: number) {
  try {
    return await readBoundedJsonResponse(response, maxBytes);
  } catch (error) {
    if (
      error instanceof BoundedJsonResponseError &&
      error.code === "too_large"
    ) {
      throw new LocalJournalComposerError("publication_response_too_large");
    }
    if (!(error instanceof BoundedJsonResponseError)) throw error;
    throw new LocalJournalComposerError("publication_response_invalid");
  }
}

function responseError(response: Response, body: unknown) {
  const record = isRecord(body) ? body : {};
  const code =
    typeof record.code === "string" ? record.code : "atomic_publication_failed";
  return new LocalJournalComposerError(code, {
    status: response.status,
    documentMutationAdmission:
      record.documentMutationAdmission ??
      (isDocumentMutationAdmissionTransportResult(code) ? code : undefined),
    authIntentUrl:
      typeof record.authIntentUrl === "string"
        ? record.authIntentUrl
        : undefined,
  });
}

function parseAtomicResponse(value: unknown): AtomicJournalCreateResponse {
  if (
    !isRecord(value) ||
    typeof value.entryId !== "string" ||
    typeof value.slug !== "string" ||
    !Number.isSafeInteger(value.revision) ||
    !isRecord(value.card) ||
    typeof value.card.entryId !== "string" ||
    typeof value.card.title !== "string" ||
    typeof value.card.bodyPreview !== "string" ||
    typeof value.card.entryDate !== "string" ||
    !(
      value.card.coverUrl === null || typeof value.card.coverUrl === "string"
    ) ||
    typeof value.card.publicPath !== "string" ||
    typeof value.returnTo !== "string"
  ) {
    throw new LocalJournalComposerError("publication_response_invalid");
  }
  return value as unknown as AtomicJournalCreateResponse;
}

function normalizeComposerError(error: unknown) {
  if (error instanceof LocalJournalComposerError) return error;
  if (error instanceof LocalJournalMediaError) {
    return new LocalJournalComposerError(error.code);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new LocalJournalComposerError("publication_cancelled");
  }
  return new LocalJournalComposerError("atomic_publication_failed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
