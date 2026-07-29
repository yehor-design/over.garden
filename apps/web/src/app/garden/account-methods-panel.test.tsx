import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkSocial: vi.fn(),
  navigateToOAuthAuthorization: vi.fn(),
  refresh: vi.fn(),
  setCurrentAccountPassword: vi.fn(),
  unlinkAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
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
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-alert-dialog-content>{children}</div>
  ),
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
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    linkSocial: mocks.linkSocial,
    unlinkAccount: mocks.unlinkAccount,
  },
}));
vi.mock("@/lib/auth/social-oauth", () => ({
  FACEBOOK_PROVIDER_ID: "facebook",
  GOOGLE_PROVIDER_ID: "google",
  navigateToOAuthAuthorization: mocks.navigateToOAuthAuthorization,
  oauthCallbackPath: () => "/garden/profile",
}));
vi.mock("./profile/account-method-actions", () => ({
  setCurrentAccountPassword: mocks.setCurrentAccountPassword,
}));

import { AccountMethodsPanel } from "./account-methods-panel";

const DEFAULT_PROPS = {
  canSetPassword: true,
  facebookSignInEnabled: true,
  googleSignInEnabled: true,
  hasCredential: false,
  hasFacebook: false,
  hasGoogle: false,
  locale: "uk" as const,
};

