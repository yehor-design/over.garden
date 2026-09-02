import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocalization: vi.fn(),
  getSiteShellSessionState: vi.fn(),
  hasReadyCommunityNavigation: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocalization: mocks.getRequestInterfaceLocalization,
}));
vi.mock("@/server/site-shell-session", () => ({
  GUEST_SITE_SHELL_SESSION_STATE: {
    isAuthenticated: false,
    ownerUserId: null,
    hasOperatorAccess: false,
  },
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));
vi.mock("@/server/community-repository", () => ({
  hasReadyCommunityNavigation: mocks.hasReadyCommunityNavigation,
}));
vi.mock("@/components/site-shell/interface-locale-change-boundary", () => ({
  InterfaceLocaleChangeBoundary: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="locale-change-boundary">{children}</div>,
}));
vi.mock("@/components/site-shell/site-shell", () => ({
  SiteShell: ({
    children,
    locale,
    market,
    isAuthenticated,
    ownerUserId,
    communitiesReady,
  }: {
    children: React.ReactNode;
    locale: string;
    market: string;
    isAuthenticated: boolean;
    ownerUserId: string | null;
    communitiesReady: boolean;
  }) => (
    <div
      data-testid="site-shell"
      data-locale={locale}
      data-market={market}
      data-authenticated={String(isAuthenticated)}
      data-owner={ownerUserId ?? "none"}
      data-communities={String(communitiesReady)}
    >
      {children}
    </div>
  ),
}));
vi.mock("@/app/google-analytics", () => ({ GoogleAnalytics: () => null }));
vi.mock("@/app/meta-marketing", () => ({
  MetaMarketingAttribution: () => null,
}));

import { RootDocument, RootDocumentShell } from "./root-document";

describe("root document", () => {
  it("renders a static html and body with the fonts and a loading fallback", () => {
    const html = renderToStaticMarkup(
      <RootDocument
        lang="bg"
        localization={{ locale: "bg", market: "bulgaria" }}
      >
        <main>OverGarden</main>
      </RootDocument>,
    );

    expect(html).toContain('<html lang="bg"');
    expect(html).toContain("--font-google-sans");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain('data-site-shell-state="loading"');
  });

  it("streams the shell with the session and the route localization", async () => {
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: true,
      ownerUserId: "private-user-id",
      hasOperatorAccess: false,
    });
    mocks.hasReadyCommunityNavigation.mockResolvedValue(true);

    const html = renderToStaticMarkup(
      await RootDocumentShell({
        localization: { locale: "ru", market: "bulgaria" },
        children: <main>OverGarden</main>,
      }),
    );

    expect(html).toContain('lang="ru"');
    expect(html).toContain('data-owner-user-id="private-user-id"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain('data-market="bulgaria"');
    expect(html).toContain('data-authenticated="true"');
    expect(html).toContain('data-owner="private-user-id"');
    expect(html).toContain('data-communities="true"');
    expect(mocks.getRequestInterfaceLocalization).not.toHaveBeenCalled();
  });

  it("resolves the interface locale at request time for unprefixed routes and hides the owner attribute from guests", async () => {
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      locale: "bg",
      market: "bulgaria",
    });
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
    });
    mocks.hasReadyCommunityNavigation.mockRejectedValue(new Error("db down"));

    const html = renderToStaticMarkup(
      await RootDocumentShell({
        localization: null,
        children: <main>OverGarden</main>,
      }),
    );

    expect(html).toContain('lang="bg"');
    expect(html).not.toContain("data-owner-user-id");
    expect(html).toContain('data-authenticated="false"');
    expect(html).toContain('data-communities="false"');
  });
});
