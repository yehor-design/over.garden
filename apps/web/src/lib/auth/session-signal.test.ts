import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_SIGNAL_TAB_ID,
  announceSessionSignal,
  ownerScopeHeaders,
  readRenderedOwnerUserId,
  subscribeSessionSignals,
} from "./session-signal";

type Listener = (event: {
  key: string | null;
  newValue: string | null;
}) => void;

function fakeWindow() {
  const store = new Map<string, string>();
  const storageListeners = new Set<Listener>();
  const window = {
    localStorage: {
      setItem: (key: string, value: string) => store.set(key, value),
      getItem: (key: string) => store.get(key) ?? null,
    },
    addEventListener: (type: string, listener: Listener) => {
      if (type === "storage") storageListeners.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === "storage") storageListeners.delete(listener);
    },
  };
  return {
    window,
    store,
    emitStorage(key: string, newValue: string) {
      for (const listener of storageListeners) listener({ key, newValue });
    },
    listenerCount: () => storageListeners.size,
  };
}

describe("session signal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the rendered owner id from the document and turns it into a header", () => {
    vi.stubGlobal("document", {
      querySelector: (selector: string) =>
        selector === "[data-owner-user-id]"
          ? {
              getAttribute: (name: string) =>
                name === "data-owner-user-id" ? " owner-a " : null,
            }
          : null,
    });
    expect(readRenderedOwnerUserId()).toBe("owner-a");
    expect(ownerScopeHeaders()).toEqual({
      "x-overgarden-owner-user-id": "owner-a",
    });
    expect(ownerScopeHeaders(null)).toEqual({});
  });

  it("delivers another tab's signal through the storage fallback and ignores its own", () => {
    const host = fakeWindow();
    vi.stubGlobal("window", host.window);
    vi.stubGlobal("BroadcastChannel", undefined);
    const received: unknown[] = [];
    const stop = subscribeSessionSignals((signal) => received.push(signal));

    announceSessionSignal({ type: "signed_out", ownerUserId: null });
    const written = JSON.parse(
      host.store.get("overgarden-session-signal") ?? "{}",
    ) as { sourceTabId?: string };
    expect(written.sourceTabId).toBe(SESSION_SIGNAL_TAB_ID);
    host.emitStorage("overgarden-session-signal", JSON.stringify(written));
    expect(received).toEqual([]);

    host.emitStorage(
      "overgarden-session-signal",
      JSON.stringify({
        type: "signed_in",
        ownerUserId: "owner-b",
        sourceTabId: "other-tab",
        at: 1,
      }),
    );
    host.emitStorage("overgarden-session-signal", "not json");
    host.emitStorage("unrelated", "{}");
    expect(received).toEqual([
      { type: "signed_in", ownerUserId: "owner-b", sourceTabId: "other-tab" },
    ]);

    stop();
    expect(host.listenerCount()).toBe(0);
  });
});
