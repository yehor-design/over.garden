import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a data-next-link="true" {...props} />
  ),
}));

import { LanguageSwitcher } from "./language-switcher";

describe("language switcher persistence", () => {
  it("uses document navigation so locale, root metadata, and html lang change together", () => {
    const html = renderToStaticMarkup(
      <LanguageSwitcher
        locale="bg"
        basePath="/privacy"
        availableLocales={["bg", "ru"]}
      />,
    );

    expect(html).not.toContain("data-next-link");
    expect(html).toContain('href="/bg/privacy"');
    expect(html).toContain('href="/ru/privacy"');
  });
});
