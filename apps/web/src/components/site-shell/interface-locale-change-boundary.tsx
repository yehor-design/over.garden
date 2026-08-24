"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect } from "react";

import {
  interfaceLocaleChangeCoordinator,
  type InterfaceLocaleChangeCoordinator,
} from "@/lib/interface-locale-change-coordinator";
import { getInterfaceRoutePolicy } from "@/lib/interface-route-policy";

const STATIC_FORM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,96}$/;

const InterfaceLocaleChangeBoundaryContext = createContext(true);

export function InterfaceLocaleChangeBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const enabled = getInterfaceRoutePolicy(pathname).mode !== "non-ui";

  useEffect(() => {
    if (!enabled) return;

    const stopObservingForms = observeInterfaceLocaleChangeForms(
      document,
      interfaceLocaleChangeCoordinator,
    );
    const stopObservingNetworkMutations =
      typeof window === "undefined"
        ? () => undefined
        : observeInterfaceLocaleChangeNetworkMutations(
            window,
            interfaceLocaleChangeCoordinator,
          );
    return () => {
      stopObservingNetworkMutations();
      stopObservingForms();
    };
  }, [enabled]);

  return (
    <InterfaceLocaleChangeBoundaryContext.Provider value={enabled}>
      {children}
    </InterfaceLocaleChangeBoundaryContext.Provider>
  );
}

/**
 * Explicit state hook for bounded client forms. It intentionally accepts only
 * booleans and a static developer id, never field values or mutation payloads.
 */
export function useInterfaceLocaleChangeFormState({
  id,
  dirty,
  pending,
  revision = 0,
}: {
  id: string;
  dirty: boolean;
  pending: boolean;
  /** Payload-free edit epoch for an already-dirty surface. */
  revision?: number;
}) {
  const boundaryEnabled = useContext(InterfaceLocaleChangeBoundaryContext);

  useEffect(() => {
    if (!boundaryEnabled) return;

    if (pending) {
      return interfaceLocaleChangeCoordinator.register({
        id,
        kind: "in-flight",
      });
    }
    if (dirty) {
      return interfaceLocaleChangeCoordinator.register({
        id,
        kind: "dirty-confirmation",
        // Confirmation authorizes the impending full-document replacement.
        // Keep React state intact so a failed locale request loses no input.
        discard: async () => undefined,
      });
    }
    return interfaceLocaleChangeCoordinator.register({ id, kind: "clean" });
  }, [boundaryEnabled, dirty, id, pending, revision]);
}

/**
 * Conservative DOM fallback for forms that have not adopted the explicit
 * hook. Only element identity and lifecycle events are retained. Search/filter
 * GET forms and owner-composer forms are intentionally outside this registry.
 */
