"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  JournalEntryDraftContext,
  JournalEntryDraftKind,
  JournalEntryDraftPayloadV1,
  JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import {
  stableSerializeJournalDraftPayload,
  stableSerializeJournalDraftUserIntent,
} from "@/lib/garden/entry-contracts";
import {
  createOnlineJournalDraftOwner,
  OnlineJournalDraftError,
  type OnlineJournalDraftOwner,
} from "@/lib/garden/online-journal-draft";
import {
  createOnlineJournalSubmitOwner,
  type OnlineJournalPublicationResult,
  type OnlineJournalSubmitOwner,
} from "@/lib/garden/online-journal-submit";
import { registerOnlineJournalComposerParticipant } from "@/lib/garden/online-journal-composer-participants";

const AUTOSAVE_DEBOUNCE_MS = 250;
const AUTOSAVE_REQUEST_DEADLINE_MS = 1_200;

export type OnlineJournalComposerStatus =
  | "awaiting_session"
  | "hydrating"
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "publishing"
  | "consumed"
  | "connection_required"
  | "conflict";

export interface OnlineJournalComposerState {
  status: OnlineJournalComposerStatus;
  hydrated: boolean;
  savedAt: string | null;
  errorCode: string | null;
}

interface SaveAttempt {
  payload: JournalEntryDraftPayloadV1;
  serialized: string;
  userIntentSerialized: string;
  generation: number;
  expectedServerRevision: number | null;
}

type RetryAction = () => Promise<unknown>;
type RetryIntent =
  | { kind: "hydrate" }
  | { kind: "save"; attempt: SaveAttempt }
  | { kind: "publish" }
  | { kind: "custom"; action: RetryAction };

