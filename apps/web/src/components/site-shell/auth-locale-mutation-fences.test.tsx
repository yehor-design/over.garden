import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkSocial: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signInEmail: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? "opaque-token" : null),
  }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    linkSocial: mocks.linkSocial,
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    signIn: { email: mocks.signInEmail, social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));
vi.mock("@/lib/meta-marketing/client", () => ({
  trackMetaMarketingEvent: vi.fn(),
}));

import { AccountMethodsPanel } from "@/app/(default)/garden/account-methods-panel";
import { PasswordResetRequestForm } from "@/app/(default)/auth/help/password-reset-request-form";
import { ResetPasswordForm } from "@/app/(default)/auth/reset-password/reset-password-form";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

describe("auth locale mutation fences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The shared email auth panel used to be fenced here too. Since OVE-378 the
  // sign-in screen is a server form with no client mutation to fence: it posts a
  // Server Action, so there is no in-flight client promise for the locale
  // control to wait on. The remaining panels below still hold client mutations
  // and are still fenced.

  it("fences social account linking until the provider call settles", async () => {
    const request = deferred<{ error: null }>();
    mocks.linkSocial.mockReturnValue(request.promise);
    const renderer = await render(
      <AccountMethodsPanel
        canLinkGoogle
        canSetPassword={false}
        hasCredential
        hasGoogle={false}
        locale="ru"
        readbackState="ready"
      />,
    );

    await act(async () => {
      renderer.root
        .findByProps({
          "data-testid": "google-link-button",
        })
        .props.onClick();
      await Promise.resolve();
    });
    expectPending("account-method-mutation");

    await act(async () => request.resolve({ error: null }));
    expectSettled();
    await act(async () => renderer.unmount());
  });

  it("fences password-reset request until the canonical request settles", async () => {
    const request = deferred<{ error: null }>();
    mocks.requestPasswordReset.mockReturnValue(request.promise);
    const renderer = await render(<PasswordResetRequestForm locale="bg" />);
    await act(async () => {
      renderer.root.findByType("input").props.onChange({
        target: { value: "reset@example.test" },
      });
    });

    await act(async () => {
      renderer.root.findByType("button").props.onClick();
      await Promise.resolve();
    });
    expectPending("password-reset-request-mutation");

    await act(async () => request.resolve({ error: null }));
    expectSettled();
    await act(async () => renderer.unmount());
  });

  it("fences password replacement until the token mutation settles", async () => {
    const request = deferred<{ error: null }>();
    mocks.resetPassword.mockReturnValue(request.promise);
    const renderer = await render(<ResetPasswordForm locale="ru" />);
    const inputs = renderer.root.findAllByType("input");
    await act(async () => {
      inputs[0]?.props.onChange({ target: { value: "new-password-123" } });
      inputs[1]?.props.onChange({ target: { value: "new-password-123" } });
    });

    await act(async () => {
      renderer.root.findByType("button").props.onClick();
      await Promise.resolve();
    });
    expectPending("password-reset-mutation");

    await act(async () => request.resolve({ error: null }));
    expectSettled();
    await act(async () => renderer.unmount());
  });
});

async function render(node: React.ReactElement) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(node);
  });
  return renderer!;
}

function expectPending(id: string) {
  expect(interfaceLocaleChangeCoordinator.readState()).toMatchObject({
    hasInFlightMutation: true,
    inFlightParticipantIds: [id],
  });
}

function expectSettled() {
  expect(interfaceLocaleChangeCoordinator.readState().hasInFlightMutation).toBe(
    false,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
