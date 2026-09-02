import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocalization: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocalization: mocks.getRequestInterfaceLocalization,
}));

vi.mock("@/app/root-document", () => ({
  RootDocument: ({
    lang,
    localization,
    children,
  }: {
    lang: string;
    localization: { locale: string; market: string } | null;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="root-document"
      data-lang={lang}
      data-localization={
        localization ? JSON.stringify(localization) : "request"
      }
    >
      {children}
    </div>
  ),
}));

describe("default root layout", () => {
  it("does not register the retired service worker for new documents", async () => {
    const source = await readFile(
      new URL("./layout.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("ServiceWorkerRegister");
    expect(source).not.toContain('from "./sw-register"');
  });

  it("localizes fallback metadata in the interface locale resolved at request time", async () => {
    mocks.getRequestInterfaceLocalization.mockResolvedValue({
      locale: "bg",
      market: "bulgaria",
    });
    const { generateMetadata } = await import("./layout");

    await expect(generateMetadata()).resolves.toMatchObject({
      title: "OverGarden",
      other: {
        "overgarden-interface-context": "bulgaria:bg",
      },
    });
  });

  it("renders a static default-locale document and resolves the shell locale at request time", async () => {
    mocks.getRequestInterfaceLocalization.mockClear();
    const { default: DefaultRootLayout } = await import("./layout");
    const html = renderToStaticMarkup(
      DefaultRootLayout({ children: <main>OverGarden</main> }),
    );

    expect(html).toContain('data-lang="uk"');
    expect(html).toContain('data-localization="request"');
    expect(html).toContain("<main>OverGarden</main>");
    expect(mocks.getRequestInterfaceLocalization).not.toHaveBeenCalled();
  });
});
