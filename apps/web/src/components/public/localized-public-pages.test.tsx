import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
}));

import { PublicLocalizedHeader } from "./localized-public-pages";

describe("localized public page chrome", () => {
  it("delegates language selection to the single SiteShell owner", () => {
    const html = renderToStaticMarkup(
      <PublicLocalizedHeader
        locale="bg"
        basePath="/blog"
        availableLocales={["bg", "ru"]}
      />,
    );

    expect(html).toContain('href="/bg"');
    expect(html).not.toContain("data-interface-language-control");
    expect(html).not.toContain("Смяна на езика");
    expect(html).not.toContain("Русский");
  });

  it("contains no page-local LanguageSwitcher import or rendering path", async () => {
    const source = await readFile(
      new URL("./localized-public-pages.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("components/public/language-switcher");
    expect(source).not.toContain("<LanguageSwitcher");
    expect(source).not.toContain("<InterfaceLanguageControl");
  });
});
