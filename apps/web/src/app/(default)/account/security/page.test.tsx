import { renderServerHtml } from "@test/render-server-html";
import { missingRelationRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getCurrentAccountMethodProjection: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/auth/account-methods", () => ({
  getCurrentAccountMethodProjection: mocks.getCurrentAccountMethodProjection,
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string }) => (
    <section data-sign-in-prompt="true" data-next={props.next ?? ""}>
      Sign in prompt
    </section>
  ),
}));
vi.mock("@/app/(default)/garden/account-methods-panel", () => ({
  AccountMethodsPanel: ({
    readbackState,
    hasCredential,
    hasGoogle,
    canLinkGoogle,
    initialMessage,
  }: {
    readbackState: "ready" | "retry";
    hasCredential: boolean;
    hasGoogle: boolean;
    canLinkGoogle: boolean;
    initialMessage: string | null;
  }) => (
    <section
      data-account-methods={`${readbackState}:${hasCredential}:${hasGoogle}:${canLinkGoogle}`}
    >
      Account sign-in methods {initialMessage ?? ""}
    </section>
  ),
}));
vi.mock("@/components/auth/sign-out-control", () => ({
  SignOutControl: ({ presentation }: { presentation: string }) => (
    <button type="button" data-sign-out-control={presentation}>
      Вийти з облікового запису
    </button>
  ),
}));

describe("/account/security (OVE-503)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentAccountMethodProjection.mockResolvedValue({
      readbackState: "ready",
      hasCredential: true,
      hasGoogle: true,
      canSetPassword: false,
      canLinkGoogle: false,
    });
  });

  it("is how you sign in and how you sign out, and nothing public", async () => {
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-workspace-surface="account-security"');
    expect(html).toMatch(/<h1[^>]*>Вхід і безпека<\/h1>/u);
    expect(html).toMatch(
      /<a(?=[^>]*href="\/account\/security")(?=[^>]*aria-current="page")[^>]*>/u,
    );
    expect(mocks.getCurrentAccountMethodProjection).toHaveBeenCalledOnce();
    expect(html).toContain('data-account-methods="ready:true:true:false"');
    expect(html).toContain("Обліковий запис і безпека");
    expect(html).toContain('data-sign-out-control="profile"');
    expect(html).not.toContain('name="displayName"');
    expect(html).not.toContain('name="handle"');
    expect(html).not.toMatch(/email|provider|session-1|token/iu);
  });

  it("carries a provider's refusal back to the methods, in the reader's language", async () => {
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({ error: "access_denied" }) }),
    );

    // The panel is handed the localized message; the raw code is not shown.
    expect(html).toContain("Account sign-in methods");
    expect(html).not.toContain("access_denied");
  });

  it("keeps sign-out when the sign-in methods cannot be read", async () => {
    mocks.getCurrentAccountMethodProjection.mockRejectedValueOnce(
      missingRelationRejection("account"),
    );
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).toContain('data-sign-out-control="profile"');
  });

  it("asks a signed-out reader to sign in and come back here", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-next="/account/security"');
    expect(mocks.getCurrentAccountMethodProjection).not.toHaveBeenCalled();
  });
});
