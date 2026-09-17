import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The real control, not a stub. The stub that used to stand here rendered only
 * for the Bulgaria market — it encoded the model the product left behind on
 * 2026-09-17, so it would have gone on passing while the page shipped no
 * control at all to a reader whose market failed closed to Ukraine.
 */

import GlobalError, {
  resolveGlobalErrorInterfaceContext,
} from "./global-error";

describe("global error market boundary", () => {
  it("takes the language from the address and never the market with it", () => {
    // The rule the previous model broke: `/bg/**` meant "the Bulgaria market".
    // A prefix says which language a reader chose and nothing about where they
    // are, so the address decides the language and the market falls to the
    // default when nothing else carries it.
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/bg/unknown",
        htmlLang: "uk",
      }),
    ).toEqual({ market: "ukraine", locale: "bg" });
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/ru/journals",
        htmlLang: "uk",
        metadataHint: "bulgaria:bg",
      }),
    ).toEqual({ market: "bulgaria", locale: "ru" });
    // With no prefix, the document's own language is the last thing legible.
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden/profile",
        htmlLang: "ru",
      }),
    ).toEqual({ market: "ukraine", locale: "ru" });
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden",
        htmlLang: "uk",
        metadataHint: "bulgaria:bg",
      }),
    ).toEqual({ market: "bulgaria", locale: "bg" });
  });

  it("reads any market's language out of a hint and ignores a malformed one", () => {
    // Every market offers every language, so these two are ordinary readers:
    // one in Bulgaria reading Ukrainian, one in Ukraine reading Russian. The
    // error document has to speak to them in the language they were reading.
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden",
        htmlLang: "en",
        metadataHint: "bulgaria:uk",
      }),
    ).toEqual({ market: "bulgaria", locale: "uk" });
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden",
        htmlLang: "en",
        metadataHint: "ukraine:ru",
      }),
    ).toEqual({ market: "ukraine", locale: "ru" });

    for (const metadataHint of [
      "bulgaria:bg:extra",
      "bulgaria:de",
      "moldova:bg",
      "private-user-state",
    ]) {
      expect(
        resolveGlobalErrorInterfaceContext({
          pathname: "/garden",
          htmlLang: "en",
          metadataHint,
        }),
      ).toEqual({ market: "ukraine", locale: "uk" });
    }
  });

  it("fails closed to Ukraine and still offers the one language control", () => {
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden",
        htmlLang: "en",
      }),
    ).toEqual({ market: "ukraine", locale: "uk" });

    const html = renderToStaticMarkup(
      <GlobalError
        error={new Error("private provider transport detail")}
        reset={vi.fn()}
      />,
    );

    expect(html).toContain('<html lang="uk"');
    expect(html).toContain('<meta name="referrer" content="no-referrer"/>');
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain("Цю сторінку не вдалося завантажити");
    // Exactly one, in either market. The control used to be drawn only for
    // Bulgaria, so a reader whose market failed closed to Ukraine had no way
    // to change the language on the one page they most need to understand.
    expect(html.match(/data-interface-language-control=/g)).toHaveLength(1);
    expect(html.match(/data-interface-locale="/g)).toHaveLength(3);
    expect(html).not.toContain("private provider transport detail");
  });

  it("reconciles unprefixed failures from the bounded context endpoint without sending page state", async () => {
    const source = await readFile(
      new URL("./global-error.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("INTERFACE_CONTEXT_ENDPOINT");
    expect(source).toContain("INTERFACE_CONTEXT_META_NAME");
    expect(source).toContain('referrerPolicy: "no-referrer"');
    expect(source).toContain('credentials: "same-origin"');
    expect(source).toContain('cache: "no-store"');
    expect(source).not.toMatch(/error\.message|error\.digest/);
  });
});
