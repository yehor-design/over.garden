"use client";

import {
  clearSessionInvalidationMarkerIfCurrent,
  readSessionInvalidationMarker,
  type SessionInvalidationMarkerRead,
} from "./session-invalidation-marker";

export const BROWSER_AUTH_MUTATION_LOCK_NAME =
  "overgarden:browser-auth-mutation:v1";

type SessionEstablishmentOptions<T> = {
  readonly kind: "session_establishment";
  readonly operation: () => Promise<T>;
  readonly confirmsAuthoritativeSession: (value: T) => Promise<boolean>;
};

type AccountMutationOptions<T> = {
  readonly kind: "account_mutation";
  readonly operation: () => Promise<T>;
};

type SessionExitOptions<T> = {
  readonly kind: "session_exit";
  readonly localExitMarker?: SessionInvalidationMarkerRead;
  readonly operation: () => Promise<T>;
};

export type BrowserAuthMutationOptions<T> =
  | SessionEstablishmentOptions<T>
  | AccountMutationOptions<T>
  | SessionExitOptions<T>;

export type BrowserAuthMutationResult<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "stale_operation" };

let inDocumentMutationTail: Promise<void> = Promise.resolve();

/**
 * The only product-owned browser serialization boundary for session
 * establishment, account-method mutation, and exact current-session exit.
 * Web Locks provide cross-tab ordering; the promise tail preserves the same
 * contract in browsers without that optional API.
 */
export function runBrowserAuthMutation<T>(
  options: BrowserAuthMutationOptions<T>,
): Promise<BrowserAuthMutationResult<T>> {
  return withBrowserAuthMutationLock(() => executeMutation(options));
}

async function executeMutation<T>(
  options: BrowserAuthMutationOptions<T>,
): Promise<BrowserAuthMutationResult<T>> {
  if (options.kind === "session_exit") {
    if (!options.localExitMarker) {
      const capturedMarker = readSessionInvalidationMarker();
      if (isTerminalMarker(capturedMarker)) {
        return { status: "stale_operation" };
      }
      const value = await options.operation();
      return isTerminalMarker(readSessionInvalidationMarker())
        ? { status: "stale_operation" }
        : { status: "completed", value };
    }
    if (options.localExitMarker.kind !== "local_exit") {
      return { status: "stale_operation" };
    }
    const value = await options.operation();
    const clearResult = clearSessionInvalidationMarkerIfCurrent(
      options.localExitMarker,
    );
    return clearResult === "cleared" || clearResult === "absent"
      ? { status: "completed", value }
      : { status: "stale_operation" };
  }

  const capturedMarker = readSessionInvalidationMarker();
  if (
    isTerminalMarker(capturedMarker) &&
    !(
      options.kind === "session_establishment" &&
      capturedMarker.kind === "local_exit"
    )
  ) {
    return { status: "stale_operation" };
  }

  const value = await options.operation();

  if (
    options.kind === "session_establishment" &&
    capturedMarker.kind === "local_exit"
  ) {
    if (!(await options.confirmsAuthoritativeSession(value))) {
      return { status: "stale_operation" };
    }
    const clearResult = clearSessionInvalidationMarkerIfCurrent(capturedMarker);
    return clearResult === "cleared" || clearResult === "absent"
      ? { status: "completed", value }
      : { status: "stale_operation" };
  }

  return isTerminalMarker(readSessionInvalidationMarker())
    ? { status: "stale_operation" }
    : { status: "completed", value };
}

function isTerminalMarker(marker: SessionInvalidationMarkerRead) {
  return marker.status === "present" || marker.status === "unknown";
}

function withBrowserAuthMutationLock<T>(task: () => Promise<T>): Promise<T> {
  const browserLocks =
    typeof navigator === "undefined"
      ? undefined
      : (
          navigator as Navigator & {
            locks?: {
              request<T>(
                name: string,
                options: { mode: "exclusive" },
                callback: () => T | PromiseLike<T>,
              ): Promise<T>;
            };
          }
        ).locks;

  if (browserLocks?.request) {
    return browserLocks.request<T>(
      BROWSER_AUTH_MUTATION_LOCK_NAME,
      { mode: "exclusive" },
      task,
    );
  }

  const run = inDocumentMutationTail.then(task, task);
  inDocumentMutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
