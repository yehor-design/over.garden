import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  announce: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));
vi.mock("@/lib/auth/session-signal", () => ({
  announceSessionSignal: mocks.announce,
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
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div role="alertdialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

import { SignOutProvider, useSignOut } from "./sign-out-provider";

function Trigger() {
  const { phase, requestSignOut } = useSignOut();
  return (
    <button data-phase={phase} onClick={requestSignOut}>
      out
    </button>
  );
}

describe("sign-out provider (ADR-0022, D6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { replace: mocks.replace } });
    mocks.signOut.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirms once, revokes the session, announces the exit, and replaces the location with home", async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <SignOutProvider locale="bg">
          <Trigger />
        </SignOutProvider>,
      );
    });
    const trigger = () => renderer!.root.findByProps({ children: "out" });
    expect(renderer!.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      0,
    );

    await act(async () => trigger().props.onClick());
    expect(renderer!.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      1,
    );
    expect(mocks.signOut).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.root
        .findByProps({ "data-sign-out-confirm-action": "true" })
        .props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.announce).toHaveBeenCalledWith({
      type: "signed_out",
      ownerUserId: null,
    });
    expect(mocks.replace).toHaveBeenCalledWith("/bg");
    await act(async () => renderer!.unmount());
  });

  it("still leaves when the sign-out call itself fails", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("network"));
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <SignOutProvider locale="uk">
          <Trigger />
        </SignOutProvider>,
      );
    });
    await act(async () =>
      renderer!.root.findByProps({ "data-phase": "idle" }).props.onClick(),
    );
    await act(async () => {
      renderer!.root
        .findByProps({ "data-sign-out-confirm-action": "true" })
        .props.onClick();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.announce).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/");
    await act(async () => renderer!.unmount());
  });
});
