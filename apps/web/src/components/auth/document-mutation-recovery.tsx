"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DOCUMENT_MUTATION_GENERATION_FORM_FIELD,
  DOCUMENT_MUTATION_GENERATION_HEADER,
  DOCUMENT_OWNER_CHANGED_EVENT,
  isDocumentMutationAdmissionTransportResult,
  type DocumentMutationAdmissionTransportResultV1,
} from "@/lib/auth/document-mutation-generation-transport";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { RemainingDocumentMutationTransportBoundary } from "./remaining-document-mutation-recovery";

export { DOCUMENT_OWNER_CHANGED_EVENT };

type RecoveryState =
  | "idle"
  | "unavailable"
  | "session_refresh"
  | "protocol_refresh"
  | "authentication_required"
  | "owner_changed";

export interface DocumentMutationGenerationContextValue {
  transport: string | null;
  recoveryState: RecoveryState;
  handleTransportResult: (
    result: DocumentMutationAdmissionTransportResultV1,
  ) => void;
  handleResponse: (response: Response) => Promise<boolean>;
  handleIdempotentTransportResult: (input: {
    retryKey: string;
    result: Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH">;
    retry: (freshTransport: string) => void;
  }) => boolean;
}

const DocumentMutationGenerationContext =
  createContext<DocumentMutationGenerationContextValue | null>(null);

const RECOVERY_COPY: Record<
  InterfaceLocale,
  Record<Exclude<RecoveryState, "idle">, string>
> = {
  uk: {
    unavailable:
      "З’єднання не підтверджено. Чернетка збережена — спробуйте ще раз.",
    session_refresh: "Сесію оновлено. Перевірте чернетку й повторіть дію.",
    protocol_refresh: "Сторінку оновлено без втрати чернетки. Повторіть дію.",
    authentication_required: "Увійдіть знову, щоб зберегти зміни.",
    owner_changed: "Обліковий запис змінився. Приватні дані приховано.",
  },
  bg: {
    unavailable:
      "Връзката не е потвърдена. Черновата е запазена — опитайте отново.",
    session_refresh:
      "Сесията е обновена. Проверете черновата и повторете действието.",
    protocol_refresh:
      "Страницата е обновена без загуба на черновата. Опитайте отново.",
    authentication_required: "Влезте отново, за да запазите промените.",
    owner_changed: "Акаунтът е сменен. Личните данни са скрити.",
  },
  ru: {
    unavailable:
      "Соединение не подтверждено. Черновик сохранён — повторите попытку.",
    session_refresh:
      "Сессия обновлена. Проверьте черновик и повторите действие.",
    protocol_refresh:
      "Страница обновлена без потери черновика. Повторите действие.",
    authentication_required: "Войдите снова, чтобы сохранить изменения.",
    owner_changed: "Аккаунт изменился. Личные данные скрыты.",
  },
};

export function DocumentMutationGenerationProvider({
  children,
  locale,
  transport,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  transport: string | null;
}) {
  const router = useRouter();
  const [recoverySnapshot, setRecoverySnapshot] = useState<{
    transport: string | null;
    state: RecoveryState;
  }>({ transport, state: "idle" });
  const recoveryState =
    recoverySnapshot.transport === transport ? recoverySnapshot.state : "idle";
  const setRecoveryState = useCallback(
    (state: RecoveryState) => setRecoverySnapshot({ transport, state }),
    [transport],
  );
  const refreshedCodesRef = useRef(
    new Set<DocumentMutationAdmissionTransportResultV1>(),
  );
  const ownerChangeEmittedRef = useRef(false);
  const previousTransportRef = useRef(transport);
  const pendingIdempotentRetryRef = useRef<{
    retryKey: string;
    sourceTransport: string;
    retry: (freshTransport: string) => void;
  } | null>(null);
  const consumedIdempotentRetryKeysRef = useRef(new Set<string>());

  const handleTransportResult = useCallback(
    (result: DocumentMutationAdmissionTransportResultV1) => {
      if (result === "MATCH") {
        setRecoveryState("idle");
        return;
      }
      if (result === "DOCUMENT_OWNER_CHANGED") {
        setRecoveryState("owner_changed");
        if (!ownerChangeEmittedRef.current) {
          ownerChangeEmittedRef.current = true;
          window.dispatchEvent(new Event(DOCUMENT_OWNER_CHANGED_EVENT));
        }
        return;
      }
      if (result === "MUTATION_ADMISSION_UNAVAILABLE") {
        setRecoveryState("unavailable");
        return;
      }
      if (result === "AUTHENTICATION_REQUIRED") {
        setRecoveryState("authentication_required");
        return;
      }

      setRecoveryState(
        result === "DOCUMENT_SESSION_REFRESH_REQUIRED"
          ? "session_refresh"
          : "protocol_refresh",
      );
      if (!refreshedCodesRef.current.has(result)) {
        refreshedCodesRef.current.add(result);
        router.refresh();
      }
    },
    [router, setRecoveryState],
  );

  useEffect(() => {
    const previousTransport = previousTransportRef.current;
    previousTransportRef.current = transport;
    refreshedCodesRef.current.clear();
    ownerChangeEmittedRef.current = false;
    const pending = pendingIdempotentRetryRef.current;
    if (!pending || !transport || transport === previousTransport) return;

    pendingIdempotentRetryRef.current = null;
    const controller = new AbortController();
    void confirmDocumentMutationOwnerContinuity(
      pending.sourceTransport,
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (
        result === "MATCH" ||
        result === "DOCUMENT_SESSION_REFRESH_REQUIRED"
      ) {
        pending.retry(transport);
        return;
      }
      handleTransportResult(result);
    });
    return () => controller.abort();
  }, [handleTransportResult, transport]);

  const handleResponse = useCallback(
    async (response: Response) => {
      const result = await readDocumentMutationAdmissionResult(response);
      if (!result || result === "MATCH") return false;
      handleTransportResult(result);
      return true;
    },
    [handleTransportResult],
  );

  const handleIdempotentTransportResult = useCallback(
    (input: {
      retryKey: string;
      result: Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH">;
      retry: (freshTransport: string) => void;
    }) => {
      const retryKey = input.retryKey.trim();
      const mayRetry =
        input.result === "DOCUMENT_SESSION_REFRESH_REQUIRED" &&
        typeof transport === "string" &&
        retryKey.length > 0 &&
        !consumedIdempotentRetryKeysRef.current.has(retryKey) &&
        pendingIdempotentRetryRef.current === null;
      if (mayRetry) {
        consumedIdempotentRetryKeysRef.current.add(retryKey);
        pendingIdempotentRetryRef.current = {
          retryKey,
          sourceTransport: transport,
          retry: input.retry,
        };
      }
      handleTransportResult(input.result);
      return mayRetry;
    },
    [handleTransportResult, transport],
  );

  const value = useMemo<DocumentMutationGenerationContextValue>(
    () => ({
      transport,
      recoveryState,
      handleTransportResult,
      handleResponse,
      handleIdempotentTransportResult,
    }),
    [
      handleIdempotentTransportResult,
      handleResponse,
      handleTransportResult,
      recoveryState,
      transport,
    ],
  );

  return (
    <DocumentMutationGenerationContext.Provider value={value}>
      <RemainingDocumentMutationTransportBoundary
        transport={transport}
        handleTransportResult={handleTransportResult}
        confirmOwnerContinuity={confirmDocumentMutationOwnerContinuity}
      />
      {children}
      {recoveryState !== "idle" && recoveryState !== "owner_changed" ? (
        <p
          role="status"
          aria-live="polite"
          data-document-mutation-recovery={recoveryState}
          className="sr-only"
        >
          {RECOVERY_COPY[locale][recoveryState]}
        </p>
      ) : null}
    </DocumentMutationGenerationContext.Provider>
  );
}

