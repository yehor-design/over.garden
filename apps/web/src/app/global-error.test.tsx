import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/public/language-switcher", () => ({
  InterfaceLanguageControl: ({ market }: { market: string }) =>
    market === "bulgaria" ? (
      <nav data-interface-language-control="true">Language</nav>
    ) : null,
}));

import GlobalError, {
  resolveGlobalErrorInterfaceContext,
} from "./global-error";

describe("global error market boundary", () => {
  it("derives Bulgaria from an explicit route or the last resolved document language", () => {
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/bg/unknown",
        htmlLang: "uk",
      }),
    ).toEqual({ market: "bulgaria", locale: "bg" });
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden/profile",
        htmlLang: "ru",
      }),
    ).toEqual({ market: "bulgaria", locale: "ru" });
    expect(
      resolveGlobalErrorInterfaceContext({
        pathname: "/garden",
        htmlLang: "uk",
        metadataHint: "bulgaria:bg",
      }),
    ).toEqual({ market: "bulgaria", locale: "bg" });
  });

  it("ignores malformed or market-incompatible metadata hints", () => {
    for (const metadataHint of [
      "bulgaria:uk",
      "ukraine:ru",
      "bulgaria:bg:extra",
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

  it("fails closed to Ukraine and never renders a placeholder control there", () => {
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
    expect(html).toContain("Цю сторінку не вдалося завантажити");
    expect(html).not.toContain("data-interface-language-control");
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
