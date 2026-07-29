import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkSocial: vi.fn(),
  navigateToOAuthAuthorization: vi.fn(),
  setCurrentAccountPassword: vi.fn(),
  unlinkAccount: vi.fn(),
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

  it("protects the final connected method while offering a password fallback", () => {
    const html = renderToStaticMarkup(
      <AccountMethodsPanel {...DEFAULT_PROPS} hasGoogle />,
    );

    expect(html).toContain("Спершу додайте пароль або інший спосіб входу");
    expect(html).toContain('data-testid="google-unlink-button"');
    expect(html).toContain("disabled");
    expect(html).toContain('data-testid="set-password-button"');
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
