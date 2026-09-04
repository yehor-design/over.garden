import { describe, expect, it } from "vitest";

import { renderPublicLifecycleDocument } from "./public-lifecycle-document";

describe("raw public lifecycle document", () => {
  it("renders Ukraine lifecycle UI in Ukrainian with no language-control artifact", () => {
    const html = renderPublicLifecycleDocument({
      locale: "uk",
      pathname: "/journal/missing-entry",
      title: "Запис не знайдено",
      description: "Цей запис недоступний.",
      actionHref: "/journals",
      actionLabel: "До журналів",
    });

    expect(html).toContain('<html lang="uk">');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    const preloadTags = html.match(/<link rel="preload"[^>]+>/gu) ?? [];
    expect(preloadTags).toHaveLength(0);
    expect(html).toContain(
      '<a href="/journals" rel="noreferrer" referrerpolicy="no-referrer">',
    );
    expect(html).toContain("font-synthesis: none");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).toContain("Запис не знайдено");
    expect(html).not.toContain("data-interface-language-control");
    expect(html).not.toContain("Български");
    expect(html).not.toContain("Русский");
  });

  it("renders exactly one Bulgaria control with two localized document links and safe view state", () => {
    const html = renderPublicLifecycleDocument({
      locale: "bg",
      pathname: "/bg/journal/missing-entry",
      search:
        "?engagement=interaction-unavailable&authIntent=comment&token=private&authIntent=follow",
      title: "Записът не е намерен",
      description: "Този запис не е достъпен.",
      actionHref: "/bg/journals",
      actionLabel: "Към дневниците",
    });

    expect(html.match(/data-interface-language-control="true"/g)).toHaveLength(
      1,
    );
    expect(
      html.match(/data-interface-language-option data-interface-locale=/g),
    ).toHaveLength(2);
    expect(html).toContain("Български");
    expect(html).toContain("Русский");
    expect(html).toContain('data-interface-locale="bg" lang="bg"');
    expect(html).toContain('data-interface-locale="ru" lang="ru"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="true"]::after');
    expect(html).toContain("font-weight: 700");
    expect(html).not.toContain("font-weight: 800");
    expect(html).toContain(
      'href="/bg/journal/missing-entry?engagement=interaction-unavailable&amp;authIntent=comment"',
    );
    expect(html).toContain(
      'href="/ru/journal/missing-entry?engagement=interaction-unavailable&amp;authIntent=comment"',
    );
    expect(html.match(/rel="noreferrer"/g)).toHaveLength(3);
    expect(html.match(/referrerpolicy="no-referrer"/g)).toHaveLength(3);
    expect(html).toContain(
      '<a href="/bg/journals" rel="noreferrer" referrerpolicy="no-referrer">',
    );
    expect(html).not.toContain("private");
    // A tombstone carries no client bundle, so it carries no script either: the
    // language options are anchors, which is all a localized route needs.
    expect(html).not.toContain("<script");
    expect(html).toContain(
      "[data-interface-language-status]:empty { position: absolute",
    );
    expect(html).toContain(
      "[data-interface-language-status] { flex: 1 0 100%; max-width: 24rem; color: inherit;",
    );
    expect(html).toContain(
      "[data-interface-language-option]:focus-visible, [data-interface-language-recovery]:focus-visible { outline: 3px solid currentColor;",
    );
    expect(html).not.toContain(
      "[data-interface-language-option]:focus-visible { outline: 2px solid transparent;",
    );
  });

  it("uses the locale-only POST for canonical unprefixed Bulgaria lifecycle UI", () => {
    const privateObjectId = "18700007-0000-4000-8000-000000000099";
    const html = renderPublicLifecycleDocument({
      locale: "ru",
      pathname: `/lineage/objects/${privateObjectId}`,
      search: "?token=never-copy-this",
      title: "Паспорт недоступен",
      description: "Публичный паспорт удалён.",
      actionHref: "/ru/objects",
      actionLabel: "К объектам",
    });

    expect(html.match(/data-interface-language-control="true"/g)).toHaveLength(
      1,
    );
    expect(
      html.match(/data-interface-language-option data-interface-locale=/g),
    ).toHaveLength(2);
    expect(html).toContain('data-interface-locale="bg" lang="bg"');
    expect(html).toContain('data-interface-locale="ru" lang="ru"');
    expect(html).toContain('action="/api/interface/locale"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="locale" value="bg"');
    expect(html).toContain('name="locale" value="ru"');
    // No script, no fetch protocol, no reload handshake — and, as before, no
    // route identity copied into the markup of the thing that is gone.
    expect(html).not.toContain("<script");
    expect(html).not.toContain(privateObjectId);
    expect(html).not.toContain("never-copy-this");
  });

  it("escapes authored lifecycle copy", () => {
    const html = renderPublicLifecycleDocument({
      locale: "uk",
      pathname: "/journal/missing",
      title: '<script>alert("x")</script>',
      description: "A & B",
      actionHref: "/journals",
      actionLabel: "Back",
    });

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("A &amp; B");
  });
});
