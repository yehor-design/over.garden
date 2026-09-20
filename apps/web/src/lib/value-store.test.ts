import { describe, expect, it, vi } from "vitest";

import { createValueStore } from "./value-store";

describe("createValueStore (ADR-0032 D10)", () => {
  it("keeps what the server rendered with apart from what it holds now", () => {
    const store = createValueStore<string | null>(null);
    store.set("/journals");

    expect(store.get()).toBe("/journals");
    // Hydration has to agree with the served HTML, whatever has happened since.
    expect(store.initial).toBeNull();
  });

  it("tells its subscribers once per change, and not at all for the same value", () => {
    const store = createValueStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    store.set(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives a listener that unsubscribes while it is being told", () => {
    const store = createValueStore(0);
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);

    store.set(1);
    store.set(2);

    expect(second).toHaveBeenCalledTimes(2);
  });
});
