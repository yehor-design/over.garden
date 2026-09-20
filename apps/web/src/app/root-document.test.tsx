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
    sessionStore: "reachable",
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
    session,
    communitiesReady,
  }: {
    children: React.ReactNode;
    locale: string;
    market?: string;
    session:
      | { isAuthenticated: boolean; ownerUserId: string | null }
      | Promise<unknown>;
    communitiesReady: boolean;
  }) => {
    const pending = typeof (session as Promise<unknown>).then === "function";
    const value = pending
      ? null
      : (session as { isAuthenticated: boolean; ownerUserId: string | null });
    return (
      <div
        data-testid="site-shell"
        data-locale={locale}
        data-market={market ?? "none"}
        data-session={pending ? "pending" : "value"}
        data-authenticated={String(value?.isAuthenticated ?? false)}
        data-owner={value?.ownerUserId ?? "none"}
        data-communities={String(communitiesReady)}
      >
        {children}
      </div>
    );
  },
}));
vi.mock("@/app/google-analytics", () => ({
  // The consent banner is this component's only visible output. Standing in
  // for it with a marker is what lets the placement be asserted without
  // pulling `next/script` and a client store into a server render.
  GoogleAnalytics: () => (
    <div
      data-analytics-consent-banner="true"
      className="analytics-consent-banner"
    />
  ),
  // A static document draws the notice itself, outside the tags' boundary
  // (ADR-0032 D7); the tags mount after hydration and render nothing here.
  AnalyticsConsentNotice: () => (
    <div
      data-analytics-consent-banner="true"
      data-analytics-consent-notice="document"
      className="analytics-consent-banner"
    />
  ),
}));
vi.mock("@/app/meta-marketing", () => ({
  MetaMarketingAttribution: () => null,
}));

import {
  RequestDocumentShell,
  RequestRootDocument,
  StaticDocumentShell,
  StaticRootDocument,
} from "./root-document";

describe("the static document", () => {
  it("renders html, body and the fonts with no loading fallback in front of the page", () => {
    // The async chrome cannot run under `renderToStaticMarkup`; what matters
    // here is what is *not* between `<body>` and the chrome: the boundary that
    // put every public page inside `<div hidden>` (`OVE-461`).
    mocks.getSiteShellSessionState.mockReturnValue(new Promise(() => undefined));
    const element = StaticRootDocument({
      locale: "bg",
      children: <main>OverGarden</main>,
    });
    const html = renderToStaticMarkup(
      <element.type {...element.props}>{null}</element.type>,
    );

    expect(html).toContain('<html lang="bg"');
    expect(html).toContain("--font-google-sans");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain('data-site-shell-state="loading"');
  });

  it("hands the shell the session as a promise it never awaited", async () => {
    // A promise that never settles: were the document to await it, this test
    // would hang rather than fail, which is the honest reading of the defect.
    const session = new Promise<never>(() => undefined);
    mocks.hasReadyCommunityNavigation.mockResolvedValue(true);

    const html = renderToStaticMarkup(
      await StaticDocumentShell({
        locale: "ru",
        session,
        children: <main>OverGarden</main>,
      }),
    );

    expect(html).toContain('lang="ru"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain('data-session="pending"');
    expect(html).toContain('data-market="none"');
    expect(html).toContain('data-communities="true"');
    // A static document is served to a guest and to a gardener alike.
    expect(html).not.toContain("data-owner-user-id");
    expect(html).toContain("<main>OverGarden</main>");
    expect(mocks.getRequestInterfaceLocalization).not.toHaveBeenCalled();
  });

  it("puts the consent banner beside the shell, never inside the content column", async () => {
    mocks.hasReadyCommunityNavigation.mockResolvedValue(false);

    const html = renderToStaticMarkup(
      await StaticDocumentShell({
        locale: "uk",
        session: new Promise<never>(() => undefined),
        children: <main>OverGarden</main>,
      }),
    );

    // `OVE-447` criterion 7. The banner is a sibling of the shell and
    // `position: fixed` (its geometry is asserted in `globals.test.ts`), so it
    // is out of flow and contributes nothing to CLS — the page's largest shift
    // risk turns out not to be a shift risk at all. What it *was* doing wrong
    // is covered by the offset that now clears the mobile tab bar.
    const shellAt = html.indexOf('data-testid="site-shell"');
    const bannerAt = html.indexOf('data-analytics-consent-banner="true"');
    expect(shellAt).toBeGreaterThan(-1);
    expect(bannerAt).toBeGreaterThan(shellAt);
    expect(html).toContain("analytics-consent-banner");
    // The shell's element closes before the banner opens, so the banner is
    // not nested in the content column — where a block element would push the
    // first card down the moment consent resolved.
    expect(html.slice(shellAt, bannerAt)).toContain("</div>");
  });
});

describe("the request-time document", () => {
  it("keeps the loading fallback in front of a workspace page", () => {
    const html = renderToStaticMarkup(
      <RequestRootDocument lang="uk">
        <main>OverGarden</main>
      </RequestRootDocument>,
    );

    expect(html).toContain('<html lang="uk"');
    expect(html).toContain('data-site-shell-state="loading"');
  });

  it("resolves the reader's locale, market and session per request", async () => {
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      locale: "ru",
      market: "bulgaria",
    });
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: true,
      ownerUserId: "private-user-id",
      hasOperatorAccess: false,
      sessionStore: "reachable",
    });
    mocks.hasReadyCommunityNavigation.mockResolvedValue(true);

    const html = renderToStaticMarkup(
      await RequestDocumentShell({ children: <main>OverGarden</main> }),
    );

    expect(html).toContain('lang="ru"');
    expect(html).toContain('data-owner-user-id="private-user-id"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain('data-market="bulgaria"');
    expect(html).toContain('data-session="value"');
    expect(html).toContain('data-authenticated="true"');
    expect(html).toContain('data-owner="private-user-id"');
    expect(html).toContain('data-communities="true"');
  });

  it("hides the owner attribute from guests and survives a failed readiness read", async () => {
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      locale: "bg",
      market: "bulgaria",
    });
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
      sessionStore: "reachable",
    });
    mocks.hasReadyCommunityNavigation.mockRejectedValue(new Error("db down"));

    const html = renderToStaticMarkup(
      await RequestDocumentShell({ children: <main>OverGarden</main> }),
    );

    expect(html).toContain('lang="bg"');
    expect(html).not.toContain("data-owner-user-id");
    expect(html).toContain('data-authenticated="false"');
    expect(html).toContain('data-communities="false"');
  });
});
