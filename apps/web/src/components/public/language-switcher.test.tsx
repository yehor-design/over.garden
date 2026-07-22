import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/bg/journals",
  navigations: [] as Array<{
    href: string;
    referrerPolicy: string;
    rel: string;
    target: string;
  }>,
  dispatchPageHide: true,
  safeFragmentIds: new Set<string>(),
  unmarkedFragmentIds: new Set<string>(),
  referrerMetas: [] as Array<{
    name: string;
    content: string;
    removed: boolean;
    remove(): void;
  }>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange(open: boolean): void;
  }) =>
    open ? (
      <div
        role="alertdialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onOpenChange(false);
        }}
      >
        {children}
      </div>
    ) : null,
  AlertDialogContent: ({
    children,
  }: {
    children: React.ReactNode;
    initialFocus?: unknown;
    finalFocus?: unknown;
  }) => <div data-alert-dialog-content>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogClose: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/menu", async () => {
  const { cloneElement } = await import("react");
  return {
    Menu: ({
      children,
      disabled,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
    }) => <div data-menu-disabled={disabled || undefined}>{children}</div>,
    MenuTrigger: ({
      render,
      children,
    }: {
      render: React.ReactElement<Record<string, unknown>>;
      children: React.ReactNode;
    }) => cloneElement(render, {}, children),
    MenuContent: ({ children }: { children: React.ReactNode }) => (
      <div data-menu-content>{children}</div>
    ),
    MenuRadioGroup: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => (
      <div role="radiogroup" data-value={value}>
        {children}
      </div>
    ),
    MenuRadioItem: ({
      render,
      children,
      disabled,
      value,
    }: {
      render: React.ReactElement<Record<string, unknown>>;
      children: React.ReactNode;
      disabled?: boolean;
      value: string;
    }) =>
      cloneElement(
        render,
        {
          role: "menuitemradio",
          "data-menu-value": value,
          "aria-disabled": disabled || undefined,
        },
        children,
      ),
  };
});

import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";
import {
  InterfaceLanguageControl,
  LanguageSwitcher,
} from "./language-switcher";

