import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  GardenAuthPanel,
  resolveAuthCallbackPath,
  SocialAccountLinkPanel,
} from "@/app/garden/garden-auth-panel";

import {
  existingAccountRecoveryMessage,
  interpretAuthClientErrorMessage,
  signInRecoveryHint,
} from "@/lib/auth/pilot-auth-recovery";

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
  it("maps duplicate sign-up errors to sign-in guidance instead of creating a new garden", () => {
    expect(
      interpretAuthClientErrorMessage({
        status: 422,
        message: "User already exists. use another email.",
      }),
    ).toBe(existingAccountRecoveryMessage());
  });

  it("does not treat unknown errors as duplicate-account recovery", () => {
    expect(
      interpretAuthClientErrorMessage({
        status: 500,
        message: "Database unavailable",
      }),
    ).toBe("Database unavailable");
  });

  it("keeps recovery guidance attached to invalid credential errors", () => {
    const message = interpretAuthClientErrorMessage({
      status: 401,
      message: "Invalid email or password",
    });

    expect(message).toContain(signInRecoveryHint());
  });

  it("renders social sign-in only when server configuration enables it", () => {
    const disabledHtml = renderToStaticMarkup(<GardenAuthPanel />);
    const enabledHtml = renderToStaticMarkup(
      <GardenAuthPanel
        facebookSignInEnabled
        googleSignInEnabled
        initialMessage="Social sign-in did not finish."
      />,
    );

    expect(disabledHtml).not.toContain("Continue with Google");
    expect(disabledHtml).not.toContain("Continue with Facebook");
    expect(enabledHtml).toContain("Continue with Google");
    expect(enabledHtml).toContain("Continue with Facebook");
    expect(enabledHtml).toContain("Social sign-in did not finish.");
    expect(enabledHtml).toContain('role="alert"');
    expect(enabledHtml).toContain('aria-live="polite"');
    expect(enabledHtml).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(enabledHtml).not.toContain("FACEBOOK_CLIENT_SECRET");
  });

  it("offers explicit social linking for the signed-in garden account", () => {
    const html = renderToStaticMarkup(
      <SocialAccountLinkPanel facebookSignInEnabled googleSignInEnabled />,
    );

    expect(html).toContain("Link Google sign-in");
    expect(html).toContain("Link Facebook sign-in");
    expect(html).toContain("uses it only for sign-in");
    expect(html).not.toContain("client_secret");
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

  it("can suppress local development defaults on redacted auth evidence surfaces", () => {
    const html = renderToStaticMarkup(
      <GardenAuthPanel prefillDevelopmentDefaults={false} />,
    );

    expect(html).not.toContain("gardener@over.garden");
    expect(html).not.toContain("overgarden-local-gardener");
    expect(html).not.toContain("Local Gardener");
  });

  it("uses native form semantics with sign-in as the default submit action", () => {
    const html = renderToStaticMarkup(
      <GardenAuthPanel prefillDevelopmentDefaults={false} />,
    );

    expect(html).toContain("<form");
    expect(html).toContain('type="password"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('type="button"');
  });
});
