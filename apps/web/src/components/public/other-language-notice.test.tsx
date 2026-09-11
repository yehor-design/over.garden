import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  // `prefetch` is a Link prop, not a DOM attribute, so surface it as data-* to
  // keep it assertable in the rendered markup.
  default: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

import { OtherLanguageNotice } from "./other-language-notice";

function render(locale: "uk" | "bg" | "ru", pathname: string) {
  const markup = OtherLanguageNotice({ locale, pathname });
  return markup ? renderToStaticMarkup(markup) : "";
}

describe("other-language notice", () => {
  it("offers the reader's language when the address serves another one", () => {
    const html = render("bg", "/topics/care-checks");

    expect(html).toContain('href="/bg/topics/care-checks"');
    expect(html).toContain("Тази страница я има на вашия език");
    expect(html).toContain('lang="bg"');
  });

  it("says nothing when the address already serves the reader's language", () => {
    expect(render("uk", "/topics/care-checks")).toBe("");
    expect(render("bg", "/bg/topics/care-checks")).toBe("");
    expect(render("ru", "/ru/blog/field-note")).toBe("");
  });

  it("stays out of routes that have no localized counterpart", () => {
    // The workspace and the API are not `localized-link` routes: there is no
    // other address to offer, so offering one would be a broken promise.
    expect(render("bg", "/garden")).toBe("");
    expect(render("bg", "/api/health")).toBe("");
  });

  it("is an anchor that is never prefetched", () => {
    // The proxy reads the saved language from the prefix a request lands on,
    // and Next strips the prefetch header before middleware, so a prefetch
    // would rewrite the reader's language on hover (ADR-0024 D4).
    const html = render("ru", "/journals");

    expect(html).toContain("<a ");
    expect(html).toContain('data-prefetch="false"');
  });
});
