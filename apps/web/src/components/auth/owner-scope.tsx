"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useLayoutEffect,
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
import {
  createValueStore,
  useValueStore,
  type ValueStore,
} from "@/lib/value-store";
import { HiddenField } from "@/components/ui/hidden-field";

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

/**
 * What the provider hands down, and it never changes (ADR-0032 D10).
 *
 * The owner arrives late in a static document — when the session the server
 * started settles — and a refusal arrives whenever a mutation is refused. As
 * context *values* either one would reach every boundary below this provider
 * that React has not hydrated yet, and one whose content is still on its way is
 * then rendered on the client instead of adopted. So both live in stores, and
 * only what reads them renders again.
 */
interface OwnerScope {
  owner: ValueStore<string | null>;
  notice: ValueStore<MutationScopeCode | null>;
  handleResponse(response: Response): Promise<boolean>;
  handleActionResult(result: unknown): boolean;
}

const OwnerScopeContext = createContext<OwnerScope | null>(null);

function createOwnerScope(ownerUserId: string | null): OwnerScope {
  const notice = createValueStore<MutationScopeCode | null>(null);
  const handleActionResult = (result: unknown) => {
    const code = readMutationScopeCode(result);
    if (!code) return false;
    notice.set(code);
    return true;
  };

  return {
    owner: createValueStore(ownerUserId),
    notice,
    handleActionResult,
    handleResponse: async (response) =>
      response.ok
        ? false
        : handleActionResult(await readMutationScopeBody(response)),
  };
}

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
  /**
   * The owner the document was rendered for. A static document passes `null`
   * and names the owner later, through `useOwnerScopeControl`.
   */
  ownerUserId: string | null;
}) {
  const [scope] = useState(() => createOwnerScope(ownerUserId));

  // Follows the prop when the prop *changes* — a request-time document that is
  // refreshed for another reader — and never on mount, where the store already
  // holds it and a static document's late answer must not be overwritten.
  const renderedFor = useRef(ownerUserId);
  useLayoutEffect(() => {
    if (renderedFor.current === ownerUserId) return;
    renderedFor.current = ownerUserId;
    scope.owner.set(ownerUserId);
  }, [ownerUserId, scope]);

  return (
    <OwnerScopeContext.Provider value={scope}>
      {children}
      <OwnerScopeNotice locale={locale} />
    </OwnerScopeContext.Provider>
  );
}

function OwnerScopeNotice({ locale }: { locale: InterfaceLocale }) {
  const scope = useContext(OwnerScopeContext);
  const noticeCode = useValueStore(scope?.notice ?? NO_NOTICE);

  return noticeCode ? (
    <p
      role="alert"
      data-mutation-scope-notice={noticeCode}
      className="fixed inset-x-3 bottom-3 z-toast rounded-md border border-danger-border bg-surface px-4 py-3 text-body-sm text-text shadow-overlay sm:right-4 sm:left-auto sm:max-w-sm"
    >
      {NOTICE_COPY[locale][noticeCode]}
    </p>
  ) : null;
}

const NO_OWNER = createValueStore<string | null>(null);
const NO_NOTICE = createValueStore<MutationScopeCode | null>(null);

export function useOptionalOwnerScope(): OwnerScopeContextValue | null {
  const scope = useContext(OwnerScopeContext);
  const ownerUserId = useValueStore(scope?.owner ?? NO_OWNER);
  const noticeCode = useValueStore(scope?.notice ?? NO_NOTICE);

  return useMemo(
    () =>
      scope
        ? {
            ownerUserId,
            noticeCode,
            // Read when the request is made, not when this rendered.
            headers: () => ownerScopeHeaders(scope.owner.get()),
            handleResponse: scope.handleResponse,
            handleActionResult: scope.handleActionResult,
          }
        : null,
    [noticeCode, ownerUserId, scope],
  );
}

export function useOwnerScope(): OwnerScopeContextValue {
  const value = useOptionalOwnerScope();
  if (!value) {
    throw new Error("Owner scope requires the site shell.");
  }
  return value;
}

/**
 * Names the owner after the document has been served. A static document is
 * rendered before anybody knows who is reading it; the shell calls this once
 * the session settles. Nothing above the caller renders again.
 */
export function useOwnerScopeControl(): (ownerUserId: string | null) => void {
  const scope = useContext(OwnerScopeContext);
  return useMemo(
    () => (ownerUserId: string | null) => scope?.owner.set(ownerUserId),
    [scope],
  );
}

/** Hidden field for native and Server Action forms rendered for an owner. */
export function OwnerUserIdField() {
  const ownerUserId = useOptionalOwnerScope()?.ownerUserId ?? null;
  if (!ownerUserId) return null;
  return <HiddenField name={OWNER_USER_ID_FORM_FIELD} value={ownerUserId} />;
}

/**
 * A Server Action form that carries the rendered owner id and surfaces a
 * session refusal (`{ mutationScope: code }`) without discarding the form.
 *
 * There used to be two of these. `OwnerScopedActionForm` took a `(formData)`
 * action and adapted it inside a client closure — and React gives a `<form>` a
 * real endpoint only from a Server Action reference, or from the `formAction`
 * `useActionState` derives from one. A closure got
 * `action="javascript:throw new Error('React form unexpectedly submitted.')"`,
 * a placeholder React replaces on hydration and never before, so thirty-three
 * owner controls across seventeen files silently did nothing until the bundle
 * ran. Slice 28 converted all of them, `OVE-459` the last, and **the closure
 * form is deleted** rather than left standing with a warning on it: a shape
 * that cannot be imported cannot be reached for again (ADR-0024 D3,
 * ADR-0026 D10).
 */
export function OwnerScopedProgressiveForm({
  action,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & {
  action: (previousState: unknown, formData: FormData) => Promise<unknown>;
}) {
  const ownerScope = useOptionalOwnerScope();
  const handledStateRef = useRef<unknown>(undefined);
  const [state, formAction] = useActionState<unknown, FormData>(
    action,
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
