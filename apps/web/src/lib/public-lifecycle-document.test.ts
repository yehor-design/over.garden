import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LIFECYCLE_DOCUMENT_PALETTE,
  renderPublicLifecycleDocument,
} from "./public-lifecycle-document";

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
    // A tombstone carries the control too, and carries all three languages:
    // a reader who lands on a dead address in the wrong language has to be
    // able to leave it in the right one.
    expect(html.match(/data-interface-language-control="true"/g)).toHaveLength(
      1,
    );
    expect(
      html.match(/data-interface-language-option data-interface-locale=/g),
    ).toHaveLength(3);
    expect(html).toContain("Български");
    expect(html).toContain("Русский");
    // Every option is the prefixed spelling, the reader's own included: that
    // prefix is what tells the proxy the language was chosen.
    expect(html).toContain('href="/uk/journal/missing-entry"');
    expect(html).toContain('href="/bg/journal/missing-entry"');
    expect(html).toContain('href="/ru/journal/missing-entry"');
    // The control is styled in Ukrainian too. Its styles used to be added for
    // every locale but this one, so a Ukrainian tombstone drew the native
    // disclosure triangle and spilled the three options open under it
    // (`OVE-478`).
    expect(html).toContain("[data-interface-language-menu] {");
    expect(html).toContain(
      "summary::-webkit-details-marker { display: none; }",
    );
  });

  it("is drawn as the shell is: the logo on a light header, one action, the language control in the footer", () => {
    const html = renderPublicLifecycleDocument({
      locale: "uk",
      pathname: "/@anna/post/3",
      title: "Запис видалено",
      description: "Цей публічний запис садового журналу видалено.",
      actionHref: "/@anna#profile-entries",
      actionLabel: "Інші записи @anna",
    });

    // The pre-redesign chrome was a black bar with a green brand block.
    expect(html).not.toContain("rgb(47 125 50)");
    expect(html).not.toContain("background: var(--fg)");
    expect(html).toMatch(
      /<header><span data-lifecycle-brand><svg [^>]*viewBox="0 0 469 235"[^>]*aria-hidden="true"/u,
    );
    expect(html).toContain('<span class="sr-only">OverGarden</span>');
    // One heading, one sentence, one way on — the language control is the
    // footer's, as in the shell (DESIGN.md §6).
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(
      html.match(/<main>[\s\S]*?<\/main>/u)?.[0].match(/<a /g),
    ).toHaveLength(1);
    expect(html).toMatch(
      /<footer><nav aria-label="Вибір мови інтерфейсу" data-interface-language-control-host=/u,
    );
    // Every glyph is Phosphor, never a text character.
    expect(html).not.toContain("▾");
    expect(html).not.toContain("✓");
    expect(html).not.toContain('content: "');
    expect(html.match(/data-lifecycle-glyph="Translate"/g)).toHaveLength(1);
    expect(html.match(/data-lifecycle-glyph="CaretDown"/g)).toHaveLength(1);
    expect(html.match(/data-lifecycle-glyph="Check"/g)).toHaveLength(3);
    expect(html).toContain(
      '[data-interface-language-option][aria-checked="false"] [data-lifecycle-glyph] { visibility: hidden; }',
    );
    // The trigger's name carries the language it shows (WCAG 2.5.3).
    expect(html).toContain('<summary aria-label="Змінити мову: Українська">');
  });

  it("renders exactly one control with three localized document links and safe view state", () => {
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
    ).toHaveLength(3);
    expect(html).toContain("Български");
    expect(html).toContain("Русский");
    expect(html).toContain("Українська");
    expect(html).toContain('data-interface-locale="bg" lang="bg"');
    expect(html).toContain('data-interface-locale="ru" lang="ru"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain(
      '[data-interface-language-option][aria-checked="true"] { font-weight: 600; }',
    );
    expect(html).not.toContain("font-weight: 800");
    expect(html).toContain(
      'href="/bg/journal/missing-entry?engagement=interaction-unavailable&amp;authIntent=comment"',
    );
    expect(html).toContain(
      'href="/ru/journal/missing-entry?engagement=interaction-unavailable&amp;authIntent=comment"',
    );
    // Three language options and the way out: four links, every one of them
    // referrer-free, because a dead address must not travel.
    expect(html.match(/rel="noreferrer"/g)).toHaveLength(4);
    expect(html.match(/referrerpolicy="no-referrer"/g)).toHaveLength(4);
    expect(html).toContain(
      '<a href="/bg/journals" rel="noreferrer" referrerpolicy="no-referrer">',
    );
    expect(html).not.toContain("private");
    // A tombstone carries no client bundle, so it carries no script either: the
    // language options are anchors, which is all a localized route needs.
    expect(html).not.toContain("<script");
    // No styles for the status line and recovery button the old inline
    // protocol drew: neither element exists in this document.
    expect(html).not.toContain("data-interface-language-status");
    expect(html).not.toContain("data-interface-language-recovery");
    expect(html).toContain(
      "[data-interface-language-control] summary:focus-visible, [data-interface-language-option]:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }",
    );
    expect(html).not.toContain(
      "[data-interface-language-option]:focus-visible { outline: 2px solid transparent;",
    );
  });

  it("uses the locale-only POST where an address has no prefixed spelling", () => {
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
    ).toHaveLength(3);
    expect(html).toContain('data-interface-locale="bg" lang="bg"');
    expect(html).toContain('data-interface-locale="ru" lang="ru"');
    expect(html).toContain('data-interface-locale="uk" lang="uk"');
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

  it("draws its colours from the design tokens, as globals.css resolves them", () => {
    // The document has no stylesheet, so its palette is written out; this is
    // what keeps it from drifting away from the tokens it copies. The first
    // declaration of a token that is not `@theme inline`'s bridge to itself
    // is the light theme's.
    const globals = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    const resolve = (token: string): string | undefined => {
      const declared = [
        ...globals.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "gu")),
      ]
        .map((match) => match[1]!.trim())
        .find((value) => value !== `var(${token})`);
      const reference = declared
        ? /^var\((--[a-z0-9-]+)\)$/u.exec(declared)?.[1]
        : undefined;
      return reference ? resolve(reference) : declared;
    };
    for (const [name, { token, value }] of Object.entries(
      LIFECYCLE_DOCUMENT_PALETTE,
    )) {
      expect(resolve(token), `${name} → ${token}`).toBe(value);
    }
    const html = renderPublicLifecycleDocument({
      locale: "bg",
      pathname: "/bg/journal/missing",
      title: "Записът не е намерен",
      description: "Този запис не е достъпен.",
      actionHref: "/bg/journals",
      actionLabel: "Дневници",
    });
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(html).toContain(
      `--surface: ${LIFECYCLE_DOCUMENT_PALETTE.surface.value};`,
    );
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
