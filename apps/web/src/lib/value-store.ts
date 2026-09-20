import { useSyncExternalStore } from "react";

/**
 * One value that changes outside React's tree, for `useSyncExternalStore`.
 *
 * It exists because of what a changing **context** costs above a page
 * (ADR-0032 D10). React cannot look inside a Suspense boundary it has not
 * hydrated yet, so when a provider above one changes its value React assumes
 * the boundary reads it — and if the boundary's content has not been revealed
 * yet, React gives up on the served HTML and renders the boundary on the
 * client. The streamed segment is thrown away when it arrives. A transition
 * does not prevent it; nothing does, short of the value not being a context.
 *
 * A store is the other shape: the provider hands down *this object*, which
 * never changes, and only the components that subscribe render again.
 */
export interface ValueStore<T> {
  /** What the server rendered with, and what hydration must agree with. */
  readonly initial: T;
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    initial,
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      // A copy: a listener may unsubscribe — or subscribe another — as it runs.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The store's value, in a client component. The hydrating render reads
 * `initial` — what the server drew — and the component renders again by itself
 * if the value has moved on since.
 */
export function useValueStore<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.initial);
}
