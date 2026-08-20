import { describe, expect, it, vi } from "vitest";

import {
  createLegacyDeviceRetirementController,
  LEGACY_RETIREMENT_BATCH_SIZE,
  LegacyRetirementPortError,
  type LegacyDeviceRetirementPort,
  type LegacyRetirementIdentity,
  type LegacyRetirementInventory,
  type LegacyRetirementItem,
} from "./legacy-device-retirement";

const IDENTITY: LegacyRetirementIdentity = {
  ownerUserId: "00000000-0000-4000-8000-000000000322",
  ownerVaultBinding: "B".repeat(43),
  sessionGeneration: "S".repeat(43),
  documentMutationGeneration: "signed-document-generation",
};

describe("legacy device retirement controller", () => {
  it("silently completes an empty current-owner inventory after exact cleanup", async () => {
    const port = mockPort({ items: [] });
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });

    await controller.inspect();

    expect(controller.getSnapshot()).toMatchObject({
      state: "completed",
      visible: false,
      counts: { total: 0 },
      absenceReads: 2,
    });
    expect(port.finalize).toHaveBeenCalledOnce();
    expect(port.transferAndVerify).not.toHaveBeenCalled();
  });

  it("verifies every current-owner item before deleting one bounded batch", async () => {
    const items = [item("draft-1", "draft", 2), item("mutation-1", "mutation")];
    const port = mockPort({ items });
    const order: string[] = [];
    port.transferAndVerify.mockImplementation(async (candidate) => {
      order.push(`verify:${candidate.token}`);
      return { status: "verified" };
    });
    port.deleteVerifiedBatch.mockImplementation(
      async (batch: LegacyRetirementItem[]) => {
        order.push(`delete:${batch.map(({ token }) => token).join(",")}`);
      },
    );
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });

    await controller.inspect();
    expect(controller.getSnapshot()).toMatchObject({
      state: "offered",
      visible: true,
      counts: { drafts: 1, mutations: 1, mediaIntents: 2, total: 2 },
    });
    await controller.transfer();

    expect(order).toEqual([
      "verify:draft-1",
      "verify:mutation-1",
      "delete:draft-1,mutation-1",
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      state: "completed",
      progress: { verified: 2, deleted: 2, total: 2 },
      absenceReads: 2,
    });
  });

  it("never exceeds 200 items per delete batch or one in-flight transfer", async () => {
    const items = Array.from({ length: 201 }, (_, index) =>
      item(`draft-${index}`, "draft"),
    );
    const port = mockPort({ items });
    let inFlight = 0;
    let peakInFlight = 0;
    port.transferAndVerify.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { status: "verified" };
    });
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });

    await controller.inspect();
    await controller.transfer();

    expect(LEGACY_RETIREMENT_BATCH_SIZE).toBe(200);
    expect(peakInFlight).toBe(1);
    expect(
      port.deleteVerifiedBatch.mock.calls.map(([batch]) => batch.length),
    ).toEqual([200, 1]);
  });

  it("retries only the unresolved tail after a completed delete batch", async () => {
    const items = Array.from({ length: 201 }, (_, index) =>
      item(`draft-${index}`, "draft"),
    );
    const port = mockPort({ items });
    let tailAttempts = 0;
    port.transferAndVerify.mockImplementation(async (candidate) => {
      if (candidate.token === "draft-200" && tailAttempts++ === 0) {
        throw new LegacyRetirementPortError(
          "failed_retryable",
          "server_timeout",
        );
      }
      return { status: "verified" };
    });
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });

    await controller.inspect();
    await controller.transfer();
    expect(controller.getSnapshot()).toMatchObject({
      state: "failed_retryable",
      progress: { verified: 200, deleted: 200, total: 201 },
    });

    await controller.retry();

    expect(
      port.transferAndVerify.mock.calls.filter(
        ([candidate]) => candidate.token === "draft-0",
      ),
    ).toHaveLength(1);
    expect(
      port.transferAndVerify.mock.calls.filter(
        ([candidate]) => candidate.token === "draft-200",
      ),
    ).toHaveLength(2);
    expect(controller.getSnapshot()).toMatchObject({
      state: "completed",
      progress: { verified: 201, deleted: 201, total: 201 },
      absenceReads: 2,
    });
  });

  it("makes cancel observable synchronously and ignores a late verified result", async () => {
    const pending = deferred<{ status: "verified" }>();
    const port = mockPort({ items: [item("draft-1", "draft")] });
    port.transferAndVerify.mockReturnValue(pending.promise);
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });
    await controller.inspect();

    const transfer = controller.transfer();
    expect(controller.getSnapshot().state).toBe("transferring");
    controller.cancel();
    expect(controller.getSnapshot()).toMatchObject({
      state: "offered",
      lastAction: "cancelled",
    });

    pending.resolve({ status: "verified" });
    await transfer;
    expect(port.deleteVerifiedBatch).not.toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe("offered");
  });

  it("retains the source and exposes only typed conflict timestamps", async () => {
    const port = mockPort({ items: [item("draft-1", "draft")] });
    port.transferAndVerify.mockResolvedValue({
      status: "divergent_copy",
      deviceUpdatedAt: 1_786_381_200_000,
      serverUpdatedAt: 1_786_381_100_000,
    });
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });
    await controller.inspect();

    await controller.transfer();

    expect(controller.getSnapshot()).toMatchObject({
      state: "divergent_copy",
      divergence: {
        itemKind: "draft",
        deviceUpdatedAt: 1_786_381_200_000,
        serverUpdatedAt: 1_786_381_100_000,
      },
    });
    expect(port.deleteVerifiedBatch).not.toHaveBeenCalled();
    expect(JSON.stringify(controller.getSnapshot())).not.toMatch(
      /ownerUserId|ownerVaultBinding|private|payload|title|body/,
    );
  });

  it("stops closed when the authoritative session changes", async () => {
    const port = mockPort({ items: [item("mutation-1", "mutation")] });
    port.assertSession.mockResolvedValue(false);
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });
    await controller.inspect();

    await controller.transfer();

    expect(controller.getSnapshot().state).toBe("session_changed");
    expect(port.transferAndVerify).not.toHaveBeenCalled();
    expect(port.deleteVerifiedBatch).not.toHaveBeenCalled();
  });

  it("requires two explicit discard confirmations for the exact aggregate", async () => {
    const items = [
      item("draft-1", "draft"),
      item("mutation-1", "synced_receipt"),
    ];
    const port = mockPort({ items });
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });
    await controller.inspect();

    controller.requestDiscard();
    expect(controller.getSnapshot()).toMatchObject({
      state: "discard_confirmation",
      discardConfirmationStep: 1,
      counts: { drafts: 1, syncedReceipts: 1, total: 2 },
    });
    await controller.confirmDiscard();
    expect(controller.getSnapshot().discardConfirmationStep).toBe(2);
    expect(port.discardCurrentOwner).not.toHaveBeenCalled();
    await controller.confirmDiscard();

    expect(port.discardCurrentOwner).toHaveBeenCalledWith(
      items,
      IDENTITY,
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot().state).toBe("completed");
  });

  it("maps bounded and foreign residue classes without revealing another identity", async () => {
    const boundedPort = mockPort({ items: [], bounded: true });
    const bounded = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port: boundedPort,
    });
    await bounded.inspect();
    expect(bounded.getSnapshot()).toMatchObject({
      state: "bounded_inventory",
      visible: true,
    });

    const foreignPort = mockPort({
      items: [],
      foreignBindingCount: 1,
      foreignOwnerResidueCount: 3,
    });
    const foreign = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port: foreignPort,
    });
    await foreign.inspect();
    expect(foreign.getSnapshot()).toMatchObject({
      state: "foreign_or_orphan_retained",
      visible: true,
      foreignResidue: { bindings: 1, sharedRows: 3 },
    });
    expect(JSON.stringify(foreign.getSnapshot())).not.toContain(
      IDENTITY.ownerUserId,
    );
  });

  it("maps typed retryable failures and never deletes an unverified source", async () => {
    const port = mockPort({ items: [item("mutation-1", "mutation")] });
    port.transferAndVerify.mockRejectedValue(
      new LegacyRetirementPortError("failed_retryable", "server_timeout"),
    );
    const controller = createLegacyDeviceRetirementController({
      identity: IDENTITY,
      port,
    });
    await controller.inspect();

    await controller.transfer();

    expect(controller.getSnapshot()).toMatchObject({
      state: "failed_retryable",
      errorCode: "server_timeout",
    });
    expect(port.deleteVerifiedBatch).not.toHaveBeenCalled();
  });

  it("aborts the exact network attempt at the bounded deadline", async () => {
    vi.useFakeTimers();
    try {
      let observedAbort = false;
      const port = mockPort({ items: [item("mutation-1", "mutation")] });
      port.transferAndVerify.mockImplementation(
        async (_item, _identity, signal) =>
          new Promise<{ status: "verified" }>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                observedAbort = true;
                resolve({ status: "verified" });
              },
              { once: true },
            );
          }),
      );
      const controller = createLegacyDeviceRetirementController({
        identity: IDENTITY,
        port,
        networkDeadlineMs: 5,
      });
      await controller.inspect();

      const transfer = controller.transfer();
      await vi.advanceTimersByTimeAsync(6);
      await transfer;

      expect(observedAbort).toBe(true);
      expect(controller.getSnapshot()).toMatchObject({
        state: "failed_retryable",
        errorCode: "operation_timeout",
      });
      expect(port.deleteVerifiedBatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

function item(
  token: string,
  kind: LegacyRetirementItem["kind"],
  mediaIntentCount = 0,
): LegacyRetirementItem {
  return { token, kind, mediaIntentCount, updatedAt: 1_786_381_200_000 };
}

function mockPort(
  inventory: Partial<LegacyRetirementInventory> & {
    items: LegacyRetirementItem[];
  },
) {
  const normalized: LegacyRetirementInventory = {
    items: inventory.items,
    bounded: inventory.bounded ?? false,
    foreignBindingCount: inventory.foreignBindingCount ?? 0,
    foreignOwnerResidueCount: inventory.foreignOwnerResidueCount ?? 0,
    capability: inventory.capability ?? "enumeration_available",
  };
  return {
    inspect: vi.fn().mockResolvedValue(normalized),
    assertSession: vi.fn().mockResolvedValue(true),
    transferAndVerify: vi.fn().mockResolvedValue({ status: "verified" }),
    deleteVerifiedBatch: vi.fn().mockResolvedValue(undefined),
    discardCurrentOwner: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue({
      status: "completed",
      absenceReads: 2,
      foreignOwnerResidue: normalized.foreignOwnerResidueCount > 0,
      foreignOrOrphanRetained: normalized.foreignBindingCount > 0,
    }),
  } satisfies {
    [K in keyof LegacyDeviceRetirementPort]: ReturnType<typeof vi.fn>;
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