export function useOnlineJournalComposer(input: {
  draftKey: string;
  draftKind: JournalEntryDraftKind;
  context: JournalEntryDraftContext;
  payload: JournalEntryDraftPayloadV1;
  documentMutationGeneration: string | null | undefined;
  enabled?: boolean;
  onHydrated: (receipt: JournalEntryDraftReceiptV1) => void;
}) {
  const enabled = input.enabled ?? true;
  const payloadSerialized = stableSerializeJournalDraftPayload(input.payload);
  const userIntentSerialized = stableSerializeJournalDraftUserIntent(
    input.payload,
  );
  const contextKey = JSON.stringify(input.context);
  const payloadRef = useRef(input.payload);
  const payloadSerializedRef = useRef(payloadSerialized);
  const userIntentSerializedRef = useRef(userIntentSerialized);
  const contextRef = useRef(input.context);
  const initialUserIntentSerializedRef = useRef(userIntentSerialized);
  const ownerIdentityRef = useRef(`${input.draftKind}:${input.draftKey}`);
  const onHydratedRef = useRef(input.onHydrated);
  const draftOwnerRef = useRef<OnlineJournalDraftOwner | null>(null);
  const submitOwnerRef = useRef<OnlineJournalSubmitOwner | null>(null);
  const receiptRef = useRef<JournalEntryDraftReceiptV1 | null>(null);
  const lastSavedSerializedRef = useRef<string | null>(null);
  const lastSavedUserIntentSerializedRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const lastAttemptRef = useRef<SaveAttempt | null>(null);
  const retryIntentRef = useRef<RetryIntent | null>(null);
  const retryInFlightRef = useRef<Promise<unknown> | null>(null);
  const saveInFlightRef = useRef<{
    serialized: string;
    promise: Promise<JournalEntryDraftReceiptV1>;
  } | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<OnlineJournalComposerStatus>(
    enabled ? "awaiting_session" : "idle",
  );
  const tabTokenRef = useRef(Symbol(input.draftKey));
  const externalFreezeTokensRef = useRef(new Set<symbol>());
  const [externallyFrozen, setExternallyFrozen] = useState(false);
  const [state, setStateValue] = useState<OnlineJournalComposerState>({
    status: enabled ? "awaiting_session" : "idle",
    hydrated: !enabled,
    savedAt: null,
    errorCode: null,
  });

  useEffect(() => {
    payloadRef.current = input.payload;
    payloadSerializedRef.current = payloadSerialized;
    userIntentSerializedRef.current = userIntentSerialized;
    contextRef.current = input.context;
    onHydratedRef.current = input.onHydrated;
  }, [
    input.context,
    input.onHydrated,
    input.payload,
    payloadSerialized,
    userIntentSerialized,
  ]);

  const setState = useCallback((next: OnlineJournalComposerState) => {
    statusRef.current = next.status;
    if (mountedRef.current) setStateValue(next);
  }, []);

  const hydrate = useCallback(async () => {
    const owner = draftOwnerRef.current;
    if (!owner) return null;
    setState({
      status: "hydrating",
      hydrated: false,
      savedAt: receiptRef.current?.updatedAt ?? null,
      errorCode: null,
    });
    try {
      const receipt = await owner.hydrate();
      receiptRef.current = receipt;
      generationRef.current = receipt?.generation ?? 0;
      lastAttemptRef.current = null;
      retryIntentRef.current = null;
      if (receipt) {
        lastSavedSerializedRef.current = stableSerializeJournalDraftPayload(
          receipt.payload,
        );
        lastSavedUserIntentSerializedRef.current =
          stableSerializeJournalDraftUserIntent(receipt.payload);
        onHydratedRef.current(receipt);
      } else {
        lastSavedSerializedRef.current = payloadSerializedRef.current;
        lastSavedUserIntentSerializedRef.current =
          userIntentSerializedRef.current;
      }
      setState({
        status: receipt ? "saved" : "idle",
        hydrated: true,
        savedAt: receipt?.updatedAt ?? null,
        errorCode: null,
      });
      return receipt;
    } catch (error) {
      if (isSuperseded(error)) return null;
      retryIntentRef.current = { kind: "hydrate" };
      setState({
        status: isConflict(error) ? "conflict" : "connection_required",
        hydrated: true,
        savedAt: receiptRef.current?.updatedAt ?? null,
        errorCode: errorCode(error),
      });
      throw error;
    }
  }, [setState]);

  const saveAttempt = useCallback(
    async (attempt: SaveAttempt, keepalive = false) => {
      const owner = draftOwnerRef.current;
      if (!owner) {
        const error = new OnlineJournalDraftError({
          code: "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
          retryable: false,
        });
        retryIntentRef.current = { kind: "hydrate" };
        setState({
          status: "connection_required",
          hydrated: true,
          savedAt: receiptRef.current?.updatedAt ?? null,
          errorCode: error.code,
        });
        throw error;
      }
      setState({
        status: "saving",
        hydrated: true,
        savedAt: receiptRef.current?.updatedAt ?? null,
        errorCode: null,
      });
      retryIntentRef.current = { kind: "save", attempt };
      try {
        const receipt = await owner.save(attempt.payload, {
          generation: attempt.generation,
          expectedServerRevision: attempt.expectedServerRevision,
          keepalive,
        });
        receiptRef.current = receipt;
        generationRef.current = receipt.generation;
        lastSavedSerializedRef.current = attempt.serialized;
        lastSavedUserIntentSerializedRef.current =
          attempt.userIntentSerialized;
        lastAttemptRef.current = attempt;
        retryIntentRef.current = null;
        const stillCurrent =
          payloadSerializedRef.current === attempt.serialized;
        setState({
          status: stillCurrent ? "saved" : "dirty",
          hydrated: true,
          savedAt: receipt.updatedAt,
          errorCode: null,
        });
        return receipt;
      } catch (error) {
        if (isSuperseded(error)) throw error;
        if (isConflict(error)) retryIntentRef.current = { kind: "hydrate" };
        setState({
          status: isConflict(error) ? "conflict" : "connection_required",
          hydrated: true,
          savedAt: receiptRef.current?.updatedAt ?? null,
          errorCode: errorCode(error),
        });
        throw error;
      }
    },
    [setState],
  );

  const saveNow = useCallback(
    async (
      payload: JournalEntryDraftPayloadV1 = payloadRef.current,
      options: { keepalive?: boolean } = {},
    ) => {
      const serialized = stableSerializeJournalDraftPayload(payload);
      const payloadSnapshot = JSON.parse(
        serialized,
      ) as JournalEntryDraftPayloadV1;
      while (saveInFlightRef.current) {
        const current = saveInFlightRef.current;
        if (current.serialized === serialized) return current.promise;
        await current.promise;
      }
      const previous = lastAttemptRef.current;
      const attempt =
        previous?.serialized === serialized
          ? previous
          : {
              payload: payloadSnapshot,
              serialized,
              userIntentSerialized:
                stableSerializeJournalDraftUserIntent(payloadSnapshot),
              generation:
                Math.max(generationRef.current, previous?.generation ?? 0) + 1,
              expectedServerRevision:
                receiptRef.current?.serverRevision ?? null,
            };
      lastAttemptRef.current = attempt;
      const promise = saveAttempt(attempt, options.keepalive ?? false);
      saveInFlightRef.current = { serialized, promise };
      const clear = () => {
        if (saveInFlightRef.current?.promise === promise) {
          saveInFlightRef.current = null;
        }
      };
      void promise.then(clear, clear);
      return promise;
    },
    [saveAttempt],
  );

  const publish = useCallback(
    async (payload: JournalEntryDraftPayloadV1 = payloadRef.current) => {
      const serialized = stableSerializeJournalDraftPayload(payload);
      let receipt = receiptRef.current;
      if (!receipt || lastSavedSerializedRef.current !== serialized) {
        receipt = await saveNow(payload);
      }
      const owner = submitOwnerRef.current;
      if (!owner)
        throw new Error("Online journal submit owner is unavailable.");
      setState({
        status: "publishing",
        hydrated: true,
        savedAt: receipt.updatedAt,
        errorCode: null,
      });
      retryIntentRef.current = { kind: "publish" };
      try {
        const result = await owner.submit(receipt);
        receiptRef.current = null;
        lastSavedSerializedRef.current = null;
        lastSavedUserIntentSerializedRef.current = null;
        retryIntentRef.current = null;
        setState({
          status: "consumed",
          hydrated: true,
          savedAt: null,
          errorCode: null,
        });
        return result;
      } catch (error) {
        setState({
          status: "connection_required",
          hydrated: true,
          savedAt: receipt.updatedAt,
          errorCode: errorCode(error),
        });
        throw error;
      }
    },
    [saveNow, setState],
  );

  const retry = useCallback(async () => {
    if (retryInFlightRef.current) return retryInFlightRef.current;
    const intent = retryIntentRef.current ?? { kind: "hydrate" as const };
    const action: RetryAction = async () => {
      if (intent.kind === "hydrate") return hydrate();
      if (intent.kind === "save") return saveAttempt(intent.attempt, false);
      if (intent.kind === "custom") return intent.action();

      const owner = submitOwnerRef.current;
      if (!owner) throw new Error("Online journal submit owner is unavailable.");
      const result = await owner.retry();
      receiptRef.current = null;
      lastSavedSerializedRef.current = null;
      lastSavedUserIntentSerializedRef.current = null;
      retryIntentRef.current = null;
      setState({
        status: "consumed",
        hydrated: true,
        savedAt: null,
        errorCode: null,
      });
      return result;
    };
    const running = Promise.resolve().then(action);
    retryInFlightRef.current = running;
    try {
      return await running;
    } finally {
      if (retryInFlightRef.current === running) {
        retryInFlightRef.current = null;
      }
    }
  }, [hydrate, saveAttempt, setState]);

  const reportConnectionRequired = useCallback(
    (error: unknown, retryAction?: RetryAction) => {
      retryIntentRef.current = retryAction
        ? { kind: "custom", action: retryAction }
        : { kind: "hydrate" };
      setState({
        status: isConflict(error) ? "conflict" : "connection_required",
        hydrated: true,
        savedAt: receiptRef.current?.updatedAt ?? null,
        errorCode: errorCode(error),
      });
    },
    [setState],
  );

  const flushLatest = useCallback(
    async (options: { keepalive?: boolean } = {}) => {
      const status = statusRef.current;
      if (
        [
          "awaiting_session",
          "hydrating",
          "publishing",
          "consumed",
        ].includes(status)
      ) {
        return;
      }
      const baseline =
        lastSavedUserIntentSerializedRef.current ??
        initialUserIntentSerializedRef.current;
      if (userIntentSerializedRef.current === baseline) return;
      if (
        payloadSerializedRef.current === lastSavedSerializedRef.current &&
        status !== "connection_required" &&
        status !== "conflict"
      ) {
        return;
      }
      await saveNow(payloadRef.current, options);
    },
    [saveNow],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setState({
        status: "idle",
        hydrated: true,
        savedAt: null,
        errorCode: null,
      });
      return;
    }
    const ownerIdentity = `${input.draftKind}:${input.draftKey}`;
    const identityChanged = ownerIdentityRef.current !== ownerIdentity;
    if (identityChanged) {
      ownerIdentityRef.current = ownerIdentity;
      initialUserIntentSerializedRef.current = userIntentSerializedRef.current;
      receiptRef.current = null;
      lastSavedSerializedRef.current = null;
      lastSavedUserIntentSerializedRef.current = null;
      generationRef.current = 0;
      lastAttemptRef.current = null;
      retryIntentRef.current = null;
      saveInFlightRef.current = null;
    }
    if (!identityChanged && statusRef.current === "consumed") return;
    const transport = input.documentMutationGeneration?.trim();
    if (!transport) {
      draftOwnerRef.current?.abort();
      submitOwnerRef.current?.abort();
      draftOwnerRef.current = null;
      submitOwnerRef.current = null;
      setState({
        status: "awaiting_session",
        hydrated: false,
        savedAt: null,
        errorCode: null,
      });
      return;
    }

    const draftOwner = createOnlineJournalDraftOwner({
      draftKey: input.draftKey,
      draftKind: input.draftKind,
      context: contextRef.current,
      documentMutationGeneration: transport,
      deadlineMs: AUTOSAVE_REQUEST_DEADLINE_MS,
    });
    const submitOwner = createOnlineJournalSubmitOwner({
      documentMutationGeneration: transport,
      draftOwner,
    });
    draftOwnerRef.current = draftOwner;
    submitOwnerRef.current = submitOwner;
    void hydrate().catch(() => undefined);

    return () => {
      draftOwner.abort();
      submitOwner.abort();
      if (draftOwnerRef.current === draftOwner) draftOwnerRef.current = null;
      if (submitOwnerRef.current === submitOwner) submitOwnerRef.current = null;
    };
  }, [
    enabled,
    hydrate,
    input.documentMutationGeneration,
    input.draftKey,
    input.draftKind,
    setState,
  ]);

  useEffect(() => {
    if (!enabled) return;
    draftOwnerRef.current?.replaceContext(
      JSON.parse(contextKey) as JournalEntryDraftContext,
    );
  }, [contextKey, enabled]);

  useEffect(() => {
    if (
      !enabled ||
      !state.hydrated ||
      userIntentSerialized ===
        (lastSavedUserIntentSerializedRef.current ??
          initialUserIntentSerializedRef.current) ||
      payloadSerialized === lastSavedSerializedRef.current ||
      state.status === "connection_required" ||
      state.status === "conflict" ||
      state.status === "saving" ||
      state.status === "publishing" ||
      state.status === "consumed"
    ) {
      return;
    }
    setState({
      status: "dirty",
      hydrated: true,
      savedAt: receiptRef.current?.updatedAt ?? null,
      errorCode: null,
    });
    const timer = window.setTimeout(() => {
      void saveNow(payloadRef.current).catch((error) => {
        if (!isSuperseded(error)) return;
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    payloadSerialized,
    userIntentSerialized,
    saveNow,
    setState,
    state.hydrated,
    state.status,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const finalAttempt = () => {
      void flushLatest({ keepalive: true }).catch(() => undefined);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") finalAttempt();
    };
    window.addEventListener("beforeunload", finalAttempt);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", finalAttempt);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, flushLatest]);

  useEffect(() => {
    if (!enabled) return;
    return registerOnlineJournalComposerParticipant({
      freeze(token) {
        externalFreezeTokensRef.current.add(token);
        setExternallyFrozen(true);
      },
      async flushLatest() {
        await flushLatest({ keepalive: true });
      },
      resume(token) {
        externalFreezeTokensRef.current.delete(token);
        setExternallyFrozen(externalFreezeTokensRef.current.size > 0);
      },
      abort() {
        draftOwnerRef.current?.abort();
        submitOwnerRef.current?.abort();
      },
    });
  }, [enabled, flushLatest]);

  useEffect(() => {
    const token = tabTokenRef.current;
    const unsaved = [
      "dirty",
      "saving",
      "connection_required",
      "conflict",
    ].includes(state.status);
    markTabUnsaved(token, unsaved);
    return () => markTabUnsaved(token, false);
  }, [state.status]);

  useEffect(() => {
    const token = tabTokenRef.current;
    return () => {
      mountedRef.current = false;
      markTabUnsaved(token, false);
    };
  }, []);

  return {
    state,
    readOnly:
      enabled &&
      (externallyFrozen ||
        [
          "awaiting_session",
          "hydrating",
          "connection_required",
          "conflict",
          "publishing",
          "consumed",
        ].includes(state.status)),
    saveNow,
    publish,
    retry,
    reportConnectionRequired,
  };
}

function isConflict(error: unknown) {
  return (
    error instanceof OnlineJournalDraftError &&
    error.code === "JOURNAL_DRAFT_CONFLICT"
  );
}

function isSuperseded(error: unknown) {
  return (
    error instanceof OnlineJournalDraftError &&
    error.code === "JOURNAL_DRAFT_REQUEST_SUPERSEDED"
  );
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "JOURNAL_CONNECTION_REQUIRED";
}

const unsavedTabOwners = new Set<symbol>();
let originalTabTitle: string | null = null;

function markTabUnsaved(token: symbol, unsaved: boolean) {
  if (typeof document === "undefined") return;
  if (originalTabTitle === null) {
    originalTabTitle = document.title.replace(/^●\s+/, "");
  }
  if (unsaved) unsavedTabOwners.add(token);
  else unsavedTabOwners.delete(token);
  document.title =
    unsavedTabOwners.size > 0 ? `● ${originalTabTitle}` : originalTabTitle;
  if (unsavedTabOwners.size === 0) originalTabTitle = null;
}

export type { OnlineJournalPublicationResult };
