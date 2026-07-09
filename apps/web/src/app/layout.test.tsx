import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("./google-analytics", () => ({ GoogleAnalytics: () => null }));
vi.mock("./meta-marketing", () => ({ MetaMarketingAttribution: () => null }));
vi.mock("./sw-register", () => ({ ServiceWorkerRegister: () => null }));

describe("root document locale", () => {
  it("sets html lang from the resolved interface locale", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootLayout } = await import("./layout");
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>OverGarden</main> }),
    );

    expect(html).toContain('<html lang="ru"');
    expect(html).not.toContain('<html lang="en"');
  });
});
