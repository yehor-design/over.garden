import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBlockedSessionAccountMethods: vi.fn(),
  getSession: vi.fn(),
  prepareCurrentSessionSignOut: vi.fn(),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  buttonVariants: () => "button-variant",
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: mocks.getSession },
}));
vi.mock("@/lib/auth/sign-out-contract", () => ({
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS: {
    query: { disableCookieCache: true },
    fetchOptions: { cache: "no-store" },
  },
  prepareCurrentSessionSignOut: mocks.prepareCurrentSessionSignOut,
}));
vi.mock("./blocked-session-account-method-actions", () => ({
  getBlockedSessionAccountMethods: mocks.getBlockedSessionAccountMethods,
}));
vi.mock("@/app/garden/account-methods-panel", () => ({
  AccountMethodsPanel: ({
    facebookSignInEnabled,
    googleSignInEnabled,
    hasCredential,
    hasFacebook,
    hasGoogle,
    onMethodsChanged,
  }: {
    facebookSignInEnabled: boolean;
    googleSignInEnabled: boolean;
    hasCredential: boolean;
    hasFacebook: boolean;
    hasGoogle: boolean;
    onMethodsChanged(): void;
  }) => (
    <button
      type="button"
      data-blocked-methods={`${hasCredential}:${hasFacebook}:${hasGoogle}`}
      data-blocked-linking={`${facebookSignInEnabled}:${googleSignInEnabled}`}
      onClick={onMethodsChanged}
    >
      Guarded methods
    </button>
  ),
}));

import { BlockedSessionAccountMethods } from "./blocked-session-account-methods";

describe("blocked session account methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.getSession.mockResolvedValue({
      data: { session: { id: "session-a" } },
    });
    mocks.prepareCurrentSessionSignOut.mockResolvedValue({
      version: 1,
      binding: "binding-for-session-a",
    });
    mocks.getBlockedSessionAccountMethods.mockResolvedValue({
      status: "ready",
      methods: {
        hasCredential: false,
        hasFacebook: false,
        hasGoogle: true,
        canSetPassword: true,
      },
    });
  });

  it("does not request any account-method state before the explicit control", async () => {
    const renderer = await render();

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getBlockedSessionAccountMethods).not.toHaveBeenCalled();
    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-account-methods-open": "true",
      }),
    ).not.toHaveLength(0);
    const erasureLinks = renderer.root
      .findAllByType("a")
      .filter(
        (link) =>
          link.props["data-session-convergence-erasure-request"] === "true",
      );
    expect(erasureLinks).toHaveLength(1);
    expect(erasureLinks[0]?.props.href).toBe("/erasure");
    await unmount(renderer);
  });

  it("binds the explicit request and renders the boolean projection without linking", async () => {
    const renderer = await render();
    await openMethods(renderer);

    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
      fetchOptions: { cache: "no-store" },
    });
    expect(mocks.getBlockedSessionAccountMethods).toHaveBeenCalledWith(
      "binding-for-session-a",
    );
    await vi.waitFor(() =>
      expect(
        renderer.root.findAllByProps({
          "data-blocked-methods": "false:false:true",
        }),
      ).not.toHaveLength(0),
    );
    expect(
      renderer.root.findAllByProps({ "data-blocked-linking": "false:false" }),
    ).not.toHaveLength(0);
    await unmount(renderer);
  });

  it("keeps a generic bounded receipt when the action cannot prove the session", async () => {
    mocks.getBlockedSessionAccountMethods.mockResolvedValueOnce({
      status: "unavailable",
    });
    const renderer = await render();
    await openMethods(renderer);

    expect(
      renderer.root.findAllByProps({
        "data-session-convergence-account-methods-unavailable": "true",
      }),
    ).toHaveLength(1);
    expect(
      renderer.root.findAllByProps({
        "data-blocked-methods": expect.anything(),
      }),
    ).toHaveLength(0);
    await unmount(renderer);
  });

  it("deduplicates a pending request and discards its completion after the deadline", async () => {
    vi.useFakeTimers();
    const delayed = deferred<{
      status: "ready";
      methods: {
        hasCredential: boolean;
        hasFacebook: boolean;
        hasGoogle: boolean;
        canSetPassword: boolean;
      };
    }>();
    mocks.getBlockedSessionAccountMethods
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce({
        status: "ready",
        methods: {
          hasCredential: true,
          hasFacebook: false,
          hasGoogle: false,
          canSetPassword: false,
        },
      });
    const renderer = await render();
    const open = renderer.root.findByProps({
      "data-session-convergence-account-methods-open": "true",
    });

    await act(async () => {
      open.props.onClick();
      open.props.onClick();
      await Promise.resolve();
    });
    expect(mocks.getBlockedSessionAccountMethods).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const retry = renderer.root.findByProps({
      "data-session-convergence-account-methods-open": "true",
    });
    await act(async () => {
      retry.props.onClick();
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(
        renderer.root.findAllByProps({
          "data-blocked-methods": "true:false:false",
        }),
      ).not.toHaveLength(0),
    );

    await act(async () => {
      delayed.resolve({
        status: "ready",
        methods: {
          hasCredential: false,
          hasFacebook: false,
          hasGoogle: true,
          canSetPassword: true,
        },
      });
      await Promise.resolve();
    });
    expect(
      renderer.root.findAllByProps({
        "data-blocked-methods": "true:false:false",
      }),
    ).not.toHaveLength(0);
    await unmount(renderer);
    vi.useRealTimers();
  });
});

async function render() {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<BlockedSessionAccountMethods locale="uk" />);
    await Promise.resolve();
  });
  return renderer!;
}

async function openMethods(renderer: ReactTestRenderer) {
  const open = renderer.root.findByProps({
    "data-session-convergence-account-methods-open": "true",
  });
  await act(async () => {
    open.props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => renderer.unmount());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
