import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  getSiteShellSessionState: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));

vi.mock("@/components/site-shell/site-shell", () => ({
  SiteShell: ({
    children,
    locale,
    isAuthenticated,
  }: {
    children: React.ReactNode;
    locale: string;
    isAuthenticated: boolean;
  }) => (
    <div
      data-testid="site-shell"
      data-locale={locale}
      data-authenticated={String(isAuthenticated)}
    >
      {children}
    </div>
  ),
}));

vi.mock("./google-analytics", () => ({ GoogleAnalytics: () => null }));
vi.mock("./meta-marketing", () => ({ MetaMarketingAttribution: () => null }));
vi.mock("./sw-register", () => ({ ServiceWorkerRegister: () => null }));

describe("root document locale", () => {
  it("localizes fallback metadata in the selected interface locale", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { generateMetadata } = await import("./layout");

    await expect(generateMetadata()).resolves.toMatchObject({
      title: "OverGarden",
      description:
        "Дневник за растения, животни и пчелни семейства с каталог, публични истории и общности.",
    });
  });

  it("sets html lang from the resolved interface locale", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: true,
    });
    const { default: RootLayout } = await import("./layout");
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>OverGarden</main> }),
    );

    expect(html).toContain('<html lang="ru"');
    expect(html).not.toContain('<html lang="en"');
    expect(html).toContain('data-testid="site-shell"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain('data-authenticated="true"');
    expect(mocks.getSiteShellSessionState).toHaveBeenCalledTimes(1);
  });
});