describe("interface language control", () => {
  beforeEach(() => {
    mocks.pathname = "/bg/journals";
    mocks.navigations.length = 0;
    mocks.dispatchPageHide = true;
    mocks.safeFragmentIds.clear();
    mocks.unmarkedFragmentIds.clear();
    mocks.referrerMetas.length = 0;
    vi.stubGlobal("window", browserWindow());
    vi.stubGlobal("document", navigationDocument());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the compatibility alias bound to the canonical application control", () => {
    expect(LanguageSwitcher).toBe(InterfaceLanguageControl);
  });

  it("returns no node, landmark, or layout space for the Ukraine market", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <InterfaceLanguageControl locale="uk" market="ukraine" />,
      );
    });

    expect(renderer!.toJSON()).toBeNull();
    await act(async () => renderer!.unmount());
  });

  it("renders one native bg/ru radio menu with the current language selected", async () => {
    const renderer = await renderControl();
    const nav = renderer.root.findByType("nav");
    const anchors = renderer.root.findAllByType("a");

    expect(nav.props["data-interface-language-control"]).toBe(
      "site-shell-interface-language-control",
    );
    expect(nav.props["aria-label"]).toBe("Избор на език на интерфейса");
    expect(anchors.map((anchor) => anchor.props.lang)).toEqual(["bg", "ru"]);
    expect(
      anchors.find((anchor) => anchor.props.lang === "bg")?.props[
        "aria-current"
      ],
    ).toBe("true");
    expect(
      renderer.root.findByProps({ role: "radiogroup" }).props["data-value"],
    ).toBe("bg");
    await act(async () => renderer.unmount());
  });

  it("keeps the single Bulgaria control visible but inert for an outer safety gate", async () => {
    const renderer = await renderControl({ externallyDisabled: true });

    expect(
      renderer.root.findByType("nav").props["data-interface-language-control"],
    ).toBe("site-shell-interface-language-control");
    expect(
      renderer.root.findByProps({ "data-menu-disabled": true }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({
        "data-interface-language-trigger": "true",
      }).props.disabled,
    ).toBe(true);

    await act(async () => renderer.unmount());
  });

  it("uses a safe ordinary localized anchor and adds a safe hash at click time", async () => {
    window.location.search = "?q=rose&token=private&sort=recent";
    window.location.hash = "#old-fragment";
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    expect(russianAnchor?.props.href).toBe("/ru/journals?sort=recent");
    expect(russianAnchor?.props.rel).toBe("noreferrer");
    expect(russianAnchor?.props.referrerPolicy).toBe("no-referrer");
    expect(russianAnchor?.props.href).not.toContain("token");
    expect(russianAnchor?.props.href).not.toContain("#old-fragment");
    window.location.hash = "#main-content";
    mocks.safeFragmentIds.add("main-content");
    const preventDefault = vi.fn();
    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault });
    });
    await vi.waitFor(() =>
      expect(mocks.navigations).toContainEqual({
        href: "/ru/journals?sort=recent#main-content",
        referrerPolicy: "no-referrer",
        rel: "noreferrer",
        target: "_self",
      }),
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it.each(["#entry-404", "#token%3Dv1.secret"])(
    "drops an unsafe or nonexistent client fragment %s",
    async (fragment) => {
      window.location.hash = fragment;
      const renderer = await renderControl();
      const russianAnchor = renderer.root
        .findAllByType("a")
        .find((anchor) => anchor.props.lang === "ru");

      await act(async () => {
        russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      });
      await vi.waitFor(() => expect(mocks.navigations).toHaveLength(1));
      expect(mocks.navigations[0]?.href).toBe("/ru/journals");
      await act(async () => renderer.unmount());
    },
  );

  it("drops an existing but unmarked internal-looking fragment", async () => {
    window.location.hash = "#passport-entry-internal-123";
    mocks.unmarkedFragmentIds.add("passport-entry-internal-123");
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(mocks.navigations).toHaveLength(1));
    expect(mocks.navigations[0]?.href).toBe("/ru/journals");
    await act(async () => renderer.unmount());
  });

  it("posts only the locale and hard-reloads the exact same-path URL without a referrer", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    window.location.search = "?token=private&returnTo=%2Fadmin";
    window.location.hash = "#current-local-fragment";
    vi.mocked(fetch).mockResolvedValue({
      status: 204,
      redirected: false,
    } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(fetch).toHaveBeenCalledWith("/api/interface/locale", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: '{"locale":"ru"}',
      signal: expect.any(AbortSignal),
    });
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string),
    ).toEqual({ locale: "ru" });
    expect(mocks.navigations).toHaveLength(0);
    expect(window.location.reload).toHaveBeenCalledOnce();
    expect(window.location).toMatchObject({
      pathname: "/garden/profile",
      search: "?token=private&returnTo=%2Fadmin",
      hash: "#current-local-fragment",
    });
    expect(mocks.referrerMetas).toEqual([
      expect.objectContaining({
        name: "referrer",
        content: "no-referrer",
        removed: false,
      }),
    ]);
    expect(window.location.assign).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("clears the preference watchdog after a normal 204 response", async () => {
    vi.useFakeTimers();
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    vi.mocked(fetch).mockResolvedValue({
      status: 204,
      redirected: false,
    } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledOnce();
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(signal?.aborted).toBe(false);
    await act(async () => renderer.unmount());
  });

  it("rolls an unknown timed-out preference request back to the exact original locale", async () => {
    vi.useFakeTimers();
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "preference-timeout-rollback",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });
    vi.mocked(fetch)
      .mockImplementationOnce((_input, init) => rejectWhenAborted(init?.signal))
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBe('{"locale":"ru"}');
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(resume).toHaveBeenCalledOnce();
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    unregister();
    await act(async () => renderer.unmount());
  });

  it("keeps the product fence frozen when both target and rollback requests time out", async () => {
    vi.useFakeTimers();
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "preference-double-timeout",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });
    vi.mocked(fetch)
      .mockImplementationOnce((_input, init) => rejectWhenAborted(init?.signal))
      .mockImplementationOnce((_input, init) => rejectWhenAborted(init?.signal))
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(resume).not.toHaveBeenCalled();
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe(
      "preparing",
    );
    expect(window.location.reload).not.toHaveBeenCalled();
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Опитайте отново"));
    expect(retry).toBeDefined();

    // Resolve the retained recovery only to keep the shared coordinator clean
    // for the next isolated test.
    await act(async () => {
      retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    unregister();
    await act(async () => renderer.unmount());
  });

  it("retries the original-locale rollback and resumes the frozen fence after success", async () => {
    vi.useFakeTimers();
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "preference-timeout-retry",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });
    vi.mocked(fetch)
      .mockImplementationOnce((_input, init) => rejectWhenAborted(init?.signal))
      .mockImplementationOnce((_input, init) => rejectWhenAborted(init?.signal))
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Опитайте отново"));

    await act(async () => {
      retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(vi.mocked(fetch).mock.calls[2]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(resume).toHaveBeenCalledOnce();
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    expect(window.location.reload).not.toHaveBeenCalled();
    unregister();
    await act(async () => renderer.unmount());
  });

  it("does not commit the locale request when the final durable seal fails", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "final-seal-failure",
      kind: "safe-flush",
      prepare: async () => ({
        flushLatest: async () => undefined,
        sealForDocumentReplacement: async () => {
          throw new Error("durable generation rejected");
        },
        resume,
      }),
    });
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle"),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    unregister();
    await act(async () => renderer.unmount());
  });

  it("seals the latest durable generation before starting the locale POST", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const order: string[] = [];
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "ordered-final-seal",
      kind: "safe-flush",
      prepare: async () => ({
        sealForDocumentReplacement: async () => {
          order.push("sealed-latest");
        },
        resume: async () => undefined,
      }),
    });
    vi.mocked(fetch).mockImplementation(async () => {
      order.push("locale-post");
      return { status: 204, redirected: false } as Response;
    });
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() =>
      expect(window.location.reload).toHaveBeenCalledOnce(),
    );

    expect(order).toEqual(["sealed-latest", "locale-post"]);
    unregister();
    await act(async () => renderer.unmount());
  });

  it("removes the temporary referrer policy when a hard reload never starts", async () => {
    vi.useFakeTimers();
    mocks.dispatchPageHide = false;
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    vi.mocked(fetch).mockResolvedValue({
      status: 204,
      redirected: false,
    } as Response);
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "canceled-hard-reload",
      kind: "safe-flush",
      prepare: async () => ({
        sealForDocumentReplacement: async () => undefined,
        resume,
      }),
    });
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(window.location.reload).toHaveBeenCalledOnce(),
    );
    expect(mocks.referrerMetas[0]?.removed).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(window.stop).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(resume).toHaveBeenCalledOnce();
    expect(mocks.referrerMetas[0]?.removed).toBe(true);
    unregister();
    await act(async () => renderer.unmount());
    vi.useRealTimers();
  });

  it("keeps the product fence frozen until a canceled reload rollback can be retried", async () => {
    vi.useFakeTimers();
    mocks.dispatchPageHide = false;
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    vi.mocked(fetch)
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response)
      .mockResolvedValueOnce({ status: 503, redirected: false } as Response)
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "retry-canceled-hard-reload",
      kind: "safe-flush",
      prepare: async () => ({
        sealForDocumentReplacement: async () => undefined,
        resume,
      }),
    });
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(resume).not.toHaveBeenCalled();
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe(
      "preparing",
    );
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Опитайте отново"));
    await act(async () => {
      retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[2]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(resume).toHaveBeenCalledOnce();
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    unregister();
    await act(async () => renderer.unmount());
    vi.useRealTimers();
  });

  it("keeps a stale post-commit gate frozen when preference rollback fails", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const preferenceRequest = deferredResponse();
    vi.mocked(fetch)
      .mockReturnValueOnce(preferenceRequest.promise)
      .mockResolvedValueOnce({ status: 503, redirected: false } as Response)
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");
    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const unregisterMutation = interfaceLocaleChangeCoordinator.register({
      id: "late-rollback-retry-mutation",
      kind: "in-flight",
    });
    await act(async () => {
      preferenceRequest.resolve({ status: 204, redirected: false } as Response);
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe(
      "preparing",
    );
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Опитайте отново"));
    await act(async () => {
      retry?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(vi.mocked(fetch).mock.calls[2]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    expect(window.location.reload).not.toHaveBeenCalled();
    unregisterMutation();
    await act(async () => renderer.unmount());
  });

  it("requires fresh confirmation when a dirty epoch appears during the final seal", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    let releaseSeal: (() => void) | undefined;
    const sealBlocked = new Promise<void>((resolve) => {
      releaseSeal = resolve;
    });
    const sealStarted = vi.fn();
    const unregisterSafe = interfaceLocaleChangeCoordinator.register({
      id: "held-final-seal",
      kind: "safe-flush",
      prepare: async () => ({
        sealForDocumentReplacement: async () => {
          sealStarted();
          await sealBlocked;
        },
        resume: async () => undefined,
      }),
    });
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");
    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(sealStarted).toHaveBeenCalledOnce());
    const discard = vi.fn(async () => undefined);
    const unregisterDirty = interfaceLocaleChangeCoordinator.register({
      id: "late-auth-edit",
      kind: "dirty-confirmation",
      discard,
    });
    await act(async () => releaseSeal?.());

    await vi.waitFor(() =>
      expect(renderer.root.findByType("h2").children).toEqual([
        "Отхвърляне на незапазените промени?",
      ]),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    unregisterDirty();
    unregisterSafe();
    await act(async () => renderer.unmount());
  });

  it("rolls preference back and blocks handoff when a mutation starts during POST", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    const preferenceRequest = deferredResponse();
    vi.mocked(fetch)
      .mockReturnValueOnce(preferenceRequest.promise)
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");
    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const unregisterMutation = interfaceLocaleChangeCoordinator.register({
      id: "late-auth-mutation",
      kind: "in-flight",
    });
    await act(async () => {
      preferenceRequest.resolve({ status: 204, redirected: false } as Response);
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(renderer.root.findByProps({ role: "status" }).children).toEqual([
      "Изчакайте текущото действие да завърши, преди да смените езика.",
    ]);
    expect(mocks.navigations).toHaveLength(0);
    unregisterMutation();
    await act(async () => renderer.unmount());
  });

  it("rolls preference back when the live canonical URL changes during POST", async () => {
    mocks.pathname = "/garden/profile";
    window.location.pathname = "/garden/profile";
    window.location.search = "?token=private-before";
    window.location.hash = "#private-before";
    const preferenceRequest = deferredResponse();
    vi.mocked(fetch)
      .mockReturnValueOnce(preferenceRequest.promise)
      .mockResolvedValueOnce({ status: 204, redirected: false } as Response);
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "canonical-location-race",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });
    const renderer = await renderControl({ pathname: "/garden/profile" });
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    window.location.pathname = "/garden";
    window.location.search = "?token=private-after";
    window.location.hash = "#private-after";
    await act(async () => {
      preferenceRequest.resolve({ status: 204, redirected: false } as Response);
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBe('{"locale":"ru"}');
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe('{"locale":"bg"}');
    expect(resume).toHaveBeenCalledOnce();
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    unregister();
    await act(async () => renderer.unmount());
  });

  it("cancels a localized handoff when the live route changes during preparation", async () => {
    let releasePreparation: (() => void) | undefined;
    const preparationBlocked = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    const preparationStarted = vi.fn();
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "localized-route-prepare-race",
      kind: "safe-flush",
      prepare: async () => {
        preparationStarted();
        await preparationBlocked;
        return { resume };
      },
    });
    window.location.search = "?sort=recent&token=private-before";
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(preparationStarted).toHaveBeenCalledOnce());
    window.location.pathname = "/bg/guides/new-route";
    window.location.search = "?token=private-after";
    window.location.hash = "#private-after";
    await act(async () => releasePreparation?.());

    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    unregister();
    await act(async () => renderer.unmount());
  });

  it("cancels a localized handoff when query or fragment changes during the final seal", async () => {
    let releaseSeal: (() => void) | undefined;
    const sealBlocked = new Promise<void>((resolve) => {
      releaseSeal = resolve;
    });
    const sealStarted = vi.fn();
    const resume = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "localized-location-seal-race",
      kind: "safe-flush",
      prepare: async () => ({
        sealForDocumentReplacement: async () => {
          sealStarted();
          await sealBlocked;
        },
        resume,
      }),
    });
    window.location.search = "?sort=recent";
    window.location.hash = "#main-content";
    mocks.safeFragmentIds.add("main-content");
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(sealStarted).toHaveBeenCalledOnce());
    window.location.search = "?sort=oldest&token=private-after";
    window.location.hash = "#private-after";
    await act(async () => releaseSeal?.());

    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    unregister();
    await act(async () => renderer.unmount());
  });

  it("recovers the sealed fence when a document replacement never starts", async () => {
    vi.useFakeTimers();
    mocks.dispatchPageHide = false;
    const resume = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("recovery still blocked"))
      .mockResolvedValue(undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "canceled-document-replacement",
      kind: "safe-flush",
      prepare: async () => ({
        sealForDocumentReplacement: async () => undefined,
        resume,
      }),
    });
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(resume).toHaveBeenCalledOnce();
    expect(window.stop).toHaveBeenCalledOnce();
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe(
      "preparing",
    );
    expect(renderer.root.findByProps({ role: "status" }).children).toEqual([
      "Промените не можаха да се запазят преди смяната на езика. Опитайте отново.",
    ]);
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Опитайте отново"));
    await act(async () => retry?.props.onClick());
    expect(resume).toHaveBeenCalledTimes(2);
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    unregister();
    await act(async () => renderer.unmount());
    vi.useRealTimers();
  });

  it("preserves dirty state when the localized dialog chooses cancel", async () => {
    const discard = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "private-profile-fields",
      kind: "dirty-confirmation",
      discard,
    });
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    const dialog = await vi.waitFor(() =>
      renderer.root.findByProps({ role: "alertdialog" }),
    );
    expect(dialog.findByType("h2").children).toEqual([
      "Отхвърляне на незапазените промени?",
    ]);
    expect(dialog.findByType("p").children).toEqual([
      "Незапазените промени ще бъдат загубени. Да продължи ли смяната на езика?",
    ]);
    const cancel = dialog
      .findAllByType("button")
      .find((button) => button.children.includes("Отказ"));
    await act(async () => cancel?.props.onClick());

    expect(discard).not.toHaveBeenCalled();
    expect(mocks.navigations).toHaveLength(0);
    expect(
      interfaceLocaleChangeCoordinator.readState().requiresDirtyConfirmation,
    ).toBe(true);
    unregister();
    await act(async () => renderer.unmount());
  });

  it("keeps discard confirmation actionable when a new mutation temporarily blocks it", async () => {
    const discard = vi.fn(async () => undefined);
    const unregisterDirty = interfaceLocaleChangeCoordinator.register({
      id: "dirty-confirmation-mutation-race",
      kind: "dirty-confirmation",
      discard,
    });
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => renderer.root.findByProps({ role: "alertdialog" }));
    let unregisterMutation: () => void = () => undefined;
    await act(async () => {
      unregisterMutation = interfaceLocaleChangeCoordinator.register({
        id: "late-confirmation-mutation",
        kind: "in-flight",
      });
    });

    let dialog = renderer.root.findByProps({ role: "alertdialog" });
    let discardAction = dialog
      .findAllByType("button")
      .find((button) => button.children.includes("Отхвърли и смени езика"));
    const cancelAction = dialog
      .findAllByType("button")
      .find((button) => button.children.includes("Отказ"));
    expect(discardAction?.props.disabled).toBe(true);
    expect(cancelAction?.props.disabled).not.toBe(true);
    await act(async () => discardAction?.props.onClick());
    expect(discard).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      1,
    );

    await act(async () => unregisterMutation());
    dialog = renderer.root.findByProps({ role: "alertdialog" });
    discardAction = dialog
      .findAllByType("button")
      .find((button) => button.children.includes("Отхвърли и смени езика"));
    expect(discardAction?.props.disabled).not.toBe(true);
    await act(async () => discardAction?.props.onClick());
    await vi.waitFor(() => expect(mocks.navigations).toHaveLength(1));
    expect(discard).toHaveBeenCalledOnce();

    unregisterDirty();
    await act(async () => renderer.unmount());
  });

  it("closes on Escape, then continues only from the localized discard action", async () => {
    const discard = vi.fn(async () => undefined);
    const unregister = interfaceLocaleChangeCoordinator.register({
      id: "private-note-form",
      kind: "dirty-confirmation",
      discard,
    });
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    let dialog = await vi.waitFor(() =>
      renderer.root.findByProps({ role: "alertdialog" }),
    );
    await act(async () => dialog.props.onKeyDown({ key: "Escape" }));
    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      0,
    );
    expect(discard).not.toHaveBeenCalled();

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    dialog = await vi.waitFor(() =>
      renderer.root.findByProps({ role: "alertdialog" }),
    );
    const discardAction = dialog
      .findAllByType("button")
      .find((button) => button.children.includes("Отхвърли и смени езика"));
    await act(async () => discardAction?.props.onClick());
    await vi.waitFor(() => expect(mocks.navigations).toHaveLength(1));

    expect(discard).toHaveBeenCalledOnce();
    unregister();
    await act(async () => renderer.unmount());
  });

  it("shows localized pending and failure states without navigating", async () => {
    const unregisterPending = interfaceLocaleChangeCoordinator.register({
      id: "profile-save-mutation",
      kind: "in-flight",
    });
    const pendingRenderer = await renderControl();
    const pendingStatus = pendingRenderer.root.findByProps({ role: "status" });
    expect(pendingStatus.children).toEqual([
      "Изчакайте текущото действие да завърши, преди да смените езика.",
    ]);
    expect(pendingStatus.parent?.props.className).toContain("max-w-72");
    expect(pendingStatus.parent?.props.className).toContain("absolute");
    expect(mocks.navigations).toHaveLength(0);
    unregisterPending();
    await act(async () => pendingRenderer.unmount());

    const unregisterFailure = interfaceLocaleChangeCoordinator.register({
      id: "failing-draft-flush",
      kind: "safe-flush",
      prepare: async () => {
        throw new Error("private failure detail");
      },
    });
    const failedRenderer = await renderControl();
    const russianAnchor = failedRenderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");
    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() =>
      expect(
        failedRenderer.root.findByProps({ role: "status" }).children,
      ).toEqual([
        "Промените не можаха да се запазят преди смяната на езика. Опитайте отново.",
      ]),
    );
    expect(mocks.navigations).toHaveLength(0);
    unregisterFailure();
    await act(async () => failedRenderer.unmount());
  });

  it("keeps a stopped-preparation recovery retryable from localized UI", async () => {
    const resume = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("first rollback failed"))
      .mockResolvedValue(undefined);
    const unregisterPrepared = interfaceLocaleChangeCoordinator.register({
      id: "prepared-before-failure",
      kind: "safe-flush",
      prepare: async () => ({ resume }),
    });
    const unregisterFailure = interfaceLocaleChangeCoordinator.register({
      id: "later-prepare-failure",
      kind: "safe-flush",
      prepare: async () => {
        throw new Error("durable flush rejected");
      },
    });
    const renderer = await renderControl();
    const russianAnchor = renderer.root
      .findAllByType("a")
      .find((anchor) => anchor.props.lang === "ru");

    await act(async () => {
      russianAnchor?.props.onClick({ preventDefault: vi.fn() });
    });
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe(
      "preparing",
    );
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Опитайте отново"));
    await act(async () => retry?.props.onClick());

    expect(resume).toHaveBeenCalledTimes(2);
    expect(interfaceLocaleChangeCoordinator.readState().phase).toBe("idle");
    expect(mocks.navigations).toHaveLength(0);
    unregisterPrepared();
    unregisterFailure();
    await act(async () => renderer.unmount());
  });
});