describe("account methods panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.navigateToOAuthAuthorization.mockReturnValue(true);
  });

  it("renders connected methods as disconnectable state rather than connect controls", () => {
    const html = renderToStaticMarkup(
      <AccountMethodsPanel
        {...DEFAULT_PROPS}
        canSetPassword={false}
        hasCredential
        hasGoogle
      />,
    );

    expect(html).toContain("Підключено");
    expect(html).toContain("Відв&#x27;язати Google");
    expect(html).not.toContain("Підключити Google");
    expect(html).toContain("Підключити Facebook");
    expect(html).toContain("Пароль встановлено");
    expect(html).not.toMatch(/email|accountId|token|passwordHash/i);
  });

  it("keeps the final connected method actionable while explaining its password bridge", () => {
    const html = renderToStaticMarkup(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasGoogle />,
    );

    expect(html).toContain("Створіть пароль у наступному кроці");
    expect(html).toContain('data-testid="google-unlink-button"');
    expect(html).not.toMatch(/data-testid="google-unlink-button"[^>]*disabled/);
    expect(html).toContain('data-testid="set-password-button"');
  });

  it("creates the credential fallback before unlinking the selected final provider", async () => {
    mocks.setCurrentAccountPassword.mockResolvedValue({ status: "success" });
    mocks.unlinkAccount.mockResolvedValue({ error: null });
    const renderer = await render(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasGoogle />,
    );

    await openDisconnectDialog(renderer, "google");
    expect(mocks.unlinkAccount).not.toHaveBeenCalled();
    expect(
      renderer.root.findByProps({
        id: "disconnect-account-method-password",
      }).props.disabled,
    ).toBe(false);

    await act(async () => {
      renderer.root
        .findByProps({ id: "disconnect-account-method-password" })
        .props.onChange({ target: { value: "safe-password" } });
    });
    await act(async () => {
      await submitDisconnectForm(renderer);
    });

    expect(mocks.setCurrentAccountPassword).toHaveBeenCalledTimes(1);
    expect(mocks.setCurrentAccountPassword).toHaveBeenCalledWith(
      "safe-password",
    );
    expect(mocks.unlinkAccount).toHaveBeenCalledWith({ providerId: "google" });
    expect(
      mocks.setCurrentAccountPassword.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.unlinkAccount.mock.invocationCallOrder[0]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("retains both methods and shows a generic receipt when final-provider unlink fails after password creation", async () => {
    mocks.setCurrentAccountPassword.mockResolvedValue({ status: "success" });
    mocks.unlinkAccount.mockResolvedValue({ error: { code: "UNLINK_FAILED" } });
    const renderer = await render(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasGoogle />,
    );

    await openDisconnectDialog(renderer, "google");
    await act(async () => {
      renderer.root
        .findByProps({ id: "disconnect-account-method-password" })
        .props.onChange({ target: { value: "safe-password" } });
    });
    await act(async () => {
      await submitDisconnectForm(renderer);
    });

    expect(mocks.setCurrentAccountPassword).toHaveBeenCalledOnce();
    expect(mocks.unlinkAccount).toHaveBeenCalledOnce();
    expect(
      renderer.root.findByProps({ "data-testid": "disconnect-dialog-message" })
        .props.children,
    ).toContain("Пароль створено, але Google не відв'язано");
    expect(
      renderer.root.findAllByProps({
        "data-testid": "password-and-disconnect-button",
      }),
    ).toHaveLength(0);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("offers an actionable but no-mutation recovery dialog to an ineligible final social account", async () => {
    const renderer = await render(
      <AccountMethodsPanel
        {...DEFAULT_PROPS}
        canSetPassword={false}
        hasGoogle
      />,
    );

    await openDisconnectDialog(renderer, "google");

    expect(
      renderer.root
        .findAllByType("h2")
        .some((heading) =>
          String(heading.props.children).includes(
            "Збережіть доступ перед відв'язуванням Google",
          ),
        ),
    ).toBe(true);
    expect(
      renderer.root
        .findAllByType("p")
        .some((paragraph) =>
          String(paragraph.props.children).includes(
            "Спершу підтвердьте адресу",
          ),
        ),
    ).toBe(true);
    expect(
      renderer.root.findAllByProps({
        "data-testid": "password-and-disconnect-button",
      }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({
        "data-testid": "confirm-disconnect-button",
      }),
    ).toHaveLength(0);
    expect(mocks.setCurrentAccountPassword).not.toHaveBeenCalled();
    expect(mocks.unlinkAccount).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("requires explicit confirmation before unlinking a non-final provider", async () => {
    mocks.unlinkAccount.mockResolvedValue({ error: null });
    const renderer = await render(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasCredential hasGoogle />,
    );

    await openDisconnectDialog(renderer, "google");
    expect(mocks.unlinkAccount).not.toHaveBeenCalled();
    expect(
      renderer.root.findByProps({ "data-testid": "confirm-disconnect-button" })
        .props.disabled,
    ).toBe(false);

    await act(async () => {
      renderer.root
        .findByProps({ "data-testid": "confirm-disconnect-button" })
        .props.onClick();
      await Promise.resolve();
    });

    expect(mocks.unlinkAccount).toHaveBeenCalledWith({ providerId: "google" });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("cancels a final-provider dialog without creating a credential or unlinking", async () => {
    const renderer = await render(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasGoogle />,
    );

    await openDisconnectDialog(renderer, "google");
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Скасувати")!
        .props.onClick();
    });

    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      0,
    );
    expect(mocks.setCurrentAccountPassword).not.toHaveBeenCalled();
    expect(mocks.unlinkAccount).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("cancels with Escape without creating a credential or unlinking", async () => {
    const renderer = await render(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasGoogle />,
    );

    await openDisconnectDialog(renderer, "google");
    await act(async () => {
      renderer.root
        .findByProps({ role: "alertdialog" })
        .props.onKeyDown({ key: "Escape" });
    });

    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      0,
    );
    expect(mocks.setCurrentAccountPassword).not.toHaveBeenCalled();
    expect(mocks.unlinkAccount).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("deduplicates a pending non-final unlink while leaving another provider control usable", async () => {
    const unlink = deferred<{ error: null }>();
    mocks.unlinkAccount.mockReturnValue(unlink.promise);
    const renderer = await render(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasCredential hasGoogle />,
    );

    await openDisconnectDialog(renderer, "google");
    await act(async () => {
      renderer.root
        .findByProps({ "data-testid": "confirm-disconnect-button" })
        .props.onClick();
      await Promise.resolve();
    });

    expect(mocks.unlinkAccount).toHaveBeenCalledOnce();
    expect(
      renderer.root.findByProps({ "data-testid": "facebook-link-button" }).props
        .disabled,
    ).toBe(false);
    expect(
      renderer.root.findByProps({ "data-testid": "confirm-disconnect-button" })
        .props.disabled,
    ).toBe(true);

    await act(async () => {
      renderer.root
        .findByProps({ "data-testid": "confirm-disconnect-button" })
        .props.onClick();
    });
    expect(mocks.unlinkAccount).toHaveBeenCalledOnce();

    await act(async () => {
      unlink.resolve({ error: null });
      await Promise.resolve();
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("restores the failed provider action while unrelated controls remain operable during a provider timeout", async () => {
    const link = deferred<{
      data: { url: string };
      error: null;
    }>();
    mocks.linkSocial.mockReturnValue(link.promise);
    const renderer = await render(<AccountMethodsPanel {...DEFAULT_PROPS} />);

    await act(async () => {
      renderer.root
        .findByProps({ "data-testid": "google-link-button" })
        .props.onClick();
      await Promise.resolve();
    });

    expect(mocks.linkSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/garden/profile",
      errorCallbackURL: "/garden/profile",
      disableRedirect: true,
    });
    expect(
      renderer.root.findByProps({ "data-testid": "facebook-link-button" }).props
        .disabled,
    ).toBe(false);
    expect(
      renderer.root.findByProps({ "data-testid": "set-password-button" }).props
        .disabled,
    ).toBe(false);

    await act(async () => {
      link.reject(new Error("provider authorization timeout"));
      await Promise.resolve();
    });
    expect(
      renderer.root.findByProps({ "data-testid": "google-link-button" }).props
        .disabled,
    ).toBe(false);
    expect(
      renderer.root.findByProps({ "data-testid": "account-method-message" })
        .props.children,
    ).toContain("Не вдалося підключити Google");
    expect(mocks.navigateToOAuthAuthorization).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it.each([
    ["uk", "Способи входу", "Створити пароль"],
    ["bg", "Начини за вход", "Създаване на парола"],
    ["ru", "Способы входа", "Создать пароль"],
  ] as const)(
    "uses the complete %s account-method copy without exposing identity fields",
    (locale, title, passwordAction) => {
      const html = renderToStaticMarkup(
        <AccountMethodsPanel {...DEFAULT_PROPS} locale={locale} />,
      );

      expect(html).toContain(title);
      expect(html).toContain(passwordAction);
      expect(html).not.toMatch(/accountId|providerId|emailVerified|token/i);
    },
  );
});

async function openDisconnectDialog(
  renderer: ReactTestRenderer,
  provider: "google" | "facebook",
) {
  await act(async () => {
    renderer.root
      .findByProps({ "data-testid": `${provider}-unlink-button` })
      .props.onClick({ currentTarget: {} as HTMLButtonElement });
  });
}

async function submitDisconnectForm(renderer: ReactTestRenderer) {
  const form = renderer.root.findAllByType("form").find(
    (candidate) =>
      candidate.findAllByProps({
        id: "disconnect-account-method-password",
      }).length === 1,
  );
  await form!.props.onSubmit({ preventDefault: vi.fn() });
}

async function render(node: React.ReactElement) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(node);
  });
  return renderer!;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
