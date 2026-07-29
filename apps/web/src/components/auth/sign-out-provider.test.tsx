import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canonicalSignOut: vi.fn(),
  confirmPrepared: vi.fn(),
  prepareComposer: vi.fn(),
  composerBindScope: vi.fn(),
  composerFlush: vi.fn(),
  composerResume: vi.fn(),
  pause: vi.fn(),
  abort: vi.fn(),
  summarize: vi.fn(),
  purge: vi.fn(),
  publishPreparation: vi.fn(),
  publishCancellation: vi.fn(),
  publishCommitted: vi.fn(),
  waitForSyncDrain: vi.fn(),
  renewPreparationLease: vi.fn(),
  promoteToCommitFence: vi.fn(),
  resume: vi.fn(),
  finalizeForSessionChange: vi.fn(),
  finalizeForSignedOut: vi.fn(),
  finalizeForHardReload: vi.fn(),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
  getTabId: vi.fn(),
  createBarrier: vi.fn(),
  createRoundId: vi.fn(),
  barrierWait: vi.fn(),
  barrierCancel: vi.fn(),
  locationReplace: vi.fn(),
  locationAssign: vi.fn(),
  locationReload: vi.fn(),
  flushSync: vi.fn((callback: () => void) => callback()),
  localeFormState: vi.fn(),
}));

vi.mock("react-dom", () => ({ flushSync: mocks.flushSync }));

vi.mock("@/components/site-shell/interface-locale-change-boundary", () => ({
  useInterfaceLocaleChangeFormState: mocks.localeFormState,
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
    return <button {...buttonProps} />;
  },
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
  AlertDialogContent: (props: React.ComponentProps<"div">) => (
    <div {...props} />
  ),
  AlertDialogDescription: (props: React.ComponentProps<"div">) => (
    <div {...props} />
  ),
  AlertDialogTitle: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    side?: string;
    showCloseButton?: boolean;
  }) => {
    delete props.side;
    delete props.showCloseButton;
    return <div {...props}>{children}</div>;
  },
  SheetDescription: (props: React.ComponentProps<"div">) => <div {...props} />,
  SheetFooter: (props: React.ComponentProps<"div">) => <div {...props} />,
  SheetHeader: (props: React.ComponentProps<"div">) => <div {...props} />,
  SheetTitle: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: mocks.getSession },
}));
vi.mock("@/lib/auth/sign-out-contract", () => ({
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS: {
    query: { disableCookieCache: true },
    fetchOptions: { cache: "no-store" },
  },
  localizedPublicRoot: (locale: string) =>
    locale === "uk" ? "/" : `/${locale}`,
  prepareCurrentSessionSignOut: async (result: { data?: unknown }) =>
    result.data === null
      ? null
      : { version: 1, binding: "bounded-test-binding-value-123456789012" },
  confirmPreparedCurrentSession: mocks.confirmPrepared,
  signOutCurrentSessionOnce: mocks.canonicalSignOut,
}));
vi.mock("@/lib/auth/session-convergence", () => ({
  acquireAuthenticatedSessionTabLease: mocks.acquireLease,
  getCurrentAuthenticatedSessionTabId: mocks.getTabId,
  createPreparationAcknowledgementBarrier: mocks.createBarrier,
  createPreparationRoundId: mocks.createRoundId,
  createSignOutOperationId: () => "op-provider-test-1234",
  publishSignOutPreparation: mocks.publishPreparation,
  publishSignOutPreparationCancelled: mocks.publishCancellation,
  publishCommittedSessionInvalidation: mocks.publishCommitted,
}));
vi.mock("@/lib/offline/owner-composer-participants", () => ({
  prepareOwnerComposerParticipants: mocks.prepareComposer,
}));
vi.mock("@/lib/offline/owner-session-lifecycle", () => ({
  abortOwnerSyncAttempts: mocks.abort,
  finalizeOwnerOfflineActivityForSessionChange: mocks.finalizeForSessionChange,
  pauseOwnerOfflineActivity: mocks.pause,
  purgeUnsyncedOwnerData: mocks.purge,
  summarizeUnsyncedOwnerData: mocks.summarize,
}));

