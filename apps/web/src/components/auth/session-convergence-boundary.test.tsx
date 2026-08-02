import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  useSession: vi.fn(),
  canonicalSignOut: vi.fn(),
  subscribe: vi.fn(),
  listener: null as null | ((payload: SessionSignal) => void),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
  publishReceived: vi.fn(),
  publishReady: vi.fn(),
  publishFailed: vi.fn(),
  publishCommitted: vi.fn(),
  prepareComposer: vi.fn(),
  composerBindScope: vi.fn(),
  composerFlush: vi.fn(),
  composerResume: vi.fn(),
  hydrate: vi.fn(),
  pause: vi.fn(),
  abort: vi.fn(),
  drain: vi.fn(),
  resume: vi.fn(),
  finalize: vi.fn(),
  finalizeSessionChange: vi.fn(),
  finalizeStandalone: vi.fn(),
  finalizeSessionChangeStandalone: vi.fn(),
  finalizeHardReload: vi.fn(),
  renew: vi.fn(),
  promote: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
  flushSync: vi.fn((callback: () => void) => callback()),
  localeFormState: vi.fn(),
  intervalCallbacks: [] as Array<() => void>,
  windowListeners: new Map<string, (event: Event) => void>(),
  documentListeners: new Map<string, (event: Event) => void>(),
}));

vi.mock("react-dom", () => ({ flushSync: mocks.flushSync }));

vi.mock("@/components/site-shell/interface-locale-change-boundary", () => ({
  useInterfaceLocaleChangeFormState: mocks.localeFormState,
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));
vi.mock("./blocked-session-account-methods", () => ({
  BlockedSessionAccountMethods: ({ locale }: { locale: string }) => (
    <section data-session-convergence-account-methods="true" lang={locale}>
      Guarded account methods
    </section>
  ),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: mocks.getSession,
    useSession: mocks.useSession,
  },
}));
vi.mock("@/lib/auth/sign-out-contract", () => ({
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS: {
    query: { disableCookieCache: true },
    fetchOptions: { cache: "no-store" },
  },
  classifySessionConfirmation: (result: unknown) => {
    const data = (result as { data?: unknown } | null)?.data;
    if (data === null) return "signed_out";
    if (
      data &&
      typeof data === "object" &&
      "user" in data &&
      (data as { user?: unknown }).user
    ) {
      return "authenticated";
    }
    return "unknown";
  },
  prepareCurrentSessionSignOut: async (result: unknown) => {
    const data = (result as { data?: { user?: { id?: string } } | null })?.data;
    if (data === null) return null;
    const id = data?.user?.id;
    if (!id) throw new Error("unavailable");
    return { version: 1, binding: `opaque-binding-for-${id}` };
  },
  localizedPublicRoot: (locale: string) =>
    locale === "uk" ? "/" : `/${locale}`,
  signOutCurrentSessionOnce: mocks.canonicalSignOut,
}));
vi.mock("@/lib/auth/session-convergence", () => ({
  SESSION_CONVERGENCE_SIGNALS: {
    preparation: "sign_out_preparation",
    received: "sign_out_preparation_received",
    ready: "sign_out_preparation_ready",
    failed: "sign_out_preparation_failed",
    cancellation: "sign_out_preparation_cancelled",
    committed: "session_invalidation_committed",
  },
  acquireAuthenticatedSessionTabLease: mocks.acquireLease,
  createSessionTabId: () => "tab-unregistered-test-1234",
  createSignOutOperationId: () => "op-fallback-fence-1234",
  publishSignOutPreparationReceived: mocks.publishReceived,
  publishSignOutPreparationReady: mocks.publishReady,
  publishSignOutPreparationFailed: mocks.publishFailed,
  publishCommittedSessionInvalidation: mocks.publishCommitted,
  subscribeToSessionConvergence: mocks.subscribe,
}));
vi.mock("@/lib/offline/owner-composer-participants", () => ({
  prepareOwnerComposerParticipants: mocks.prepareComposer,
}));
vi.mock("@/lib/offline/owner-session-lifecycle", () => ({
  abortOwnerSyncAttempts: mocks.abort,
  finalizeOwnerOfflineActivityForSignedOut: mocks.finalizeStandalone,
  finalizeOwnerOfflineActivityForSessionChange:
    mocks.finalizeSessionChangeStandalone,
  hydrateOwnerOfflineActivitySession: mocks.hydrate,
  pauseOwnerOfflineActivity: mocks.pause,
}));

import { SessionConvergenceBoundary } from "./session-convergence-boundary";

