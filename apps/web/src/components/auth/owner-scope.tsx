"use client";

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
  OWNER_USER_ID_FORM_FIELD,
  isMutationScopeCode,
  type MutationScopeCode,
} from "@/lib/auth/owner-scope-contract";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";

export interface OwnerScopeContextValue {
  /** The owner this document was rendered for; null for a guest. */
  ownerUserId: string | null;
  noticeCode: MutationScopeCode | null;
  headers(): Record<string, string>;
  /** True when the response was a session refusal that is now shown. */
  handleResponse(response: Response): Promise<boolean>;
  /** True when a Server Action result carried a session refusal. */
  handleActionResult(result: unknown): boolean;
}

const OwnerScopeContext = createContext<OwnerScopeContextValue | null>(null);

const NOTICE_COPY: Record<
  InterfaceLocale,
  Record<MutationScopeCode, string>
> = {
  uk: {
    session_required:
      "Сесія завершилась. Увійдіть знову, текст лишиться на екрані.",
    session_account_changed: "Ви увійшли як інший акаунт. Оновіть сторінку.",
  },
  bg: {
    session_required:
      "Сесията приключи. Влезте отново, текстът остава на екрана.",
    session_account_changed: "Влязохте като друг профил. Обновете страницата.",
  },
  ru: {
    session_required:
      "Сессия завершилась. Войдите снова, текст останется на экране.",
    session_account_changed: "Вы вошли как другой аккаунт. Обновите страницу.",
  },
};

export function OwnerScopeProvider({
  children,
  locale,
  ownerUserId,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  ownerUserId: string | null;
}) {
  const [noticeCode, setNoticeCode] = useState<MutationScopeCode | null>(null);

  const handleActionResult = useCallback((result: unknown) => {
    const code = readMutationScopeCode(result);
    if (!code) return false;
    setNoticeCode(code);
    return true;
  }, []);

  const handleResponse = useCallback(
    async (response: Response) => {
      if (response.ok) return false;
      return handleActionResult(await readMutationScopeBody(response));
    },
    [handleActionResult],
  );

  const value = useMemo<OwnerScopeContextValue>(
    () => ({
      ownerUserId,
      noticeCode,
      headers: () => ownerScopeHeaders(ownerUserId),
      handleResponse,
      handleActionResult,
    }),
    [handleActionResult, handleResponse, noticeCode, ownerUserId],
  );

  return (
    <OwnerScopeContext.Provider value={value}>
      {children}
      {noticeCode ? (
        <p
          role="alert"
          data-mutation-scope-notice={noticeCode}
          className="fixed inset-x-3 bottom-3 z-50 rounded-md border border-destructive/40 bg-background px-4 py-3 text-sm text-foreground shadow-lg sm:right-4 sm:left-auto sm:max-w-sm"
        >
          {NOTICE_COPY[locale][noticeCode]}
        </p>
      ) : null}
    </OwnerScopeContext.Provider>
  );
}

export function useOwnerScope(): OwnerScopeContextValue {
  const value = useContext(OwnerScopeContext);
  if (!value) {
    throw new Error("Owner scope requires the site shell.");
  }
  return value;
}

export function useOptionalOwnerScope() {
  return useContext(OwnerScopeContext);
}

/** Hidden field for native and Server Action forms rendered for an owner. */
export function OwnerUserIdField() {
  const ownerUserId = useOptionalOwnerScope()?.ownerUserId ?? null;
  if (!ownerUserId) return null;
  return (
    <input type="hidden" name={OWNER_USER_ID_FORM_FIELD} value={ownerUserId} />
  );
}

/**
 * A Server Action form that carries the rendered owner id and surfaces a
 * session refusal (`{ mutationScope: code }`) without discarding the form.
 */
export function OwnerScopedActionForm({
  action,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<unknown>;
}) {
  const ownerScope = useOptionalOwnerScope();
  const handledStateRef = useRef<unknown>(undefined);
  const [state, formAction] = useActionState<unknown, FormData>(
    async (_previousState: unknown, formData: FormData) => action(formData),
    undefined,
  );

  useEffect(() => {
    if (state === undefined || handledStateRef.current === state) return;
    handledStateRef.current = state;
    ownerScope?.handleActionResult(state);
  }, [ownerScope, state]);

  return (
    <form {...props} action={formAction}>
      <OwnerUserIdField />
      {children}
    </form>
  );
}

export function readMutationScopeCode(
  result: unknown,
): MutationScopeCode | null {
  if (!result || typeof result !== "object") return null;
  const code = (result as { mutationScope?: unknown }).mutationScope;
  return isMutationScopeCode(code) ? code : null;
}

async function readMutationScopeBody(response: Response): Promise<unknown> {
  try {
    const payload = (await response.clone().json()) as { code?: unknown };
    return { mutationScope: payload.code };
  } catch {
    return null;
  }
}