import type { InterfaceLocale } from "@/lib/interface-localization";
import { SignOutProvider, useSignOut } from "./sign-out-provider";

const ZERO_SUMMARY = {
  hasUnsyncedData: false,
  totalCount: 0,
  draftCount: 0,
  mutationCount: 0,
  mediaCount: 0,
  statusCounts: { queued: 0, syncing: 0, failed: 0 },
};
const UNSYNCED_SUMMARY = {
  hasUnsyncedData: true,
  totalCount: 2,
  draftCount: 1,
  mutationCount: 1,
  mediaCount: 1,
  statusCounts: { queued: 1, syncing: 0, failed: 0 },
};
const PAUSE_SCOPE = {
  operationId: "op-provider-test-1234",
  sessionGeneration: "bounded-test-binding-value-123456789012",
};

describe("sign-out provider state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      location: {
        href: "https://over.garden/garden/profile",
        replace: mocks.locationReplace,
        assign: mocks.locationAssign,
        reload: mocks.locationReload,
      },
      setInterval: vi.fn(() => 17),
      clearInterval: vi.fn(),
    });
    mocks.getSession.mockResolvedValue({
      data: { user: { id: "owner-scope-only" } },
      error: null,
    });
    mocks.pause.mockResolvedValue({
      ...PAUSE_SCOPE,
      waitForSyncDrain: mocks.waitForSyncDrain,
      renewPreparationLease: mocks.renewPreparationLease,
      promoteToCommitFence: mocks.promoteToCommitFence,
      resume: mocks.resume,
      finalizeForSessionChange: mocks.finalizeForSessionChange,
      finalizeForSignedOut: mocks.finalizeForSignedOut,
      finalizeForHardReload: mocks.finalizeForHardReload,
    });
    mocks.prepareComposer.mockResolvedValue({
      isActive: () => true,
      bindOfflineActivityScope: mocks.composerBindScope,
      flushLatest: mocks.composerFlush,
      resume: mocks.composerResume,
    });
    mocks.acquireLease.mockReturnValue({
      tabId: "tab-provider-test-1234",
      release: mocks.releaseLease,
    });
    mocks.getTabId.mockReturnValue("tab-provider-test-1234");
    mocks.createRoundId.mockReturnValue("round-provider-test-1234");
    mocks.createBarrier.mockReturnValue({
      expectedTabCount: 0,
      wait: mocks.barrierWait,
      cancel: mocks.barrierCancel,
    });
    mocks.barrierWait.mockResolvedValue(undefined);
    mocks.confirmPrepared.mockResolvedValue({ status: "matches" });
    mocks.waitForSyncDrain.mockResolvedValue(undefined);
    mocks.composerFlush.mockResolvedValue(undefined);
    mocks.renewPreparationLease.mockResolvedValue(undefined);
    mocks.promoteToCommitFence.mockResolvedValue(undefined);
    mocks.resume.mockResolvedValue(undefined);
    mocks.finalizeForSessionChange.mockResolvedValue("fenced");
    mocks.finalizeForSignedOut.mockResolvedValue("fenced");
    mocks.finalizeForHardReload.mockResolvedValue(undefined);
    mocks.summarize.mockResolvedValue(ZERO_SUMMARY);
    mocks.purge.mockResolvedValue({
      draftCount: 0,
      mutationCount: 0,
      totalCount: 0,
    });
    mocks.canonicalSignOut.mockResolvedValue({
      status: "committed",
      reconciliation: "canonical_response",
    });
  });

  it("runs the no-data path once in pause-to-confirm order", async () => {
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
        ...PAUSE_SCOPE,
        waitForSyncDrain: async () => void order.push("drain"),
        renewPreparationLease: async () => void order.push("renew"),
        promoteToCommitFence: async () => void order.push("promote"),
        resume: mocks.resume,
        finalizeForSessionChange: mocks.finalizeForSessionChange,
        finalizeForSignedOut: async () => {
          order.push("finalize");
          return "fenced" as const;
        },
        finalizeForHardReload: mocks.finalizeForHardReload,
      };
    });
    mocks.summarize.mockImplementation(async () => {
      order.push("summary");
      return ZERO_SUMMARY;
    });
    mocks.createBarrier.mockImplementation(() => {
      order.push("barrier");
      return {
        expectedTabCount: 0,
        wait: () => {
          order.push("wait");
          return Promise.resolve();
        },
        cancel: mocks.barrierCancel,
      };
    });
    mocks.publishPreparation.mockImplementation(() => order.push("publish"));
    mocks.canonicalSignOut.mockImplementation(async () => {
      order.push("canonical");
      return { status: "committed", reconciliation: "canonical_response" };
    });
    mocks.publishCommitted.mockImplementation(() => order.push("broadcast"));
    mocks.locationReplace.mockImplementation(() => order.push("replace"));
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.createBarrier).toHaveBeenCalledWith(
      PAUSE_SCOPE.operationId,
      "tab-provider-test-1234",
      "round-provider-test-1234",
    );
    expect(mocks.publishPreparation).toHaveBeenCalledWith(
      PAUSE_SCOPE.operationId,
      "tab-provider-test-1234",
      "round-provider-test-1234",
    );
    expect(mocks.summarize).toHaveBeenCalledWith(
      "owner-scope-only",
      expect.objectContaining(PAUSE_SCOPE),
    );
    expect(mocks.composerBindScope).toHaveBeenCalledWith(
      expect.objectContaining(PAUSE_SCOPE),
    );
    expect(mocks.canonicalSignOut).toHaveBeenCalledOnce();
    expect(order).toEqual([
      "composer",
      "pause",
      "bind",
      "drain",
      "barrier",
      "wait",
      "flush",
      "renew",
      "publish",
      "summary",
      "promote",
      "canonical",
      "finalize",
      "broadcast",
      "replace",
    ]);
    expect(mocks.locationReplace).toHaveBeenCalledWith("/");
  });

  it("does not mutate before confirmation and lets cancel restore idle", async () => {
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger", { confirm: false });

    expect(button(renderer, "Вийти")).toBeDefined();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.publishPreparation).not.toHaveBeenCalled();
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();

    await click(renderer, "Залишитися в обліковому записі");

    expect(button(renderer, "trigger")).toBeDefined();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
  });

  it("locks double confirmation while owner resolution is in flight", async () => {
    let resolveSession: ((value: unknown) => void) | undefined;
    mocks.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const renderer = await renderProvider("uk");
    const trigger = button(renderer, "trigger");

    await act(async () => {
      await trigger.props.onClick();
    });
    const confirmation = renderer.root
      .findAllByType("button")
      .find((candidate) => candidate.props["data-sign-out-confirm-action"]);
    if (!confirmation) throw new Error("Missing sign-out confirmation action");
    await act(async () => {
      const first = confirmation.props.onClick();
      const second = confirmation.props.onClick();
      expect(mocks.getSession).toHaveBeenCalledOnce();
      resolveSession?.({ data: { user: { id: "owner-scope-only" } } });
      await Promise.all([first, second]);
    });

    expect(mocks.canonicalSignOut).toHaveBeenCalledOnce();
  });

  it("renders exactly three informed choices for unsynced work", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(actionLabels(renderer)).toEqual([
      "Залишитися в обліковому записі",
      "Спочатку синхронізувати",
      "Видалити локальні зміни й вийти",
    ]);
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
  });

  it("publishes a payload-free locale fence for every non-idle sign-out phase", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    const renderer = await renderProvider("uk");

    expect(mocks.localeFormState).toHaveBeenLastCalledWith({
      id: "sign-out-lifecycle",
      dirty: false,
      pending: false,
    });
    await click(renderer, "trigger");
    expect(mocks.localeFormState).toHaveBeenLastCalledWith({
      id: "sign-out-lifecycle",
      dirty: false,
      pending: true,
    });

    await click(renderer, "Залишитися в обліковому записі");
    expect(mocks.localeFormState).toHaveBeenLastCalledWith({
      id: "sign-out-lifecycle",
      dirty: false,
      pending: false,
    });
    await act(async () => renderer.unmount());
  });

  it("resumes safely for Stay and for Sync first without signing out", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    const stayRenderer = await renderProvider("uk");
    await click(stayRenderer, "trigger");
    await click(stayRenderer, "Залишитися в обліковому записі");
    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(mocks.publishCancellation).toHaveBeenCalledOnce();
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();

    vi.clearAllMocks();
    resetSuccessfulFlow(UNSYNCED_SUMMARY);
    const syncRenderer = await renderProvider("uk");
    await click(syncRenderer, "trigger");
    await click(syncRenderer, "Спочатку синхронізувати");
    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(mocks.publishCancellation).toHaveBeenCalledOnce();
    expect(mocks.locationAssign).toHaveBeenCalledWith("/garden#drafts");
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
  });

  it("keeps every tab and composer frozen when durable pause cleanup fails", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    mocks.resume.mockRejectedValue(new Error("IndexedDB cleanup failed"));
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger");

    await click(renderer, "Залишитися в обліковому записі");

    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
    expect(button(renderer, "Спробувати ще раз")).toBeDefined();
  });

  it("purges before canonical sign-out and never signs out after purge failure", async () => {
    const order: string[] = [];
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    mocks.purge.mockImplementation(async () => void order.push("purge"));
    mocks.canonicalSignOut.mockImplementation(async () => {
      order.push("canonical");
      return { status: "committed", reconciliation: "canonical_response" };
    });
    const successRenderer = await renderProvider("uk");
    await click(successRenderer, "trigger");
    await click(successRenderer, "Видалити локальні зміни й вийти");
    expect(order).toEqual(["purge", "canonical"]);
    expect(mocks.purge).toHaveBeenCalledWith(
      "owner-scope-only",
      expect.objectContaining(PAUSE_SCOPE),
    );

    vi.clearAllMocks();
    resetSuccessfulFlow(UNSYNCED_SUMMARY);
    mocks.purge.mockRejectedValue(new Error("bounded test failure"));
    const failureRenderer = await renderProvider("uk");
    await click(failureRenderer, "trigger");
    await click(failureRenderer, "Видалити локальні зміни й вийти");
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(mocks.publishCancellation).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).not.toHaveBeenCalled();
  });

  it("keeps canonical failure retryable and redirects only after confirmation", async () => {
    mocks.canonicalSignOut
      .mockResolvedValueOnce({
        status: "failed",
        reason: "session_still_active",
      })
      .mockResolvedValueOnce({
        status: "committed",
        reconciliation: "canonical_response",
      });
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");
    expect(mocks.locationReplace).not.toHaveBeenCalled();
    expect(button(renderer, "Спробувати ще раз")).toBeDefined();

    await click(renderer, "Спробувати ще раз");
    expect(mocks.canonicalSignOut).toHaveBeenCalledTimes(2);
    expect(mocks.finalizeForSignedOut).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith("/");
  });

  it("does not claim the user remains signed in when confirmation is unavailable", async () => {
    mocks.canonicalSignOut.mockResolvedValue({
      status: "failed",
      reason: "session_confirmation_unavailable",
    });
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(
      renderer.root.findAll(
        (node) =>
          node.type === "div" &&
          node.props.role === "alert" &&
          textContent(node.props.children).includes("стан сеансу"),
      ),
    ).toHaveLength(1);
    expect(
      button(renderer, "Перезавантажити й перевірити сеанс"),
    ).toBeDefined();
    expect(mocks.locationReplace).not.toHaveBeenCalled();

    await click(renderer, "Перезавантажити й перевірити сеанс");
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(
      "https://over.garden/garden/profile",
    );
  });

  it("reconciles an unknown POST against the same prepared session without creating a second operation", async () => {
    mocks.canonicalSignOut
      .mockResolvedValueOnce({
        status: "failed",
        reason: "session_confirmation_unavailable",
      })
      .mockResolvedValueOnce({
        status: "committed",
        reconciliation: "canonical_response",
      });
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");
    await click(renderer, "Спробувати ще раз");

    expect(mocks.confirmPrepared).toHaveBeenCalledOnce();
    expect(mocks.prepareComposer).toHaveBeenCalledOnce();
    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.canonicalSignOut).toHaveBeenCalledTimes(2);
    expect(mocks.finalizeForSignedOut).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith("/");
  });

  it("does not resume or cancel commit-pending work when an unknown POST document unmounts", async () => {
    mocks.canonicalSignOut.mockResolvedValue({
      status: "failed",
      reason: "session_confirmation_unavailable",
    });
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger");

    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });

    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
  });

  it.each([
    [
      "uk",
      "Видалити локальні зміни й вийти",
      "Перезавантажити й залишитися в обліковому записі",
      "Перезавантажити й перевірити сеанс",
    ],
    [
      "bg",
      "Изтриване на локалните промени и изход",
      "Презареждане и оставане в профила",
      "Презареждане и проверка на сесията",
    ],
    [
      "ru",
      "Удалить локальные изменения и выйти",
      "Перезагрузить и остаться в аккаунте",
      "Перезагрузить и проверить сеанс",
    ],
  ] as const)(
    "offers post-purge Stay in %s only when the server confirms the session remains active",
    async (locale, discardLabel, stayLabel, recheckLabel) => {
      mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
      mocks.canonicalSignOut.mockResolvedValue({
        status: "failed",
        reason: "session_still_active",
      });
      const renderer = await renderProvider(locale);
      await click(renderer, "trigger");
      await click(renderer, discardLabel);

      expect(button(renderer, stayLabel)).toBeDefined();
      expect(actionLabels(renderer)).not.toContain(recheckLabel);
      await click(renderer, stayLabel);

      expect(mocks.finalizeForHardReload).toHaveBeenCalledOnce();
      expect(mocks.resume).not.toHaveBeenCalled();
      expect(mocks.publishCancellation).toHaveBeenCalledOnce();
      expect(mocks.locationReplace).toHaveBeenCalledWith(
        "https://over.garden/garden/profile",
      );
    },
  );

  it.each([
    [
      "uk",
      "Видалити локальні зміни й вийти",
      "Перезавантажити й перевірити сеанс",
      "Перезавантажити й залишитися в обліковому записі",
    ],
    [
      "bg",
      "Изтриване на локалните промени и изход",
      "Презареждане и проверка на сесията",
      "Презареждане и оставане в профила",
    ],
    [
      "ru",
      "Удалить локальные изменения и выйти",
      "Перезагрузить и проверить сеанс",
      "Перезагрузить и остаться в аккаунте",
    ],
  ] as const)(
    "offers truthful post-purge session recheck in %s when server state is unconfirmed",
    async (locale, discardLabel, recheckLabel, stayLabel) => {
      mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
      mocks.canonicalSignOut.mockResolvedValue({
        status: "failed",
        reason: "session_confirmation_unavailable",
      });
      const renderer = await renderProvider(locale);

      await click(renderer, "trigger");
      await click(renderer, discardLabel);

      expect(mocks.purge).toHaveBeenCalledOnce();
      expect(button(renderer, recheckLabel)).toBeDefined();
      expect(actionLabels(renderer)).not.toContain(stayLabel);
      expect(mocks.locationReplace).not.toHaveBeenCalled();
    },
  );

  it("never purges A when the prepared session changed to B before discard", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    mocks.confirmPrepared.mockResolvedValue({ status: "changed" });
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger");

    await click(renderer, "Видалити локальні зміни й вийти");

    expect(mocks.confirmPrepared).toHaveBeenCalledOnce();
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
    expect(mocks.finalizeForSessionChange).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(
      "https://over.garden/garden/profile",
    );
  });

  it("never signs out B when the prepared session changes immediately after A is purged", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    mocks.confirmPrepared
      .mockResolvedValueOnce({ status: "matches" })
      .mockResolvedValueOnce({ status: "changed" });
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger");

    await click(renderer, "Видалити локальні зміни й вийти");

    expect(mocks.purge).toHaveBeenCalledOnce();
    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
    expect(mocks.finalizeForSessionChange).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(
      "https://over.garden/garden/profile",
    );
  });

  it("awaits the newest composer flush before Sync first navigates", async () => {
    mocks.summarize.mockResolvedValue(UNSYNCED_SUMMARY);
    let releaseComposer: (() => void) | undefined;
    mocks.composerResume.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseComposer = resolve;
      }),
    );
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger");
    const sync = button(renderer, "Спочатку синхронізувати");

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = sync.props.onClick();
      await Promise.resolve();
    });
    expect(mocks.locationAssign).not.toHaveBeenCalled();

    releaseComposer?.();
    await act(async () => {
      await pending;
    });
    expect(mocks.locationAssign).toHaveBeenCalledWith("/garden#drafts");
  });

  it("never sends the canonical request when the commit fence cannot be promoted", async () => {
    mocks.promoteToCommitFence.mockRejectedValue(
      new Error("commit fence unavailable"),
    );
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(mocks.canonicalSignOut).not.toHaveBeenCalled();
    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(mocks.publishCancellation).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).not.toHaveBeenCalled();
    expect(button(renderer, "Спробувати ще раз")).toBeDefined();
  });

  it("never resumes an operation when unmount overlaps commit-fence promotion", async () => {
    let releasePromotion: (() => void) | undefined;
    mocks.promoteToCommitFence.mockReturnValue(
      new Promise<void>((resolve) => {
        releasePromotion = resolve;
      }),
    );
    const renderer = await renderProvider("uk");
    await click(renderer, "trigger", { confirm: false });
    const confirmation = renderer.root
      .findAllByType("button")
      .find((candidate) => candidate.props["data-sign-out-confirm-action"]);
    if (!confirmation) throw new Error("Missing sign-out confirmation action");
    let pending: Promise<void> | undefined;

    await act(async () => {
      pending = confirmation.props.onClick();
      await vi.waitFor(() =>
        expect(mocks.promoteToCommitFence).toHaveBeenCalledOnce(),
      );
    });
    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });

    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();

    releasePromotion?.();
    await act(async () => {
      await pending;
    });
    expect(mocks.canonicalSignOut).toHaveBeenCalledOnce();
    expect(mocks.finalizeForSignedOut).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it("privacy-gates and navigates after confirmed sign-out even when IndexedDB finalization rejects", async () => {
    mocks.finalizeForSignedOut.mockRejectedValue(
      new Error("IndexedDB finalization failed"),
    );
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(mocks.canonicalSignOut).toHaveBeenCalledOnce();
    expect(mocks.finalizeForSignedOut).toHaveBeenCalledOnce();
    expect(mocks.publishCommitted).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith("/");
    expect(mocks.flushSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.locationReplace.mock.invocationCallOrder[0]!,
    );
    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "authoritative-transition",
      }),
    ).toHaveLength(1);
    expect(renderer.root.findAllByType(Probe)).toHaveLength(0);
  });

  it("fences session A and invalidates peers when canonical preflight observes session B", async () => {
    mocks.canonicalSignOut.mockResolvedValue({
      status: "failed",
      reason: "session_changed",
    });
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(mocks.finalizeForSessionChange).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.composerResume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(
      "https://over.garden/garden/profile",
    );
  });

  it("privacy-gates and reloads session B even when session A fence finalization rejects", async () => {
    mocks.canonicalSignOut.mockResolvedValue({
      status: "failed",
      reason: "session_changed",
    });
    mocks.finalizeForSessionChange.mockRejectedValue(
      new Error("IndexedDB unavailable"),
    );
    const renderer = await renderProvider("uk");

    await click(renderer, "trigger");

    expect(mocks.finalizeForSessionChange).toHaveBeenCalledOnce();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.publishCancellation).not.toHaveBeenCalled();
    expect(mocks.publishCommitted).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(
      "https://over.garden/garden/profile",
    );
    expect(mocks.flushSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.locationReplace.mock.invocationCallOrder[0]!,
    );
    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-gate": "authoritative-transition",
      }),
    ).toHaveLength(1);
    expect(renderer.root.findAllByType(Probe)).toHaveLength(0);
  });

  it.each([
    ["uk", "/"],
    ["bg", "/bg"],
    ["ru", "/ru"],
  ] as const)(
    "hard-replaces the confirmed %s session at %s",
    async (locale, root) => {
      const renderer = await renderProvider(locale);
      await click(renderer, "trigger");
      expect(mocks.locationReplace).toHaveBeenCalledWith(root);
    },
  );
});