async function renderControl(
  props: Partial<React.ComponentProps<typeof InterfaceLanguageControl>> = {},
) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <InterfaceLanguageControl locale="bg" market="bulgaria" {...props} />,
    );
  });
  return renderer!;
}

function browserWindow() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const dispatch = (name: string, event: unknown) => {
    for (const listener of listeners.get(name) ?? []) listener(event);
  };
  return {
    addEventListener(name: string, listener: (event: unknown) => void) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    },
    removeEventListener(name: string, listener: (event: unknown) => void) {
      listeners.get(name)?.delete(listener);
    },
    setTimeout(callback: TimerHandler, delay?: number) {
      return setTimeout(callback, delay);
    },
    clearTimeout(timeoutId: number) {
      clearTimeout(timeoutId);
    },
    stop: vi.fn(),
    __dispatch: dispatch,
    location: {
      origin: "https://over.garden",
      href: "https://over.garden/bg/journals",
      pathname: "/bg/journals",
      search: "",
      hash: "",
      assign: vi.fn(),
      reload: vi.fn(() => {
        if (mocks.dispatchPageHide) {
          dispatch("pagehide", { persisted: false });
        }
      }),
    },
  };
}

function navigationDocument() {
  return {
    querySelector(selector: string) {
      if (selector !== 'meta[name="referrer"]') return null;
      return mocks.referrerMetas.find((meta) => !meta.removed) ?? null;
    },
    getElementById(id: string) {
      if (mocks.safeFragmentIds.has(id)) {
        return {
          id,
          dataset: { interfaceLocaleFragmentSafe: "true" },
        };
      }
      if (mocks.unmarkedFragmentIds.has(id)) return { id, dataset: {} };
      return null;
    },
    createElement(name: string) {
      if (name === "meta") {
        const meta = {
          name: "",
          content: "",
          removed: false,
          remove() {
            meta.removed = true;
          },
        };
        return meta;
      }
      if (name !== "a") throw new Error(`Unexpected element: ${name}`);
      const anchor = {
        href: "",
        rel: "",
        referrerPolicy: "",
        target: "",
        hidden: false,
        click() {
          mocks.navigations.push({
            href: anchor.href,
            referrerPolicy: anchor.referrerPolicy,
            rel: anchor.rel,
            target: anchor.target,
          });
          if (mocks.dispatchPageHide) {
            (
              window as typeof window & {
                __dispatch(name: string, event: unknown): void;
              }
            ).__dispatch("pagehide", { persisted: false });
          }
        },
        remove: vi.fn(),
      };
      return anchor;
    },
    body: { append: vi.fn() },
    head: {
      append(meta: (typeof mocks.referrerMetas)[number]) {
        mocks.referrerMetas.push(meta);
      },
    },
  };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function rejectWhenAborted(signal: AbortSignal | null | undefined) {
  if (!signal) return Promise.reject(new Error("Abort signal unavailable."));
  return new Promise<Response>((_resolve, reject) => {
    const rejectAbort = () =>
      reject(new DOMException("Preference request timed out.", "AbortError"));
    if (signal.aborted) {
      rejectAbort();
      return;
    }
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
}