export function observeInterfaceLocaleChangeForms(
  root: Pick<Document, "addEventListener" | "removeEventListener">,
  coordinator: InterfaceLocaleChangeCoordinator,
) {
  const dirtyForms = new Map<object, () => void>();
  const pendingForms = new Map<object, { unregister(): void }>();
  const generatedIds = new WeakMap<object, string>();
  let generatedId = 0;

  const formId = (form: FormLike) => {
    const explicitId =
      form.getAttribute?.("data-interface-locale-form-id") ?? form.id ?? "";
    if (STATIC_FORM_ID.test(explicitId)) return `dom-form:${explicitId}`;

    const key = form as object;
    const existing = generatedIds.get(key);
    if (existing) return existing;
    generatedId += 1;
    const id = `dom-form:element-${generatedId}`;
    generatedIds.set(key, id);
    return id;
  };

  const clearDirty = (form: FormLike) => {
    dirtyForms.get(form as object)?.();
    dirtyForms.delete(form as object);
  };
  const clearPending = (form: FormLike) => {
    const pending = pendingForms.get(form as object);
    if (!pending) return;
    pending.unregister();
    pendingForms.delete(form as object);
  };

  const markDirty = (form: FormLike) => {
    if (shouldIgnoreForm(form)) return;
    // Every edit is a new payload-free epoch. A confirmation granted for an
    // older edit must never authorize discarding a later keystroke.
    dirtyForms.get(form as object)?.();
    const unregister = coordinator.register({
      id: formId(form),
      kind: "dirty-confirmation",
      // Do not reset or inspect fields. The document replacement is the discard
      // boundary; staying after a request failure must preserve every value.
      discard: async () => undefined,
    });
    dirtyForms.set(form as object, unregister);
  };

  const markPending = (form: FormLike) => {
    if (pendingForms.has(form as object) || shouldIgnoreForm(form)) return;
    const unregister = coordinator.register({
      id: `${formId(form)}:submit`,
      kind: "in-flight",
    });
    pendingForms.set(form as object, { unregister });
  };

  const onInput = (event: Event) => {
    const form = eventForm(event);
    if (form) markDirty(form);
  };
  const onReset = (event: Event) => {
    const form = eventForm(event);
    if (!form) return;
    // This observer runs in capture phase. A form-owned reset handler may still
    // cancel the reset later in propagation, so settle only after that decision.
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      clearDirty(form);
      clearPending(form);
    });
  };
  const onSubmit = (event: Event) => {
    const form = eventForm(event);
    if (!form) return;
    // React/Next client actions prevent the native navigation later in event
    // propagation. Their exact request lifetime is covered by the fetch
    // observer or an explicit boolean hook, so do not leave a stale DOM fence.
    queueMicrotask(() => {
      if (!event.defaultPrevented) markPending(form);
    });
  };

  root.addEventListener("input", onInput, true);
  root.addEventListener("change", onInput, true);
  root.addEventListener("reset", onReset, true);
  root.addEventListener("submit", onSubmit, true);

  return () => {
    root.removeEventListener("input", onInput, true);
    root.removeEventListener("change", onInput, true);
    root.removeEventListener("reset", onReset, true);
    root.removeEventListener("submit", onSubmit, true);
    for (const unregister of dirtyForms.values()) unregister();
    for (const pending of pendingForms.values()) {
      pending.unregister();
    }
    dirtyForms.clear();
    pendingForms.clear();
  };
}

/**
 * Payload-blind exact settlement fence for browser mutations. Only method and
 * the locale endpoint pathname are inspected; bodies, queries, headers, and
 * response content never enter coordinator state.
 */
export function observeInterfaceLocaleChangeNetworkMutations(
  browser: Pick<Window, "fetch" | "location">,
  coordinator: InterfaceLocaleChangeCoordinator,
) {
  const originalFetch = browser.fetch;
  let mutationSequence = 0;
  const observedFetch: typeof fetch = async (input, init) => {
    const method = requestMethod(input, init);
    if (
      method === "GET" ||
      method === "HEAD" ||
      (method === "POST" &&
        isInterfaceLocalePreferenceRequest(input, browser.location.origin))
    ) {
      return originalFetch.call(browser, input, init);
    }

    mutationSequence += 1;
    const unregister = coordinator.register({
      id: `network-mutation:${mutationSequence}`,
      kind: "in-flight",
    });
    try {
      return await originalFetch.call(browser, input, init);
    } finally {
      unregister();
    }
  };
  browser.fetch = observedFetch;

  return () => {
    if (browser.fetch === observedFetch) browser.fetch = originalFetch;
  };
}

interface FormLike {
  id?: string;
  getAttribute?(name: string): string | null;
  matches?(selector: string): boolean;
  querySelector?(selector: string): unknown;
  closest?(selector: string): FormLike | null;
}

function eventForm(event: Event): FormLike | null {
  const target = event.target as FormLike | null;
  if (!target) return null;
  if (target.matches?.("form")) return target;
  return target.closest?.("form") ?? null;
}

function shouldIgnoreForm(form: FormLike) {
  if (
    form.matches?.(
      '[data-interface-locale-form="ignore"], [data-interface-locale-form="safe-flush"], [data-interface-locale-form="explicit"]',
    )
  ) {
    return true;
  }
  if (
    form.querySelector?.(
      "#first-entry-body, #follow-up-entry-body, [data-interface-locale-safe-flush]",
    )
  ) {
    return true;
  }

  return form.getAttribute?.("method")?.toLowerCase() === "get";
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const method =
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request
      ? input.method
      : "GET");
  return method.toUpperCase();
}

function isInterfaceLocalePreferenceRequest(
  input: RequestInfo | URL,
  currentOrigin: string,
) {
  try {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(rawUrl, currentOrigin);
    return (
      url.origin === currentOrigin &&
      url.pathname === "/api/interface/locale" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}