function Probe() {
  const { phase, requestSignOut } = useSignOut();
  return (
    <button type="button" onClick={() => requestSignOut()}>
      {phase === "idle" ? "trigger" : `trigger:${phase}`}
    </button>
  );
}

async function renderProvider(locale: InterfaceLocale) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SignOutProvider locale={locale}>
        <Probe />
      </SignOutProvider>,
    );
  });
  return renderer!;
}

async function click(
  renderer: ReactTestRenderer,
  label: string,
  { confirm = true }: { confirm?: boolean } = {},
) {
  const target = button(renderer, label);
  await act(async () => {
    await target.props.onClick();
  });
  if (label !== "trigger" || !confirm) return;
  const confirmation = renderer.root
    .findAllByType("button")
    .find((candidate) => candidate.props["data-sign-out-confirm-action"]);
  if (!confirmation) throw new Error("Missing sign-out confirmation action");
  await act(async () => {
    await confirmation.props.onClick();
  });
}

function button(renderer: ReactTestRenderer, label: string) {
  const target = renderer.root
    .findAllByType("button")
    .find((candidate) => textContent(candidate.props.children) === label);
  if (!target) throw new Error(`Missing test button: ${label}`);
  return target;
}

function actionLabels(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType("button")
    .map((candidate) => textContent(candidate.props.children))
    .filter((label) => label !== "trigger:waiting-for-choice");
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

function resetSuccessfulFlow(summary = ZERO_SUMMARY) {
  mocks.getSession.mockResolvedValue({
    data: { user: { id: "owner-scope-only" } },
    error: null,
  });
  mocks.pause.mockResolvedValue({
    ...PAUSE_SCOPE,
    waitForSyncDrain: mocks.waitForSyncDrain,
    renewPreparationLease: mocks.renewPreparationLease,
    promoteToCommitFence: mocks.promoteToCommitFence,
    resume: mocks.resume,
    finalizeForSessionChange: mocks.finalizeForSessionChange,
    finalizeForSignedOut: mocks.finalizeForSignedOut,
    finalizeForHardReload: mocks.finalizeForHardReload,
  });
  mocks.prepareComposer.mockResolvedValue({
    isActive: () => true,
    bindOfflineActivityScope: mocks.composerBindScope,
    flushLatest: mocks.composerFlush,
    resume: mocks.composerResume,
  });
  mocks.acquireLease.mockReturnValue({
    tabId: "tab-provider-test-1234",
    release: mocks.releaseLease,
  });
  mocks.getTabId.mockReturnValue("tab-provider-test-1234");
  mocks.createRoundId.mockReturnValue("round-provider-test-1234");
  mocks.createBarrier.mockReturnValue({
    expectedTabCount: 0,
    wait: mocks.barrierWait,
    cancel: mocks.barrierCancel,
  });
  mocks.barrierWait.mockResolvedValue(undefined);
  mocks.confirmPrepared.mockResolvedValue({ status: "matches" });
  mocks.waitForSyncDrain.mockResolvedValue(undefined);
  mocks.composerFlush.mockResolvedValue(undefined);
  mocks.renewPreparationLease.mockResolvedValue(undefined);
  mocks.promoteToCommitFence.mockResolvedValue(undefined);
  mocks.resume.mockResolvedValue(undefined);
  mocks.finalizeForSessionChange.mockResolvedValue("fenced");
  mocks.finalizeForSignedOut.mockResolvedValue("fenced");
  mocks.finalizeForHardReload.mockResolvedValue(undefined);
  mocks.summarize.mockResolvedValue(summary);
  mocks.purge.mockResolvedValue({
    draftCount: 0,
    mutationCount: 0,
    totalCount: 0,
  });
  mocks.canonicalSignOut.mockResolvedValue({
    status: "committed",
    reconciliation: "canonical_response",
  });
}
