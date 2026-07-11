import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  isFacebookSignInEnabled: vi.fn(),
  isGoogleSignInEnabled: vi.fn(),
  redirect: vi.fn(),
  verifyAuthIntentToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/lib/auth/facebook-oauth", () => ({
  isFacebookSignInEnabled: mocks.isFacebookSignInEnabled,
}));
vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: mocks.isGoogleSignInEnabled,
}));
vi.mock("@/server/auth-intent-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/auth-intent-token")
  >("@/server/auth-intent-token");
  return {
    ...actual,
    verifyAuthIntentToken: mocks.verifyAuthIntentToken,
  };
});
vi.mock("./auth-intent-surface", () => ({
  AuthIntentSurface: (props: Record<string, unknown>) => (
    <div data-testid="intent-surface">{JSON.stringify(props)}</div>
  ),
}));

describe("/auth/intent page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.isFacebookSignInEnabled.mockReturnValue(false);
    mocks.isGoogleSignInEnabled.mockReturnValue(true);
    mocks.verifyAuthIntentToken.mockReturnValue({
      version: 1,
      action: "comment",
      returnTo: "/journal/balcony-tomato-check#comments",
      target: { kind: "journal", ref: "balcony-tomato-check" },
      issuedAt: 1,
      expiresAt: 2,
    });
  });

  it("renders a verified guest intent without exposing provider secrets", async () => {
    const { default: AuthIntentPage } = await import("./page");
    const html = renderToStaticMarkup(
      await AuthIntentPage({
        searchParams: Promise.resolve({ intent: "opaque-intent-token" }),
      }),
    );

    expect(mocks.verifyAuthIntentToken).toHaveBeenCalledWith(
      "opaque-intent-token",
    );
    expect(html).toContain("intent-surface");
    expect(html).toContain("&quot;googleSignInEnabled&quot;:true");
    expect(html).not.toMatch(/GOOGLE_CLIENT_SECRET|FACEBOOK_CLIENT_SECRET/);
  });

  it("sends an already-authenticated visitor through the resume validator", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    });
    const { default: AuthIntentPage } = await import("./page");

    await AuthIntentPage({
      searchParams: Promise.resolve({ intent: "opaque-intent-token" }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth/intent/resume?intent=opaque-intent-token",
    );
  });

  it("renders invalid input as a recovery state without echoing it", async () => {
    mocks.verifyAuthIntentToken.mockImplementation(() => {
      throw new Error("invalid token details");
    });
    const { default: AuthIntentPage } = await import("./page");
    const html = renderToStaticMarkup(
      await AuthIntentPage({
        searchParams: Promise.resolve({
          intent: "tampered-private-value",
          state: "invalid",
        }),
      }),
    );

    expect(html).toContain("&quot;state&quot;:&quot;invalid&quot;");
    expect(html).not.toContain("tampered-private-value");
    expect(html).not.toContain("invalid token details");
  });
});
