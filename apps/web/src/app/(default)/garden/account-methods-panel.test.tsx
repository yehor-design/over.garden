import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearOAuthCallbackParameters: vi.fn(),
  linkSocial: vi.fn(),
  navigateToOAuthAuthorization: vi.fn(),
  refresh: vi.fn(),
  setCurrentAccountPassword: vi.fn(),
  unlinkAccount: vi.fn(),
  handleTransportResult: vi.fn(),
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
vi.mock("@/components/auth/owner-scope", () => ({
  useOptionalOwnerScope: () => ({
    ownerUserId: "owner-a",
    headers: () => ({ "x-overgarden-owner-user-id": "owner-a" }),
    handleActionResult: mocks.handleTransportResult,
  }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    linkSocial: mocks.linkSocial,
    unlinkAccount: mocks.unlinkAccount,
  },
}));
vi.mock("@/lib/auth/social-oauth", () => ({
  clearOAuthCallbackParameters: mocks.clearOAuthCallbackParameters,
  GOOGLE_PROVIDER_ID: "google",
  navigateToOAuthAuthorization: mocks.navigateToOAuthAuthorization,
  oauthCallbackPath: () => "/garden/profile",
}));
vi.mock("./profile/account-method-actions", () => ({
  setCurrentAccountPassword: mocks.setCurrentAccountPassword,
}));

import { AccountMethodsPanel } from "./account-methods-panel";

const DEFAULT_PROPS = {
  canLinkGoogle: true,
  canSetPassword: true,
  hasCredential: false,
  hasGoogle: false,
  locale: "uk" as const,
  readbackState: "ready" as const,
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
    expect(html).not.toMatch(/facebook/i);
    expect(html).toContain("Пароль встановлено");
    expect(html).not.toMatch(/email|accountId|token|passwordHash/i);
  });

  it("keeps a connected method visible when new linking is disabled", () => {
    const html = renderToStaticMarkup(
      <AccountMethodsPanel
        {...DEFAULT_PROPS}
        canLinkGoogle={false}
        canSetPassword={false}
        hasCredential
        hasGoogle
      />,
    );

    expect(html).toContain("Підключено");
    expect(html).toContain('data-testid="google-unlink-button"');
    expect(html).not.toContain('data-testid="google-link-button"');
  });

  it("omits the Link Google control when the server projection is default-off", () => {
    const html = renderToStaticMarkup(
      <AccountMethodsPanel {...DEFAULT_PROPS} canLinkGoogle={false} />,
    );

    expect(html).not.toContain('data-testid="google-link-button"');
    expect(html).toContain('data-testid="set-password-button"');
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
      "owner-a",
    );
    expect(mocks.unlinkAccount).toHaveBeenCalledWith(
      { providerId: "google" },
      {
        headers: {
          "x-overgarden-owner-user-id": "owner-a",
        },
      },
    );
    expect(
      mocks.setCurrentAccountPassword.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.unlinkAccount.mock.invocationCallOrder[0]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("delegates a guarded account-method refresh instead of releasing private UI", async () => {
    const onMethodsChanged = vi.fn();
    mocks.setCurrentAccountPassword.mockResolvedValue({ status: "success" });
    const renderer = await render(
      <AccountMethodsPanel
        {...DEFAULT_PROPS}
        hasGoogle
        onMethodsChanged={onMethodsChanged}
      />,
    );

    await openDisconnectDialog(renderer, "google");
    await act(async () => {
      renderer.root
        .findByProps({ id: "disconnect-account-method-password" })
        .props.onChange({ target: { value: "safe-password" } });
    });
    mocks.unlinkAccount.mockResolvedValue({ error: null });
    await act(async () => {
      await submitDisconnectForm(renderer);
    });

    expect(onMethodsChanged).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
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

    expect(mocks.unlinkAccount).toHaveBeenCalledWith(
      { providerId: "google" },
      {
        headers: {
          "x-overgarden-owner-user-id": "owner-a",
        },
      },
    );
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

  it("deduplicates a pending non-final unlink", async () => {
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

  it("keeps the dialog open and routes an admission rejection to shared recovery", async () => {
    mocks.unlinkAccount.mockResolvedValue({
      error: { code: "session_account_changed" },
    });
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

    expect(mocks.handleTransportResult).toHaveBeenCalledWith({
      mutationScope: "session_account_changed",
    });
    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      1,
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
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

    expect(mocks.linkSocial).toHaveBeenCalledWith(
      {
        provider: "google",
        callbackURL: "/garden/profile",
        errorCallbackURL: "/garden/profile",
        disableRedirect: true,
      },
      {
        headers: {
          "x-overgarden-owner-user-id": "owner-a",
        },
      },
    );
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

  it("renders one bounded localized retry state and starts one fresh read-back", async () => {
    const renderer = await render(
      <AccountMethodsPanel
        {...DEFAULT_PROPS}
        canLinkGoogle={false}
        canSetPassword={false}
        readbackState="retry"
      />,
    );

    expect(
      renderer.root.findByProps({ "data-testid": "account-method-retry" }).props
        .children,
    ).toContain("Не вдалося перевірити способи входу");
    expect(
      renderer.root.findAllByProps({ "data-testid": "google-link-button" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-testid": "set-password-button" }),
    ).toHaveLength(0);

    await act(async () => {
      renderer.root
        .findByProps({ "data-testid": "account-method-retry-button" })
        .props.onClick();
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it("cleans bounded OAuth callback parameters only after the client mounts", async () => {
    const renderer = await render(<AccountMethodsPanel {...DEFAULT_PROPS} />);

    expect(mocks.clearOAuthCallbackParameters).toHaveBeenCalledOnce();
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
      expect(html).not.toMatch(/facebook/i);
      expect(html).not.toMatch(/accountId|providerId|emailVerified|token/i);
    },
  );

  it.each([
    ["uk", "Не вдалося перевірити способи входу", "Спробувати ще раз"],
    ["bg", "Начините за вход не могат да бъдат проверени", "Опитайте отново"],
    ["ru", "Не удалось проверить способы входа", "Попробовать снова"],
  ] as const)("uses the bounded %s retry copy", (locale, message, action) => {
    const html = renderToStaticMarkup(
      <AccountMethodsPanel
        {...DEFAULT_PROPS}
        canLinkGoogle={false}
        canSetPassword={false}
        locale={locale}
        readbackState="retry"
      />,
    );

    expect(html).toContain(message);
    expect(html).toContain(action);
    expect(html).not.toMatch(/accountId|providerId|emailVerified|token/i);
  });
});

async function openDisconnectDialog(
  renderer: ReactTestRenderer,
  provider: "google",
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
