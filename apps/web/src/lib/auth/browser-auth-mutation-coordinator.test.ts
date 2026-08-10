import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSessionInvalidationMarkerIfCurrent,
  commitLocalExitInvalidationMarker,
  readSessionInvalidationMarker,
} from "./session-invalidation-marker";
import {
  BROWSER_AUTH_MUTATION_LOCK_NAME,
  runBrowserAuthMutation,
} from "./browser-auth-mutation-coordinator";

describe("browser auth mutation coordinator", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", { localStorage: new TestStorage() });
    vi.stubGlobal("navigator", {});
  });

  it("serializes fallback mutations in one document", async () => {
    const first = deferred<string>();
    const order: string[] = [];
    const firstRun = runBrowserAuthMutation({
      kind: "account_mutation",
      operation: async () => {
        order.push("first:start");
        const value = await first.promise;
        order.push("first:end");
        return value;
      },
    });
    const secondRun = runBrowserAuthMutation({
      kind: "account_mutation",
      operation: async () => {
        order.push("second");
        return "second";
      },
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    first.resolve("first");

    await expect(firstRun).resolves.toEqual({
      status: "completed",
      value: "first",
    });
    await expect(secondRun).resolves.toEqual({
      status: "completed",
      value: "second",
    });
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("rejects an account mutation while local exit is terminal", async () => {
    commitLocalExitInvalidationMarker();
    const operation = vi.fn(async () => "must-not-run");

    await expect(
      runBrowserAuthMutation({ kind: "account_mutation", operation }),
    ).resolves.toEqual({ status: "stale_operation" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("marks an in-flight account mutation stale when local exit commits", async () => {
    const pending = deferred<string>();
    const run = runBrowserAuthMutation({
      kind: "account_mutation",
      operation: () => pending.promise,
    });
    await Promise.resolve();

    commitLocalExitInvalidationMarker();
    pending.resolve("late-account-a-result");

    await expect(run).resolves.toEqual({ status: "stale_operation" });
    expect(readSessionInvalidationMarker().kind).toBe("local_exit");
  });

  it("compare-clears a captured marker only after authoritative session establishment", async () => {
    const marker = commitLocalExitInvalidationMarker().marker;

    await expect(
      runBrowserAuthMutation({
        kind: "session_establishment",
        operation: async () => ({ error: null }),
        confirmsAuthoritativeSession: async () => true,
      }),
    ).resolves.toEqual({
      status: "completed",
      value: { error: null },
    });
    expect(marker.kind).toBe("local_exit");
    expect(readSessionInvalidationMarker().status).toBe("absent");
  });

  it("retains the marker when session establishment is not authoritative", async () => {
    commitLocalExitInvalidationMarker();

    await expect(
      runBrowserAuthMutation({
        kind: "session_establishment",
        operation: async () => ({ error: { code: "DENIED" } }),
        confirmsAuthoritativeSession: async () => false,
      }),
    ).resolves.toEqual({ status: "stale_operation" });
    expect(readSessionInvalidationMarker().kind).toBe("local_exit");
  });

  it("lets a newer marker generation win over a delayed exit response", async () => {
    const markerA = commitLocalExitInvalidationMarker().marker;
    const response = deferred<Response>();
    const run = runBrowserAuthMutation({
      kind: "session_exit",
      localExitMarker: markerA,
      operation: () => response.promise,
    });
    await Promise.resolve();

    expect(clearSessionInvalidationMarkerIfCurrent(markerA)).toBe("cleared");
    const markerB = commitLocalExitInvalidationMarker().marker;
    response.resolve(new Response(null, { status: 204 }));

    await expect(run).resolves.toEqual({ status: "stale_operation" });
    expect(markerB.kind).toBe("local_exit");
    expect(readSessionInvalidationMarker().kind).toBe("local_exit");
  });

  it("uses the cross-document Web Lock when the browser provides it", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>,
      ) => callback(),
    );
    vi.stubGlobal("navigator", { locks: { request } });

    await runBrowserAuthMutation({
      kind: "account_mutation",
      operation: async () => "done",
    });

    expect(request).toHaveBeenCalledWith(
      BROWSER_AUTH_MUTATION_LOCK_NAME,
      { mode: "exclusive" },
      expect.any(Function),
    );
  });
});

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