export function useDocumentMutationGeneration(): DocumentMutationGenerationContextValue {
  const value = useContext(DocumentMutationGenerationContext);
  if (!value) {
    throw new Error(
      "Document mutation generation requires the authenticated site shell.",
    );
  }
  return value;
}

export function useOptionalDocumentMutationGeneration() {
  return useContext(DocumentMutationGenerationContext);
}

export function createDocumentMutationRequestHeaders(
  transport: string | null | undefined,
): Record<string, string> {
  return transport ? { [DOCUMENT_MUTATION_GENERATION_HEADER]: transport } : {};
}

export function DocumentMutationGenerationFormField() {
  const transport = useOptionalDocumentMutationGeneration()?.transport ?? null;
  if (!transport) return null;
  return (
    <input
      type="hidden"
      name={DOCUMENT_MUTATION_GENERATION_FORM_FIELD}
      value={transport}
    />
  );
}

export function DocumentMutationActionForm({
  action,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<unknown>;
}) {
  const recovery = useOptionalDocumentMutationGeneration();
  const handledStateRef = useRef<unknown>(undefined);
  const [state, formAction] = useActionState<unknown, FormData>(
    async (_previousState: unknown, formData: FormData) => action(formData),
    undefined,
  );

  useEffect(() => {
    const admission = readDocumentMutationActionAdmission(state);
    if (admission && handledStateRef.current !== state) {
      handledStateRef.current = state;
      recovery?.handleTransportResult(admission);
    }
  }, [recovery, state]);

  return (
    <form {...props} action={formAction} data-document-mutation-managed="true">
      <DocumentMutationGenerationFormField />
      {children}
    </form>
  );
}

function readDocumentMutationActionAdmission(
  state: unknown,
): DocumentMutationAdmissionTransportResultV1 | null {
  if (!state || typeof state !== "object") return null;
  const admission = (state as { documentMutationAdmission?: unknown })
    .documentMutationAdmission;
  return isDocumentMutationAdmissionTransportResult(admission)
    ? admission
    : null;
}

export async function readDocumentMutationAdmissionResult(
  response: Response,
): Promise<DocumentMutationAdmissionTransportResultV1 | null> {
  if (response.ok) return "MATCH";
  try {
    const payload = (await response.clone().json()) as { code?: unknown };
    return isDocumentMutationAdmissionTransportResult(payload.code)
      ? payload.code
      : null;
  } catch {
    return null;
  }
}

export async function confirmDocumentMutationOwnerContinuity(
  sourceTransport: string,
  signal: AbortSignal,
): Promise<DocumentMutationAdmissionTransportResultV1> {
  try {
    const response = await fetch(
      "/api/document-mutation-admission/continuity",
      {
        method: "POST",
        headers: createDocumentMutationRequestHeaders(sourceTransport),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal,
      },
    );
    return (
      (await readDocumentMutationAdmissionResult(response)) ??
      "MUTATION_ADMISSION_UNAVAILABLE"
    );
  } catch {
    return "MUTATION_ADMISSION_UNAVAILABLE";
  }
}
