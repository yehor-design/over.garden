import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  GardenAuthPanel,
  GoogleAccountLinkPanel,
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

  it("renders Google sign-in only when server configuration enables it", () => {
    const disabledHtml = renderToStaticMarkup(<GardenAuthPanel />);
    const enabledHtml = renderToStaticMarkup(
      <GardenAuthPanel
        googleSignInEnabled
        initialMessage="Google sign-in did not finish."
      />,
    );

    expect(disabledHtml).not.toContain("Continue with Google");
    expect(enabledHtml).toContain("Continue with Google");
    expect(enabledHtml).toContain("Google sign-in did not finish.");
    expect(enabledHtml).not.toContain("GOOGLE_CLIENT_SECRET");
  });

  it("offers explicit Google linking for the signed-in garden account", () => {
    const html = renderToStaticMarkup(
      <GoogleAccountLinkPanel googleSignInEnabled />,
    );

    expect(html).toContain("Link Google sign-in");
    expect(html).not.toContain("client_secret");
  });
});
