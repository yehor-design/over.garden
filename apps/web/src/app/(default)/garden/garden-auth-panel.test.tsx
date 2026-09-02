import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  GardenAuthPanel,
  resolveAuthCallbackPath,
  runNativeValidatedAuthAction,
} from "@/app/(default)/garden/garden-auth-panel";

import {
  getLocalizedAuthClientErrorMessage,
  getLocalizedEmailSignUpResult,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    linkSocial: vi.fn(),
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
  },
}));

describe("garden auth duplicate-account avoidance", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "uses the same neutral %s result for generic success and an explicit duplicate",
    (locale) => {
      const success = getLocalizedEmailSignUpResult(locale, null);
      const duplicate = getLocalizedEmailSignUpResult(locale, {
        status: 422,
        message: "User already exists. use another email.",
      });

      expect(success).toEqual({
        kind: "accepted",
        message: getTrustSurfaceCopy(locale).authPanel.signUpRequestAccepted,
      });
      expect(duplicate).toEqual(success);
      expect(success.message.toLowerCase()).not.toMatch(
        /створено|създаден|создан|надіслано|изпратено|отправлено/,
      );
    },
  );

  it("does not emit account-created analytics from an indistinguishable email sign-up response", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(default)/garden/garden-auth-panel.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('trackMetaMarketingEvent("signup_started"');
    expect(source).not.toContain('trackMetaMarketingEvent("account_created"');
  });

  it("does not treat unknown errors as duplicate-account recovery", () => {
    expect(
      getLocalizedAuthClientErrorMessage("uk", {
        status: 500,
        message: "Database unavailable",
      }),
    ).toBeNull();
    expect(
      getLocalizedEmailSignUpResult("uk", {
        status: 500,
        message: "Database unavailable",
      }),
    ).toEqual({
      kind: "error",
      message: getTrustSurfaceCopy("uk").authPanel.createAccountError,
    });
    expect(
      getLocalizedEmailSignUpResult("uk", {
        status: 422,
        message: "Failed to create user",
      }),
    ).toEqual({
      kind: "error",
      message: getTrustSurfaceCopy("uk").authPanel.createAccountError,
    });
  });

  it("keeps recovery guidance attached to invalid credential errors", () => {
    const message = getLocalizedAuthClientErrorMessage("ru", {
      status: 401,
      message: "Invalid email or password",
    });

    expect(message).toContain("Неверный адрес электронной почты или пароль");
    expect(message).not.toContain("Invalid email or password");
  });

  it.each(["uk", "bg", "ru"] as const)(
    "renders Google-only social sign-in for %s when server configuration enables it",
    (locale) => {
      const disabledHtml = renderToStaticMarkup(<GardenAuthPanel />);
      const enabledHtml = renderToStaticMarkup(
        <GardenAuthPanel
          googleSignInEnabled
          initialMessage="Соціальний вхід не завершився."
          locale={locale}
        />,
      );

      expect(disabledHtml).not.toContain("Continue with Google");
      expect(enabledHtml).toContain("Google");
      expect(enabledHtml).not.toMatch(/facebook/i);
      expect(enabledHtml).toContain("Соціальний вхід не завершився.");
      expect(enabledHtml).toContain('role="alert"');
      expect(enabledHtml).toContain('aria-live="assertive"');
      expect(enabledHtml).not.toContain("GOOGLE_CLIENT_SECRET");
    },
  );

  it("owns guest provider navigation explicitly instead of relying on the redirect plugin", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(default)/garden/garden-auth-panel.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("disableRedirect: true");
    expect(source).toContain(
      "navigateToOAuthAuthorization(provider, data?.url)",
    );
  });

  it("uses the validated intent resume path for email and social auth", () => {
    expect(
      resolveAuthCallbackPath(
        "/auth/intent/resume?intent=opaque-intent-token",
        { pathname: "/auth/intent", search: "?intent=ignored" },
      ),
    ).toBe("/auth/intent/resume?intent=opaque-intent-token");
    expect(
      resolveAuthCallbackPath(null, {
        pathname: "/garden",
        search: "?source=homepage&error=provider_error",
      }),
    ).toBe("/garden?source=homepage");
  });

  it("never embeds shared development identity defaults", () => {
    const html = renderToStaticMarkup(<GardenAuthPanel />);

    expect(html).not.toMatch(/value="[^"]+@/);
    expect(html).not.toMatch(/type="password"[^>]+value="[^"]+"/);
  });

  it("uses native form semantics with sign-in as the default submit action", () => {
    const html = renderToStaticMarkup(<GardenAuthPanel />);

    expect(html).toContain("<form");
    expect(html).toContain('type="password"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('type="button"');
  });

  it("does not invoke email sign-up until native credential validity passes", () => {
    const action = vi.fn();
    const reportValidity = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const form = { reportValidity };

    expect(runNativeValidatedAuthAction(form, action)).toBe(false);
    expect(reportValidity).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();

    expect(runNativeValidatedAuthAction(form, action)).toBe(true);
    expect(reportValidity).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenCalledOnce();
  });

  it.each([
    ["uk", "Ім'я для нового облікового запису"],
    ["bg", "Име за новия профил"],
    ["ru", "Имя для нового аккаунта"],
  ] as const)(
    "never asks for a name or nickname during %s authentication",
    (locale, removedNameLabel) => {
      const html = renderToStaticMarkup(<GardenAuthPanel locale={locale} />);

      expect(html).toContain('type="email"');
      expect(html).toContain('type="password"');
      expect(html).not.toContain('type="text"');
      expect(html).not.toContain('autoComplete="name"');
      expect(html).not.toContain(removedNameLabel);
    },
  );

  it("does not derive an auth compatibility name from the email address in the client", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(default)/garden/garden-auth-panel.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("authClient.signUp.email");
    expect(source).not.toMatch(/newAccountName|defaultName|split\(["']@["']\)/);
  });
});
