import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocalization: vi.fn(),
  getSiteShellSessionState: vi.fn(),
  hasReadyCommunityNavigation: vi.fn(),
  requestHeaders: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.requestHeaders }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocalization: mocks.getRequestInterfaceLocalization,
}));

vi.mock("@/server/site-shell-session", () => ({
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
    documentMutationGeneration,
  }: {
    children: React.ReactNode;
    locale: string;
    market: string;
    isAuthenticated: boolean;
    documentMutationGeneration: string | null;
  }) => (
    <div
      data-testid="site-shell"
      data-locale={locale}
      data-market={market}
      data-authenticated={String(isAuthenticated)}
      data-document-generation={documentMutationGeneration ?? "none"}
    >
      {children}
    </div>
  ),
}));

vi.mock("./google-analytics", () => ({ GoogleAnalytics: () => null }));
vi.mock("./meta-marketing", () => ({ MetaMarketingAttribution: () => null }));
vi.mock("./sw-register", () => ({ ServiceWorkerRegister: () => null }));

describe("root document locale", () => {
  it("exposes the real global-error boundary only through the internal visual-fixture header", async () => {
    mocks.requestHeaders.mockResolvedValue(
      new Headers({ "x-overgarden-internal-visual-global-error": "1" }),
    );
    const { default: RootLayout } = await import("./layout");

    const fixtureTree = await RootLayout({
      children: <main>must not render</main>,
    });
    expect(() => renderToStaticMarkup(fixtureTree)).toThrow(
      "Deterministic localization global-error fixture.",
    );

    mocks.requestHeaders.mockResolvedValue(new Headers());
  });

  it("localizes fallback metadata in the selected interface locale", async () => {
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      locale: "bg",
      market: "bulgaria",
    });
    const { generateMetadata } = await import("./layout");

    await expect(generateMetadata()).resolves.toMatchObject({
      title: "OverGarden",
      description:
        "Дневник за растения, животни и пчелни семейства с каталог, публични истории и общности.",
      other: {
        "overgarden-interface-context": "bulgaria:bg",
      },
    });
  });

  it("sets html lang from the resolved interface locale", async () => {
    mocks.requestHeaders.mockResolvedValue(new Headers());
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      locale: "ru",
      market: "bulgaria",
    });
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: true,
      documentMutationGeneration: "opaque-document-generation",
    });
    mocks.hasReadyCommunityNavigation.mockResolvedValue(true);
    const { default: RootLayout } = await import("./layout");
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>OverGarden</main> }),
    );

    expect(html).toContain('<html lang="ru"');
    expect(html).not.toContain('<html lang="en"');
    expect(html.match(/rel="preload"/gu)).toHaveLength(1);
    expect(html).toContain("/fonts/google-sans/v69/");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("font-geist-sans");
    expect(html).toContain('data-testid="site-shell"');
    expect(html).toContain('data-testid="locale-change-boundary"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain('data-market="bulgaria"');
    expect(html).toContain('data-authenticated="true"');
    expect(html).toContain(
      'data-document-generation="opaque-document-generation"',
    );
    expect(mocks.getSiteShellSessionState).toHaveBeenCalledTimes(1);
    expect(mocks.hasReadyCommunityNavigation).toHaveBeenCalledTimes(1);
  });
});
