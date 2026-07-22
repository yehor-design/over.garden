import { describe, expect, it, vi } from "vitest";

import { createInterfaceLocaleChangeCoordinator } from "./interface-locale-change-coordinator";

describe("interface locale change coordinator", () => {
  it("prepares a clean transition immediately and publishes observable state", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const states: Array<{
      phase: string;
      inFlight: boolean;
      dirty: boolean;
    }> = [];
    const unsubscribeState = coordinator.subscribe((state) => {
      states.push({
        phase: state.phase,
        inFlight: state.hasInFlightMutation,
        dirty: state.requiresDirtyConfirmation,
      });
    });
    const unregister = coordinator.register({
      id: "profile-form-clean",
      kind: "clean",
    });

    const result = await coordinator.prepare();

    expect(result.status).toBe("prepared");
    expect(coordinator.readState().phase).toBe("preparing");
    if (result.status !== "prepared") return;
    await expect(result.preparation.resume()).resolves.toBe("resumed");
    expect(coordinator.readState()).toMatchObject({
      phase: "idle",
      hasInFlightMutation: false,
      requiresDirtyConfirmation: false,
    });
    expect(states.map((state) => state.phase)).toContain("preparing");

    unregister();
    unsubscribeState();
  });

  it("requires explicit discard confirmation and never discards on cancel", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const discard = vi.fn(async () => undefined);
    coordinator.register({
      id: "profile-unsaved-fields",
      kind: "dirty-confirmation",
      discard,
    });

    const confirmation = await coordinator.prepare();

    expect(confirmation).toMatchObject({
      status: "confirmation-required",
      participantIds: ["profile-unsaved-fields"],
      recovery: null,
    });
    expect(discard).not.toHaveBeenCalled();
    expect(coordinator.readState().phase).toBe("idle");

    const confirmed = await coordinator.prepare({ discardConfirmed: true });
    expect(confirmed.status).toBe("prepared");
    expect(discard).toHaveBeenCalledOnce();
    if (confirmed.status === "prepared") {
      await confirmed.preparation.resume();
    }
  });

  it("requires a fresh confirmation for a dirty surface registered during an async flush", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const firstDiscard = vi.fn(async () => undefined);
    const lateDiscard = vi.fn(async () => undefined);
    let releaseFlush: (() => void) | undefined;
    const flushBlocked = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    const flushStarted = vi.fn();
    coordinator.register({
      id: "initial-dirty-form",
      kind: "dirty-confirmation",
      discard: firstDiscard,
    });
    coordinator.register({
      id: "slow-safe-draft",
      kind: "safe-flush",
      prepare: async () => {
        flushStarted();
        await flushBlocked;
        return { resume: async () => undefined };
      },
    });

    await expect(coordinator.prepare()).resolves.toMatchObject({
      status: "confirmation-required",
      participantIds: ["initial-dirty-form"],
    });
    const confirmedPreparation = coordinator.prepare({
      discardConfirmed: true,
    });
    await vi.waitFor(() => expect(flushStarted).toHaveBeenCalledOnce());
    coordinator.register({
      id: "late-dirty-form",
      kind: "dirty-confirmation",
      discard: lateDiscard,
    });
    releaseFlush?.();

    await expect(confirmedPreparation).resolves.toMatchObject({
      status: "confirmation-required",
      participantIds: ["initial-dirty-form", "late-dirty-form"],
    });
    expect(firstDiscard).not.toHaveBeenCalled();
    expect(lateDiscard).not.toHaveBeenCalled();
  });

  it("does not reuse confirmation after the same static dirty surface advances", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const discard = vi.fn(async () => undefined);
    let unregisterDirty = coordinator.register({
      id: "same-profile-form",
      kind: "dirty-confirmation",
      discard,
    });
    let releaseFlush: (() => void) | undefined;
    const flushStarted = vi.fn();
    const blockedFlush = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    coordinator.register({
      id: "same-form-safe-flush",
      kind: "safe-flush",
      prepare: async () => {
        flushStarted();
        await blockedFlush;
        return { resume: async () => undefined };
      },
    });
    await coordinator.prepare();

    const confirmed = coordinator.prepare({ discardConfirmed: true });
    await vi.waitFor(() => expect(flushStarted).toHaveBeenCalledOnce());
    unregisterDirty();
    unregisterDirty = coordinator.register({
      id: "same-profile-form",
      kind: "dirty-confirmation",
      discard,
    });
    releaseFlush?.();

    await expect(confirmed).resolves.toMatchObject({
      status: "confirmation-required",
      participantIds: ["same-profile-form"],
    });
    expect(discard).not.toHaveBeenCalled();
    unregisterDirty();
  });

  it("runs a final safe flush after preparation while keeping the fence active", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const flushLatest = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    coordinator.register({
      id: "mutable-safe-draft",
      kind: "safe-flush",
      prepare: async () => ({ flushLatest, resume }),
    });

    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    await result.preparation.flushLatest();

    expect(flushLatest).toHaveBeenCalledOnce();
    expect(result.preparation.isActive()).toBe(true);
    await result.preparation.resume();
  });

  it("blocks destination I/O when a prepared adapter reports a hidden participant-set change", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    let nestedGateReady = true;
    coordinator.register({
      id: "owner-composer-drafts",
      kind: "safe-flush",
      prepare: async () => ({
        resume: async () => undefined,
        isCommitGateReady: () => nestedGateReady,
      }),
    });

    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(result.preparation.revalidateCommitGate()).toEqual({
      status: "ready",
    });

    nestedGateReady = false;
    expect(result.preparation.revalidateCommitGate()).toEqual({
      status: "blocked",
      reason: "participant-set-changed",
      participantIds: ["owner-composer-drafts"],
    });
    await result.preparation.resume();
  });

  it("fails closed when a prepared adapter cannot read its nested commit gate", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register({
      id: "owner-composer-drafts",
      kind: "safe-flush",
      prepare: async () => ({
        resume: async () => undefined,
        isCommitGateReady: () => {
          throw new Error("nested registry unavailable");
        },
      }),
    });

    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(result.preparation.revalidateCommitGate()).toEqual({
      status: "blocked",
      reason: "participant-set-changed",
      participantIds: ["owner-composer-drafts"],
    });
    await result.preparation.resume();
  });

  it("blocks before flush or discard while any product mutation is in flight", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const prepare = vi.fn(async () => ({ resume: async () => undefined }));
    const discard = vi.fn(async () => undefined);
    coordinator.register({
      id: "journal-safe-draft",
      kind: "safe-flush",
      prepare,
    });
    coordinator.register({
      id: "account-private-note",
      kind: "dirty-confirmation",
      discard,
    });
    const unregisterMutation = coordinator.register({
      id: "profile-save-mutation",
      kind: "in-flight",
    });

    expect(coordinator.readState()).toMatchObject({
      hasInFlightMutation: true,
      inFlightParticipantIds: ["profile-save-mutation"],
    });
    const result = await coordinator.prepare({ discardConfirmed: true });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "mutation-in-flight",
      participantIds: ["profile-save-mutation"],
      recovery: null,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    unregisterMutation();
    expect(coordinator.readState().hasInFlightMutation).toBe(false);
  });

  it("rechecks mutation state after an async flush and rolls the fence back", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    let releaseFlush: (() => void) | undefined;
    const flushBlocked = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    const flushStarted = vi.fn();
    const resume = vi.fn(async () => undefined);
    coordinator.register({
      id: "journal-race-draft",
      kind: "safe-flush",
      prepare: async () => {
        flushStarted();
        await flushBlocked;
        return { resume };
      },
    });

    const preparation = coordinator.prepare();
    await vi.waitFor(() => expect(flushStarted).toHaveBeenCalledOnce());
    coordinator.register({
      id: "journal-submit-mutation",
      kind: "in-flight",
    });
    releaseFlush?.();
    const result = await preparation;

    expect(result).toMatchObject({
      status: "blocked",
      reason: "mutation-in-flight",
      participantIds: ["journal-submit-mutation"],
      recovery: null,
    });
    expect(resume).toHaveBeenCalledOnce();
    expect(coordinator.readState().phase).toBe("idle");
  });

  it("fails closed and exposes retryable recovery without leaking an error cause", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const resume = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("private form contents"))
      .mockResolvedValue(undefined);
    coordinator.register({
      id: "first-safe-surface",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });
    coordinator.register({
      id: "failing-safe-surface",
      kind: "safe-flush",
      prepare: async () => {
        throw new Error("raw private note must not escape");
      },
    });

    const result = await coordinator.prepare();

    expect(result).toMatchObject({
      status: "failed",
      reason: "safe-flush-failed",
      participantIds: ["failing-safe-surface"],
    });
    if (result.status !== "failed") return;
    expect(result).not.toHaveProperty("error");
    expect(result.recovery?.participantIds()).toEqual(["first-safe-surface"]);
    expect(coordinator.readState().phase).toBe("preparing");

    const concurrent = await coordinator.prepare();
    expect(concurrent).toMatchObject({
      status: "blocked",
      reason: "transition-in-progress",
    });
    await expect(result.recovery?.resume()).resolves.toBe("resumed");
    expect(coordinator.readState().phase).toBe("idle");
  });

  it("keeps successful preparations frozen for document replacement without mutation replay", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    const resume = vi.fn(async () => undefined);
    const submitProductMutation = vi.fn(async () => undefined);
    coordinator.register({
      id: "journal-durable-draft",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });

    const result = await coordinator.prepare();

    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    result.preparation.keepFrozenForDocumentReplacement();
    expect(result.preparation.isActive()).toBe(false);
    expect(resume).not.toHaveBeenCalled();
    expect(submitProductMutation).not.toHaveBeenCalled();
    expect(coordinator.readState().phase).toBe("idle");
  });

  it("rejects dynamic or sensitive-looking participant identifiers", () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();

    expect(() =>
      coordinator.register({
        id: "private note with spaces",
        kind: "clean",
      }),
    ).toThrow("static, non-sensitive");
    expect(() => coordinator.register({ id: "", kind: "in-flight" })).toThrow(
      "static, non-sensitive",
    );
  });
});
