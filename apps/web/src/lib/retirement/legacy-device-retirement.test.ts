import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getUnresolvedAuthorizationServeCounts,
  resetUnresolvedAuthorizationServeCountsForTests,
} from "@/lib/auth/unresolved-authorization";

import { KnownClientStorageError } from "./known-client-storage";
import {
  createLegacyDeviceRetirementController,
  LEGACY_RETIREMENT_DEADLINE_MS,
  type LegacyDeviceRetirementPort,
} from "./legacy-device-retirement";

describe("legacy device retirement controller", () => {
  beforeEach(() => resetUnresolvedAuthorizationServeCountsForTests());

  it("silently confirms exact-name retirement with two absence reads", async () => {
    const port = mockPort();
    const controller = createLegacyDeviceRetirementController({ port });

    await controller.inspect();

    expect(controller.getSnapshot()).toEqual({
      state: "absent",
      visible: false,
      absenceReads: 2,
      deletedDatabaseCount: 3,
      unregisteredWorkerCount: 1,
      unresolvedBindingCount: 0,
      unresolvedClass: null,
      errorCode: null,
      lastAction: null,
    });
    expect(port.retire).toHaveBeenCalledOnce();
    expect(port.retire).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("retains unresolved owner storage while serving with a counted ownership class", async () => {
    const port = mockPort({
      status: "unresolved_retained",
      unresolvedBindingCount: 2,
      deletedDatabaseCount: 1,
      unregisteredWorkerCount: 0,
    });
    const controller = createLegacyDeviceRetirementController({ port });

    await controller.inspect();

    expect(controller.getSnapshot()).toEqual({
      state: "served_unresolved",
      visible: true,
      absenceReads: 2,
      deletedDatabaseCount: 1,
      unregisteredWorkerCount: 0,
      unresolvedBindingCount: 2,
      unresolvedClass: "ownership_unresolved",
      errorCode: null,
      lastAction: null,
    });
    expect(getUnresolvedAuthorizationServeCounts()).toEqual([
      {
        owner: "legacy_device_retirement",
        unresolvedClass: "ownership_unresolved",
        count: 1,
      },
    ]);
    expect(JSON.stringify(controller.getSnapshot())).not.toMatch(
      /payload|title|body|email|userId|ownerUserId/i,
    );
  });

  it("maps exact retirement failures and retries with one in-flight operation", async () => {
    const first = deferred<never>();
    const port = mockPort();
    port.retire
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(receipt());
    const controller = createLegacyDeviceRetirementController({ port });

    const inspection = controller.inspect();
    const duplicate = controller.retry();
    expect(port.retire).toHaveBeenCalledTimes(1);
    first.reject(new KnownClientStorageError("indexeddb_delete_blocked"));
    await Promise.all([inspection, duplicate]);
    expect(controller.getSnapshot()).toMatchObject({
      state: "deletion_blocked",
      visible: true,
      errorCode: "indexeddb_delete_blocked",
    });

    await controller.retry();

    expect(port.retire).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      state: "absent",
      visible: false,
      absenceReads: 2,
      errorCode: null,
    });
  });

  it("aborts the exact attempt at the global three-second deadline", async () => {
    vi.useFakeTimers();
    try {
      let observedAbort = false;
      const port = mockPort();
      port.retire.mockImplementation(
        (signal: AbortSignal) =>
          new Promise<ReturnType<typeof receipt>>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                observedAbort = true;
                resolve(receipt());
              },
              { once: true },
            );
          }),
      );
      const controller = createLegacyDeviceRetirementController({ port });

      const inspection = controller.inspect();
      await vi.advanceTimersByTimeAsync(LEGACY_RETIREMENT_DEADLINE_MS);
      await inspection;

      expect(observedAbort).toBe(true);
      expect(controller.getSnapshot()).toMatchObject({
        state: "deletion_blocked",
        visible: true,
        errorCode: "client_retirement_timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes cancellation synchronous and ignores a late successful result", async () => {
    const pending = deferred<ReturnType<typeof receipt>>();
    const port = mockPort();
    port.retire.mockReturnValue(pending.promise);
    const controller = createLegacyDeviceRetirementController({ port });

    const inspection = controller.inspect();
    expect(controller.getSnapshot().state).toBe("deleting");
    controller.cancel();
    expect(controller.getSnapshot()).toMatchObject({
      state: "deletion_blocked",
      visible: true,
      errorCode: "client_retirement_cancelled",
      lastAction: "cancelled",
    });

    pending.resolve(receipt());
    await inspection;
    expect(controller.getSnapshot()).toMatchObject({
      state: "deletion_blocked",
      errorCode: "client_retirement_cancelled",
      lastAction: "cancelled",
    });
  });

  it("normalizes unexpected failures without revealing exception content", async () => {
    const port = mockPort();
    port.retire.mockRejectedValue(
      new Error("private title and user@example.invalid"),
    );
    const controller = createLegacyDeviceRetirementController({ port });

    await controller.inspect();

    expect(controller.getSnapshot()).toMatchObject({
      state: "deletion_blocked",
      errorCode: "client_retirement_unavailable",
    });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("private");
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("@example");
  });
});

function receipt(
  overrides: Partial<{
    status: "absent" | "unresolved_retained";
    deletedDatabaseCount: number;
    unregisteredWorkerCount: number;
    unresolvedBindingCount: number;
  }> = {},
) {
  return {
    status: "absent" as const,
    absenceReads: 2 as const,
    deletedDatabaseCount: 3,
    unregisteredWorkerCount: 1,
    unresolvedBindingCount: 0,
    ...overrides,
  };
}

function mockPort(overrides: Parameters<typeof receipt>[0] = {}) {
  return {
    retire: vi.fn(async (signal: AbortSignal) => {
      void signal;
      return receipt(overrides);
    }),
  } satisfies LegacyDeviceRetirementPort;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