describe("session convergence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.intervalCallbacks.length = 0;
    mocks.windowListeners.clear();
    mocks.documentListeners.clear();
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
          mocks.documentListeners.set(
            type,
            typeof listener === "function"
              ? listener
              : listener.handleEvent.bind(listener),
          );
        },
      ),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("window", {
      location: { replace: mocks.replace, reload: mocks.reload },
      addEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
          mocks.windowListeners.set(
            type,
            typeof listener === "function"
              ? listener
              : listener.handleEvent.bind(listener),
          );
        },
      ),
      removeEventListener: vi.fn(),
      setInterval: (callback: () => void) => {
        mocks.intervalCallbacks.push(callback);
        return mocks.intervalCallbacks.length;
      },
      clearInterval: vi.fn(),
    });
    mocks.listener = null;
    mocks.subscribe.mockImplementation(
      (listener: (payload: SessionSignal) => void) => {
        mocks.listener = listener;
        return vi.fn();
      },
    );
    mocks.useSession.mockReturnValue({ data: null, isPending: true });
    mocks.acquireLease.mockReturnValue({
      tabId: "tab-boundary-test-1234",
      release: mocks.releaseLease,
    });
    mocks.getSession.mockResolvedValue(activeSession());
    mocks.canonicalSignOut.mockResolvedValue({
      status: "committed",
      reconciliation: "canonical_response",
    });
    mocks.prepareComposer.mockResolvedValue({
      isActive: () => true,
      bindOfflineActivityScope: mocks.composerBindScope,
      flushLatest: mocks.composerFlush,
      resume: mocks.composerResume,
    });
    mocks.composerFlush.mockResolvedValue(undefined);
    mocks.composerResume.mockResolvedValue(undefined);
    mocks.pause.mockResolvedValue({
      operationId: "op-fallback-fence-1234",
      sessionGeneration: "opaque-binding-for-session-a",
      waitForSyncDrain: mocks.drain,
      resume: mocks.resume,
      finalizeForSessionChange: mocks.finalizeSessionChange,
      finalizeForSignedOut: mocks.finalize,
      finalizeForHardReload: mocks.finalizeHardReload,
      renewPreparationLease: mocks.renew,
      promoteToCommitFence: mocks.promote,
    });
    mocks.hydrate.mockResolvedValue("ready");
    mocks.drain.mockResolvedValue(undefined);
    mocks.resume.mockResolvedValue(undefined);
    mocks.finalize.mockResolvedValue("fenced");
    mocks.finalizeSessionChange.mockResolvedValue("fenced");
    mocks.finalizeStandalone.mockResolvedValue("fenced");
    mocks.finalizeSessionChangeStandalone.mockResolvedValue("fenced");
    mocks.finalizeHardReload.mockResolvedValue(undefined);
    mocks.renew.mockResolvedValue(undefined);
    mocks.promote.mockResolvedValue(undefined);
  });

  it("subscribes to identity-free preparation, acknowledgement and terminal signals", async () => {
    const source = await readFile(
      fileURLToPath(
        new URL("./session-convergence-boundary.tsx", import.meta.url),
      ),
      "utf8",
    );

    expect(source).toContain("subscribeToSessionConvergence");
    expect(source).toContain("publishSignOutPreparationReceived");
    expect(source).toContain("publishSignOutPreparationReady");
    expect(source).toContain("publishSignOutPreparationFailed");
    expect(source).toContain('window.addEventListener("pageshow"');
    expect(source).toContain('window.addEventListener("focus"');
    expect(source).not.toMatch(/payload\.(?:user|session|account|owner)/);
  });

  it("does not treat Better Auth's pending null hook snapshot as signed out", async () => {
    const renderer = await renderBoundary();

    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
      fetchOptions: { cache: "no-store" },
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("publishes a payload-free locale fence until local session hydration is ready", async () => {
    mocks.hydrate.mockResolvedValue("blocked");
    const renderer = await renderBoundary();

    expect(mocks.localeFormState).toHaveBeenCalledWith({
      id: "session-convergence-lifecycle",
      dirty: false,
      pending: true,
    });
    expect(mocks.localeFormState).not.toHaveBeenCalledWith({
      id: "session-convergence-lifecycle",
      dirty: false,
      pending: false,
    });
    await unmount(renderer);
  });

  it("renders only the payload-free locale control while authenticated children are gated", async () => {
    const hydration = deferred<"ready">();
    mocks.hydrate.mockReturnValueOnce(hydration.promise);
    const renderer = await renderBoundary(
      <p data-private-surface="true">Private surface</p>,
      <button
        type="button"
        disabled
        data-interface-language-control="site-shell-interface-language-control"
      >
        Български
      </button>,
    );

    expect(
      renderer.root.findAllByProps({
        "data-interface-language-control":
          "site-shell-interface-language-control",
      }),
    ).toHaveLength(1);
    expect(
      renderer.root.findByProps({
        "data-interface-language-control":
          "site-shell-interface-language-control",
      }).props.disabled,
    ).toBe(true);
    expect(
      renderer.root.findAllByProps({ "data-private-surface": "true" }),
    ).toHaveLength(0);

    hydration.resolve("ready");
    await vi.waitFor(() =>
      expect(
        renderer.root.findAllByProps({ "data-private-surface": "true" }),
      ).toHaveLength(1),
    );
    expect(
      renderer.root.findAllByProps({
        "data-interface-language-control":
          "site-shell-interface-language-control",
      }),
    ).toHaveLength(0);
    await unmount(renderer);
  });

  it.each([
    ["focus", () => mocks.windowListeners.get("focus")],
    [
      "visible-page recovery",
      () => mocks.documentListeners.get("visibilitychange"),
    ],
  ])(
    "synchronously removes A private content and seals owner activity before a deferred %s identity result",
    async (_name, readListener) => {
      const renderer = await renderBoundary(privateSignOutDialog("waiting"));
      expectPrivateSignOutDialogPresent(renderer, "waiting");
      const confirmation = deferred<ReturnType<typeof activeSession>>();
      mocks.getSession.mockImplementationOnce(() => confirmation.promise);

      await dispatchAuthoritativeRecheck(readListener());

      expectPrivateSignOutDialogAbsent(renderer);
      expect(
        renderer.root.findAllByProps({
          "data-session-convergence-gate": "checking",
        }),
      ).toHaveLength(1);
      expect(mocks.abort).toHaveBeenCalledWith("session-a");
      expect(mocks.prepareComposer).toHaveBeenCalledOnce();
      expect(mocks.pause).toHaveBeenCalledOnce();
      expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.getSession.mock.invocationCallOrder[1]!,
      );
      const publicHome = renderer.root.findByProps({
        "data-session-convergence-public-home": "true",
      });
      expect(publicHome.props.href).toBe("/bg");
      const reload = renderer.root.findByProps({
        "data-session-convergence-reload": "true",
      });
      expect(reload.props.disabled).not.toBe(true);

      await act(async () => {
        confirmation.resolve(activeSession());
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      await vi.waitFor(() =>
        expectPrivateSignOutDialogPresent(renderer, "waiting"),
      );
      expect(mocks.resume).toHaveBeenCalledOnce();
      expect(mocks.composerResume).toHaveBeenCalledOnce();
      expect(mocks.reload).not.toHaveBeenCalled();
      await unmount(renderer);
    },
  );

  it("never admits A or B private content when a focus recheck confirms account B", async () => {
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const confirmation = deferred<ReturnType<typeof activeSession>>();
    mocks.getSession.mockImplementationOnce(() => confirmation.promise);

    await dispatchAuthoritativeRecheck(mocks.windowListeners.get("focus"));
    expectPrivateSignOutDialogAbsent(renderer);

    await act(async () => {
      confirmation.resolve(activeSession("session-b"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());

    expectPrivateSignOutDialogAbsent(renderer);
    expect(mocks.finalizeSessionChange).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("bounds a stalled focus recheck behind safe exits and rejects its late completion", async () => {
    vi.useFakeTimers();
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const confirmation = deferred<ReturnType<typeof activeSession>>();
    mocks.getSession.mockImplementationOnce(() => confirmation.promise);

    await dispatchAuthoritativeRecheck(mocks.windowListeners.get("focus"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expectPrivateSignOutDialogAbsent(renderer);
    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "blocked",
      }),
    ).toHaveLength(1);
    expect(
      renderer.root.findByProps({
        "data-session-convergence-public-home": "true",
      }).props.href,
    ).toBe("/bg");
    const reload = renderer.root.findByProps({
      "data-session-convergence-reload": "true",
    });
    expect(reload.props.disabled).not.toBe(true);
    await act(async () => {
      reload.props.onClick();
    });
    expect(mocks.reload).toHaveBeenCalledOnce();

    await act(async () => {
      confirmation.resolve(activeSession());
      await Promise.resolve();
      await Promise.resolve();
    });
    expectPrivateSignOutDialogAbsent(renderer);
    expect(mocks.hydrate).toHaveBeenCalledOnce();
    await unmount(renderer);
    vi.useRealTimers();
  });

  it("keeps a partial owner fence sealed until an exact-A retry can release it", async () => {
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    mocks.prepareComposer.mockRejectedValueOnce(
      new Error("composer preparation unavailable"),
    );

    await dispatchAuthoritativeRecheck(mocks.windowListeners.get("focus"));
    await vi.waitFor(() =>
      expect(
        renderer.root.findAllByProps({
          "data-session-convergence-gate": "blocked",
        }),
      ).toHaveLength(1),
    );
    expectPrivateSignOutDialogAbsent(renderer);
    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();

    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");
    await act(async () => {
      retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() =>
      expectPrivateSignOutDialogPresent(renderer, "waiting"),
    );
    expect(mocks.pause).toHaveBeenCalledTimes(2);
    expect(mocks.resume).toHaveBeenCalledTimes(2);
    await unmount(renderer);
  });

  it("lets only a newer exact-A retry reopen the tree after an older focus epoch times out", async () => {
    vi.useFakeTimers();
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const olderConfirmation = deferred<ReturnType<typeof activeSession>>();
    mocks.getSession.mockImplementationOnce(() => olderConfirmation.promise);

    await dispatchAuthoritativeRecheck(mocks.windowListeners.get("focus"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expectPrivateSignOutDialogAbsent(renderer);

    mocks.getSession.mockResolvedValueOnce(activeSession());
    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");
    await act(async () => {
      retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expectPrivateSignOutDialogPresent(renderer, "waiting"),
    );
    const hydrationCountAfterRetry = mocks.hydrate.mock.calls.length;

    await act(async () => {
      olderConfirmation.resolve(activeSession());
      await Promise.resolve();
      await Promise.resolve();
    });
    expectPrivateSignOutDialogPresent(renderer, "waiting");
    expect(mocks.hydrate).toHaveBeenCalledTimes(hydrationCountAfterRetry);
    await unmount(renderer);
    vi.useRealTimers();
  });

  it("keeps the locale fence active for a remote preparation through cancellation recovery", async () => {
    const renderer = await renderBoundary();
    expect(mocks.localeFormState).toHaveBeenLastCalledWith({
      id: "session-convergence-lifecycle",
      dirty: false,
      pending: false,
    });

    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    expect(mocks.localeFormState).toHaveBeenLastCalledWith({
      id: "session-convergence-lifecycle",
      dirty: false,
      pending: true,
    });

    await emit("sign_out_preparation_cancelled");
    await vi.waitFor(() => expect(mocks.resume).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(mocks.localeFormState).toHaveBeenLastCalledWith({
        id: "session-convergence-lifecycle",
        dirty: false,
        pending: false,
      }),
    );
    await unmount(renderer);
  });

  it("publishes the exact-round liveness receipt before asynchronous preparation", async () => {
    const renderer = await renderBoundary();

    await emit("sign_out_preparation", "op-liveness-boundary-1234");

    expect(mocks.publishReceived).toHaveBeenCalledWith(
      "op-liveness-boundary-1234",
      "tab-boundary-test-1234",
      "round-boundary-test-1234",
    );
    expect(mocks.publishReceived.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publishReady.mock.invocationCallOrder[0]!,
    );
    await unmount(renderer);
  });

  it("server-renders a fail-closed checking gate instead of authenticated children", () => {
    const html = renderToStaticMarkup(
      <SessionConvergenceBoundary locale="bg">
        <p>Private server content</p>
      </SessionConvergenceBoundary>,
    );

    expect(html).toContain('data-session-convergence-gate="checking"');
    expect(html).toContain("Проверяваме локалните промени…");
    expect(html).not.toContain("Private server content");
  });

  it("freezes and flushes memory before pausing, draining and acknowledging every operation", async () => {
    const order: string[] = [];
    mocks.prepareComposer.mockImplementation(async () => {
      order.push("composer");
      return {
        isActive: () => true,
        bindOfflineActivityScope: (scope: unknown) => {
          order.push("bind");
          mocks.composerBindScope(scope);
        },
        flushLatest: async () => void order.push("flush"),
        resume: mocks.composerResume,
      };
    });
    mocks.pause.mockImplementation(async () => {
      order.push("pause");
      return {
        operationId: "op-fallback-fence-1234",
        sessionGeneration: "opaque-binding-for-session-a",
        waitForSyncDrain: async () => void order.push("drain"),
        resume: mocks.resume,
        finalizeForSessionChange: mocks.finalizeSessionChange,
        finalizeForSignedOut: mocks.finalize,
        finalizeForHardReload: mocks.finalizeHardReload,
        renewPreparationLease: async () => void order.push("renew"),
        promoteToCommitFence: mocks.promote,
      };
    });
    mocks.publishReady.mockImplementation(() => order.push("ready"));
    const renderer = await renderBoundary();

    await emit("sign_out_preparation", "op-first-ready-1234");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    await emit("sign_out_preparation", "op-second-ready-1234");

    expect(order).toEqual([
      "composer",
      "pause",
      "bind",
      "drain",
      "flush",
      "renew",
      "ready",
      "flush",
      "renew",
      "ready",
    ]);
    expect(mocks.publishReady).toHaveBeenNthCalledWith(
      1,
      "op-first-ready-1234",
      "tab-boundary-test-1234",
      "round-boundary-test-1234",
    );
    expect(mocks.publishReady).toHaveBeenNthCalledWith(
      2,
      "op-second-ready-1234",
      "tab-boundary-test-1234",
      "round-boundary-test-1234",
    );
    expect(mocks.pause).toHaveBeenCalledWith("session-a", {
      operationId: "op-fallback-fence-1234",
      sessionGeneration: "opaque-binding-for-session-a",
    });
    expect(mocks.pause.mock.calls[0]?.[1]?.operationId).not.toBe(
      "op-first-ready-1234",
    );
    expect(mocks.composerBindScope).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "op-fallback-fence-1234",
        sessionGeneration: "opaque-binding-for-session-a",
      }),
    );
    await unmount(renderer);
  });

  it("never labels an earlier flush as readiness for a later preparation round", async () => {
    let releaseFirstFlush: (() => void) | undefined;
    let releaseSecondFlush: (() => void) | undefined;
    const firstFlush = new Promise<void>((resolve) => {
      releaseFirstFlush = resolve;
    });
    const secondFlush = new Promise<void>((resolve) => {
      releaseSecondFlush = resolve;
    });
    mocks.composerFlush
      .mockReturnValueOnce(firstFlush)
      .mockReturnValueOnce(secondFlush);
    const renderer = await renderBoundary();

    await emit(
      "sign_out_preparation",
      "op-overlap-round-1234",
      "round-overlap-first-1234",
    );
    await vi.waitFor(() => expect(mocks.composerFlush).toHaveBeenCalledOnce());
    await emit(
      "sign_out_preparation",
      "op-overlap-round-1234",
      "round-overlap-second-1234",
    );

    releaseFirstFlush?.();
    await vi.waitFor(() =>
      expect(mocks.publishReady).toHaveBeenCalledWith(
        "op-overlap-round-1234",
        "tab-boundary-test-1234",
        "round-overlap-first-1234",
      ),
    );
    await vi.waitFor(() =>
      expect(mocks.composerFlush).toHaveBeenCalledTimes(2),
    );
    expect(mocks.publishReady).not.toHaveBeenCalledWith(
      "op-overlap-round-1234",
      "tab-boundary-test-1234",
      "round-overlap-second-1234",
    );

    releaseSecondFlush?.();
    await vi.waitFor(() =>
      expect(mocks.publishReady).toHaveBeenCalledWith(
        "op-overlap-round-1234",
        "tab-boundary-test-1234",
        "round-overlap-second-1234",
      ),
    );
    await unmount(renderer);
  });

  it("publishes failed and never ready when composer preparation fails", async () => {
    mocks.prepareComposer.mockRejectedValue(new Error("durable flush failed"));
    const renderer = await renderBoundary();

    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishFailed).toHaveBeenCalledOnce());

    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.publishReady).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("does not acknowledge or prepare when this tab cannot register presence", async () => {
    mocks.acquireLease.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const renderer = await renderBoundary();

    await emit("sign_out_preparation", "op-unregistered-tab-1234");

    expect(mocks.publishReceived).not.toHaveBeenCalled();
    expect(mocks.publishFailed).not.toHaveBeenCalled();
    expect(mocks.prepareComposer).not.toHaveBeenCalled();
    expect(mocks.publishReady).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("finalizes the cross-tab pause before replacing a confirmed signed-out tab", async () => {
    const renderer = await renderBoundary();
    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    mocks.getSession.mockResolvedValue({ data: null });

    await emit("session_invalidation_committed");
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/bg"));

    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("removes private children synchronously before a committed peer session proof resolves", async () => {
    const operationId = "op-deferred-commit-proof-1234";
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    expectPrivateSignOutDialogPresent(renderer, "waiting");
    await emit("sign_out_preparation", operationId);
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    const confirmation = deferred<unknown>();
    mocks.getSession.mockImplementationOnce(() => confirmation.promise);

    await emit("session_invalidation_committed", operationId);

    expect(mocks.getSession).toHaveBeenCalledTimes(3);
    expect(mocks.resume).not.toHaveBeenCalled();
    expectPrivateSignOutDialogAbsent(renderer);
    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "blocked",
      }),
    ).toHaveLength(1);

    await act(async () => {
      confirmation.resolve({ data: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.replace).toHaveBeenCalledWith("/bg");
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("keeps private children absent when committed confirmation is unknown", async () => {
    const operationId = "op-unknown-commit-proof-1234";
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    expectPrivateSignOutDialogPresent(renderer, "waiting");
    await emit("sign_out_preparation", operationId);
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    const confirmation = deferred<unknown>();
    mocks.getSession.mockImplementationOnce(() => confirmation.promise);

    await emit("session_invalidation_committed", operationId);
    expectPrivateSignOutDialogAbsent(renderer);

    await act(async () => {
      confirmation.resolve({ data: undefined });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("keeps private children absent when committed confirmation rejects", async () => {
    const operationId = "op-error-commit-proof-1234";
    const renderer = await renderBoundary(privateSignOutDialog("error"));
    expectPrivateSignOutDialogPresent(renderer, "error");
    await emit("sign_out_preparation", operationId);
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    const confirmation = deferred<unknown>();
    mocks.getSession.mockImplementationOnce(() => confirmation.promise);

    await emit("session_invalidation_committed", operationId);
    expectPrivateSignOutDialogAbsent(renderer);

    await act(async () => {
      confirmation.reject(new Error("authoritative session unavailable"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("reopens private children only after deferred confirmation proves exact session A and recovery succeeds", async () => {
    const operationId = "op-exact-a-commit-proof-1234";
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    expectPrivateSignOutDialogPresent(renderer, "waiting");
    await emit("sign_out_preparation", operationId);
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    const confirmation = deferred<unknown>();
    mocks.getSession.mockImplementationOnce(() => confirmation.promise);

    await emit("session_invalidation_committed", operationId);
    expectPrivateSignOutDialogAbsent(renderer);
    expect(mocks.resume).not.toHaveBeenCalled();

    await act(async () => {
      confirmation.resolve(activeSession());
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(mocks.resume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.composerResume).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expectPrivateSignOutDialogPresent(renderer, "waiting"),
    );
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("durably resumes the cross-tab pause after the exact same authenticated session is confirmed", async () => {
    const renderer = await renderBoundary();
    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    mocks.getSession.mockResolvedValue(activeSession());

    await emit("session_invalidation_committed");
    await vi.waitFor(() => expect(mocks.resume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.composerResume).toHaveBeenCalledOnce());

    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it("keeps the cross-tab pause frozen when terminal session confirmation is unknown", async () => {
    const renderer = await renderBoundary();
    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    mocks.getSession.mockResolvedValue({ data: undefined });

    await emit("session_invalidation_committed");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    await unmount(renderer);
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it("hard reloads instead of resuming stale A memory when the cookie becomes session B", async () => {
    const renderer = await renderBoundary();
    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    mocks.getSession.mockResolvedValue(activeSession("session-b"));

    await emit("session_invalidation_committed");
    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());

    expect(mocks.finalizeSessionChange).toHaveBeenCalledOnce();
    expect(mocks.finalizeHardReload).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalled();
    await unmount(renderer);
  });

  it("ignores a reordered preparation after the same operation is terminal", async () => {
    const renderer = await renderBoundary();
    mocks.getSession.mockResolvedValue({ data: null });

    await emit("session_invalidation_committed", "op-reordered-1234");
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
    await emit("sign_out_preparation", "op-reordered-1234");

    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.finalizeStandalone).toHaveBeenCalledWith(
      "session-a",
      "opaque-binding-for-session-a",
    );
    await unmount(renderer);
  });

  it("privacy-gates and navigates a missed-PREP signed-out document even when standalone finalization rejects", async () => {
    mocks.finalizeStandalone.mockRejectedValue(
      new Error("IndexedDB finalization failed"),
    );
    const renderer = await renderBoundary();
    mocks.getSession.mockResolvedValue({ data: null });

    await emit("session_invalidation_committed", "op-missed-prep-1234");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.finalizeStandalone).toHaveBeenCalledOnce();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/bg");
    expect(mocks.flushSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.replace.mock.invocationCallOrder[0]!,
    );
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(0);
    await unmount(renderer);
  });

  it("privacy-gates and reloads session B when session A finalization rejects", async () => {
    mocks.finalizeSessionChange.mockRejectedValue(
      new Error("IndexedDB unavailable"),
    );
    const renderer = await renderBoundary();
    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    mocks.getSession.mockResolvedValue(activeSession("session-b"));

    await emit("session_invalidation_committed");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(mocks.flushSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reload.mock.invocationCallOrder[0]!,
    );
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(0);
    await unmount(renderer);
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it("does not let cancellation for operation A release operation B", async () => {
    const renderer = await renderBoundary();
    await emit("sign_out_preparation", "op-concurrent-a-1234");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());
    await emit("sign_out_preparation", "op-concurrent-b-1234");

    await emit("sign_out_preparation_cancelled", "op-concurrent-a-1234");
    expect(mocks.resume).not.toHaveBeenCalled();

    await emit("sign_out_preparation_cancelled", "op-concurrent-b-1234");
    await vi.waitFor(() => expect(mocks.resume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.composerResume).toHaveBeenCalledOnce());
    await unmount(renderer);
  });

  it("authoritatively releases a stale operation whose initiator disappeared", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
    const renderer = await renderBoundary();
    await emit("sign_out_preparation", "op-stale-initiator-1234");
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    mocks.intervalCallbacks[0]?.();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(mocks.composerResume).toHaveBeenCalledOnce();
    await unmount(renderer);
    vi.useRealTimers();
  });

  it("best-effort resumes a non-finalized pause on ordinary unmount", async () => {
    const renderer = await renderBoundary();
    await emit("sign_out_preparation");
    await vi.waitFor(() => expect(mocks.publishReady).toHaveBeenCalledOnce());

    await unmount(renderer);

    expect(mocks.resume).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.composerResume).toHaveBeenCalledOnce());
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("keeps authenticated children gated while durable activity is blocked and retries hydration", async () => {
    mocks.hydrate
      .mockResolvedValueOnce("blocked")
      .mockResolvedValueOnce("ready");
    const renderer = await renderBoundary();

    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "blocked",
      }),
    ).toHaveLength(1);
    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-account-methods": "true",
      }),
    ).toHaveLength(1);
    expect(
      renderer.root
        .findAllByType("p")
        .map((node) => textContent(node.props.children)),
    ).not.toContain("Private surface");

    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");
    expect(retry).toBeDefined();
    await act(async () => {
      await retry?.props.onClick();
      await Promise.resolve();
    });

    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(1);
    expect(mocks.hydrate).toHaveBeenCalledTimes(2);
    await unmount(renderer);
  });

  it("bounds a never-settling initial auth read and requires an explicit retry", async () => {
    vi.useFakeTimers();
    const stalled = deferred<ReturnType<typeof activeSession>>();
    mocks.getSession.mockReturnValueOnce(stalled.promise);
    const renderer = await renderBoundary();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "blocked",
      }),
    ).toHaveLength(1);
    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(0);
    expect(mocks.hydrate).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValueOnce(activeSession());
    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");
    await act(async () => {
      await retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(1);
    stalled.resolve(activeSession());
    await Promise.resolve();
    expect(mocks.hydrate).toHaveBeenCalledOnce();
    await unmount(renderer);
    vi.useRealTimers();
  });

  it("recovers an unavailable initial baseline only through a fresh authoritative retry", async () => {
    mocks.getSession
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(activeSession());
    const renderer = await renderBoundary();

    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "blocked",
      }),
    ).toHaveLength(1);
    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");
    await act(async () => {
      await retry?.props.onClick();
      await Promise.resolve();
    });

    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(mocks.hydrate).toHaveBeenCalledWith(
      "session-a",
      "opaque-binding-for-session-a",
    );
    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(1);
    await unmount(renderer);
  });

  it("offers action-time bound exit when the initial baseline was unavailable", async () => {
    mocks.getSession
      .mockRejectedValueOnce(new Error("initial proof unavailable"))
      .mockResolvedValueOnce(activeSession());
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));

    expectPrivateSignOutDialogAbsent(renderer);
    const fallbackExit = renderer.root.findByProps({
      "data-session-convergence-fallback-sign-out": "true",
    });
    expect(mocks.hydrate).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();

    await act(async () => {
      fallbackExit.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(mocks.canonicalSignOut).toHaveBeenCalledOnce());
    expect(mocks.canonicalSignOut).toHaveBeenCalledWith(
      {
        version: 1,
        binding: "opaque-binding-for-session-a",
      },
      expect.objectContaining({
        getSession: expect.any(Function),
        signOut: expect.any(Function),
      }),
    );
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(mocks.prepareComposer).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledWith(
      "op-fallback-fence-1234",
      "tab-boundary-test-1234",
    );
    expect(mocks.replace).toHaveBeenCalledWith("/bg");
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("routes a freshly absent session public without a false sign-out receipt", async () => {
    mocks.getSession
      .mockRejectedValueOnce(new Error("initial proof unavailable"))
      .mockResolvedValueOnce({ data: null, error: null });
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const fallbackExit = renderer.root.findByProps({
      "data-session-convergence-fallback-sign-out": "true",
    });

    await act(async () => {
      fallbackExit.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/bg"));
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("never rehydrates baseline A when a gate retry authoritatively observes session B", async () => {
    mocks.hydrate.mockResolvedValueOnce("blocked");
    mocks.getSession
      .mockResolvedValueOnce(activeSession())
      .mockResolvedValueOnce(activeSession("session-b"));
    const renderer = await renderBoundary();
    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");

    await act(async () => {
      await retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.finalizeSessionChangeStandalone).toHaveBeenCalledWith(
      "session-a",
      "opaque-binding-for-session-a",
    );
    expect(mocks.hydrate).toHaveBeenCalledOnce();
    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(
      renderer.root.findAllByProps({ children: "Private surface" }),
    ).toHaveLength(0);
    await unmount(renderer);
  });

  it("fences baseline A and redirects when a gate retry authoritatively observes sign-out", async () => {
    mocks.hydrate.mockResolvedValueOnce("blocked");
    mocks.getSession
      .mockResolvedValueOnce(activeSession())
      .mockResolvedValueOnce({ data: null });
    const renderer = await renderBoundary();
    const retry = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Опитайте отново");

    await act(async () => {
      await retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.finalizeStandalone).toHaveBeenCalledWith(
      "session-a",
      "opaque-binding-for-session-a",
    );
    expect(mocks.hydrate).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/bg");
    await unmount(renderer);
  });

  it("offers a bound no-deletion exit from blocked hydration and hides private UI before public navigation", async () => {
    mocks.hydrate.mockResolvedValue("blocked");
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));

    expectPrivateSignOutDialogAbsent(renderer);
    const fallbackExit = renderer.root.findByProps({
      "data-session-convergence-fallback-sign-out": "true",
    });
    expect(textContent(fallbackExit.props.children)).toBe(
      "Изход без изтриване на локалните промени",
    );
    expect(mocks.prepareComposer).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.abort).not.toHaveBeenCalled();

    await act(async () => {
      fallbackExit.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(mocks.canonicalSignOut).toHaveBeenCalledOnce());
    expect(mocks.canonicalSignOut).toHaveBeenCalledWith(
      {
        version: 1,
        binding: "opaque-binding-for-session-a",
      },
      expect.objectContaining({
        getSession: expect.any(Function),
        signOut: expect.any(Function),
      }),
    );
    expect(mocks.prepareComposer).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledWith(
      "op-fallback-fence-1234",
      "tab-boundary-test-1234",
    );
    expect(mocks.replace).toHaveBeenCalledWith("/bg");
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("keeps the recovery gate and no-deletion exit when the bound session remains active", async () => {
    mocks.hydrate.mockResolvedValue("blocked");
    mocks.canonicalSignOut.mockResolvedValue({
      status: "failed",
      reason: "session_still_active",
    });
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const fallbackExit = renderer.root.findByProps({
      "data-session-convergence-fallback-sign-out": "true",
    });

    await act(async () => {
      fallbackExit.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() =>
      expect(
        renderer.root.findAllByProps({ role: "status" }).some((node) =>
          textContent(node.props.children).includes("не можа да бъде потвърдено"),
        ),
      ).toBe(true),
    );
    expect(mocks.publishCommitted).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("reloads a changed fallback session without publishing a sign-out receipt", async () => {
    mocks.hydrate.mockResolvedValue("blocked");
    mocks.canonicalSignOut.mockResolvedValue({
      status: "failed",
      reason: "session_changed",
    });
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const fallbackExit = renderer.root.findByProps({
      "data-session-convergence-fallback-sign-out": "true",
    });

    await act(async () => {
      fallbackExit.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.publishCommitted).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expectPrivateSignOutDialogAbsent(renderer);
    await unmount(renderer);
  });

  it("bounds duplicate fallback exit, keeps the safe exits usable, and rejects late completion", async () => {
    vi.useFakeTimers();
    mocks.hydrate.mockResolvedValue("blocked");
    const result = deferred<{
      status: "committed";
      reconciliation: "canonical_response";
    }>();
    mocks.canonicalSignOut.mockReturnValue(result.promise);
    const renderer = await renderBoundary(privateSignOutDialog("waiting"));
    const fallbackExit = renderer.root.findByProps({
      "data-session-convergence-fallback-sign-out": "true",
    });

    await act(async () => {
      fallbackExit.props.onClick();
      fallbackExit.props.onClick();
      await Promise.resolve();
    });
    expect(mocks.canonicalSignOut).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(
      renderer.root.findByProps({
        "data-session-convergence-fallback-sign-out": "true",
      }).props.disabled,
    ).not.toBe(true);
    expect(
      renderer.root.findByProps({
        "data-session-convergence-public-home": "true",
      }).props.href,
    ).toBe("/bg");
    expect(
      renderer.root.findByProps({
        "data-session-convergence-reload": "true",
      }).props.disabled,
    ).not.toBe(true);

    await act(async () => {
      result.resolve({
        status: "committed",
        reconciliation: "canonical_response",
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.publishCommitted).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    await unmount(renderer);
    vi.useRealTimers();
  });
});

function activeSession(id = "session-a") {
  return { data: { session: { id }, user: { id } }, error: null };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function renderBoundary(
  children: React.ReactNode = <p>Private surface</p>,
  localeControlFallback?: React.ReactNode,
) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SessionConvergenceBoundary
        locale="bg"
        localeControlFallback={localeControlFallback}
      >
        {children}
      </SessionConvergenceBoundary>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer!;
}

function privateSignOutDialog(phase: "waiting" | "error") {
  return (
    <>
      <p>Private surface</p>
      <div role="dialog" data-private-sign-out-phase={phase}>
        <span data-private-draft-count="3">3 private drafts</span>
        <button type="button">Discard private drafts and sign out</button>
      </div>
    </>
  );
}

function expectPrivateSignOutDialogAbsent(renderer: ReactTestRenderer) {
  expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({ "data-private-draft-count": "3" }),
  ).toHaveLength(0);
  expect(
    renderer.root
      .findAllByType("button")
      .filter(
        (node) =>
          textContent(node.props.children) ===
          "Discard private drafts and sign out",
      ),
  ).toHaveLength(0);
}

function expectPrivateSignOutDialogPresent(
  renderer: ReactTestRenderer,
  phase: "waiting" | "error",
) {
  expect(
    renderer.root.findAllByProps({ "data-private-sign-out-phase": phase }),
  ).toHaveLength(1);
  expect(
    renderer.root.findAllByProps({ "data-private-draft-count": "3" }),
  ).toHaveLength(1);
  expect(
    renderer.root
      .findAllByType("button")
      .filter(
        (node) =>
          textContent(node.props.children) ===
          "Discard private drafts and sign out",
      ),
  ).toHaveLength(1);
}

async function emit(
  signal: string,
  operationId = "op-boundary-test-1234",
  preparationRoundId = "round-boundary-test-1234",
) {
  await act(async () => {
    mocks.listener?.({
      signal,
      operationId,
      tabId: "tab-external-test-1234",
      preparationRoundId:
        signal === "sign_out_preparation" ||
        signal === "sign_out_preparation_received"
          ? preparationRoundId
          : null,
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function dispatchAuthoritativeRecheck(
  listener: ((event: Event) => void) | undefined,
) {
  expect(listener).toBeDefined();
  await act(async () => {
    listener?.(new Event("session-recheck"));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface SessionSignal {
  signal: string;
  operationId: string;
  tabId: string;
  preparationRoundId: string | null;
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "props" in value) {
    return textContent(
      (value as { props: { children?: unknown } }).props.children,
    );
  }
  return "";
}
