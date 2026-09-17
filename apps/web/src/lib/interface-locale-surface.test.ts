import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  getInterfaceCopy,
  resolveInterfaceLocalization,
} from "./interface-localization";
import { INTERFACE_MARKETS } from "./interface-market";
import { INTERFACE_LOCALE_CHOICES } from "./public-localization";

/**
 * One page, one interface language — asserted across the whole source tree
 * rather than in the one file that happens to be right.
 *
 * The defect this exists for was visible to anyone: on 2026-09-17 production
 * served `/journals` with `<html lang="uk">`, Ukrainian content, Bulgarian
 * chrome, and a full-width bar on the Ukrainian page offering it in Bulgarian.
 * Three decisions met badly — the unprefixed tree hard-coded the default
 * locale, entries were rewritten into a fixed `/uk` subtree, and the market
 * came from the locale prefix — and every one of them had passing tests.
 *
 * The model the owner settled on (2026-09-17, after the fix): the interface
 * language is the reader's cookie, the country sets it on a first visit, a
 * locale prefix in an address is an explicit choice, **both markets offer all
 * three languages**, and the market decides only which language a reader who
 * has chosen nothing starts in. `docs/INTERFACE_LOCALE_CONTRACT.md` records it.
 */

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTROL_OWNER = "components/public/language-switcher.tsx";

/**
 * The modules allowed to build an address in a language that is not the page's,
 * by exact path so that a new one cannot inherit the excuse:
 *
 * - `interface-route-policy.ts` declares the builder;
 * - `language-switcher.tsx` is the control every rendered tree uses;
 * - `public-lifecycle-document.ts` is the raw `404`/`410` HTML, which has no
 *   React tree and therefore no router to prefetch with.
 *
 * Each is asserted below to emit a plain anchor. Being on this list is not the
 * permission — being a plain anchor is.
 */
const CROSS_LOCALE_OWNERS = [
  "lib/interface-route-policy.ts",
  CONTROL_OWNER,
  "lib/public-lifecycle-document.ts",
] as const;

const CROSS_LOCALE_BUILDERS = [
  "buildInterfaceLocaleChoiceTarget",
  "languageHref",
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(path) && !/\.test\.tsx?$/u.test(path) ? [path] : [];
  });
}

const files = sourceFiles(SOURCE_ROOT).map((path) => ({
  path: relative(SOURCE_ROOT, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

describe("a language the reader has not chosen is never prefetched", () => {
  /**
   * The mechanism, measured rather than assumed (ADR-0024 D4): Next strips
   * `Next-Router-Prefetch` before middleware runs, so `proxy.ts` cannot tell a
   * prefetch of `/ru/…` from a reader landing there, and writes the preference
   * either way. Left prefetchable, *hovering* "Русский" on a `/bg/` page
   * rewrote the reader's saved language.
   *
   * `language-switcher.test.tsx` holds this for the switcher's own file. This
   * one holds it for the tree, because a guard that reads one file cannot see
   * the file that is wrong — the lesson `sign-in-href` cost a day to learn.
   */
  it("keeps every cross-locale target on a plain anchor", () => {
    const offenders = files
      .filter(({ path, text }) => {
        if ((CROSS_LOCALE_OWNERS as readonly string[]).includes(path)) {
          return false;
        }
        return CROSS_LOCALE_BUILDERS.some((builder) =>
          new RegExp(`\\b${builder}\\s*\\(`, "u").test(text),
        );
      })
      .map(({ path }) => path);

    expect(
      offenders,
      "a cross-locale address may only be built by a declared owner",
    ).toEqual([]);
  });

  it("keeps every declared owner on a plain anchor and lets none go stale", () => {
    for (const owner of CROSS_LOCALE_OWNERS) {
      const file = files.find(({ path }) => path === owner);
      expect(file, `${owner} is listed and does not exist`).toBeDefined();
      // A listed file that no longer builds a cross-locale address has no
      // reason to be listed, and an allowance that outlives its reason is how
      // a guard stops guarding.
      expect(
        CROSS_LOCALE_BUILDERS.some((builder) =>
          new RegExp(`\\b${builder}\\b`, "u").test(file!.text),
        ),
        `${owner} no longer builds one: remove it from the list`,
      ).toBe(true);
    }

    // The two that render: raw HTML and JSX, both anchors, both with hreflang.
    const lifecycle = files.find(
      ({ path }) => path === "lib/public-lifecycle-document.ts",
    )!.text;
    expect(lifecycle).toContain("hreflang=");
    expect(lifecycle).not.toContain('from "next/link"');
  });

  it("renders the control's options as anchors, not as router links", () => {
    const control = files.find(({ path }) => path === CONTROL_OWNER);
    expect(control, CONTROL_OWNER).toBeDefined();
    const code = control!.text
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*\/\/.*$/gmu, "");

    // A plain `<a>` cannot prefetch and cannot navigate on the client either.
    // Both matter: the prefix is how the proxy learns of the choice, and only a
    // document navigation lets it fold that prefix back to the canonical
    // address.
    expect(code).not.toContain('from "next/link"');
    expect(code).not.toContain("<Link");
    const options = [...code.matchAll(/<a\b[\s\S]*?>/gu)]
      .map((match) => match[0]!)
      .filter((anchor) => anchor.includes("data-interface-language-option"));
    expect(options.length).toBeGreaterThanOrEqual(1);
    for (const option of options) {
      expect(option).toContain("hrefLang=");
      expect(option).toContain("lang=");
    }
  });

  it("leaves no `next/link` anywhere with prefetch left to the default on a locale target", () => {
    // If a future caller does need `next/link` for a locale target, this is
    // the shape it must take. Stated as a rule rather than as a hope: the file
    // list above is empty, so this asserts the absence of the wrong shape.
    const offenders = files
      .filter(({ text }) =>
        /<Link[^>]*href=\{[^}]*localizedPath\(\s*(?:availableLocale|otherLocale|targetLocale)/u.test(
          text,
        ),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});

describe("the market and locale resolver, over the whole matrix", () => {
  const COUNTRIES = [null, "UA", "BG", "DE", "zz", ""] as const;
  const PERSISTED_MARKETS = [
    undefined,
    "ukraine",
    "bulgaria",
    "atlantis",
  ] as const;
  const PREFIXES = [undefined, "uk", "bg", "ru", "en"] as const;
  const PERSISTED_LOCALES = [undefined, "uk", "bg", "ru", "klingon"] as const;

  it("answers every combination with a market-valid locale and never throws", () => {
    let cases = 0;
    for (const countryCode of COUNTRIES) {
      for (const persistedMarket of PERSISTED_MARKETS) {
        for (const routeLocale of PREFIXES) {
          for (const persistedLocale of PERSISTED_LOCALES) {
            const resolved = resolveInterfaceLocalization({
              countryCode,
              persistedMarket,
              routeLocale,
              persistedLocale,
            });
            cases += 1;
            expect(
              INTERFACE_MARKETS,
              JSON.stringify({ countryCode, persistedMarket }),
            ).toContain(resolved.market);
            expect(
              INTERFACE_LOCALE_CHOICES,
              JSON.stringify({ routeLocale, persistedLocale }),
            ).toContain(resolved.locale);
          }
        }
      }
    }
    expect(cases).toBe(
      COUNTRIES.length *
        PERSISTED_MARKETS.length *
        PREFIXES.length *
        PERSISTED_LOCALES.length,
    );
  });

  it("fails an unrecognised, malformed or contradictory country to Ukraine", () => {
    // Rule 4 of the contract. `DE` is supported input and unsupported value;
    // `zz` and `""` are malformed; `null` is absent. None of them may leave a
    // reader in a market nothing chose for them.
    for (const countryCode of [null, "DE", "zz", ""] as const) {
      expect(
        resolveInterfaceLocalization({ countryCode }),
        String(countryCode),
      ).toMatchObject({ market: "ukraine", locale: "uk" });
    }
  });

  it("lets a prefix choose a language without moving the reader's market", () => {
    // The named case. This exact combination — a reader whose country resolves
    // to BG, reading an address prefixed `uk` — is what the old resolver read
    // as "the Ukraine market", which took the language control away from them.
    expect(
      resolveInterfaceLocalization({ countryCode: "BG", routeLocale: "uk" }),
    ).toMatchObject({
      market: "bulgaria",
      locale: "uk",
      marketSource: "country",
      localeSource: "route",
    });
    expect(
      resolveInterfaceLocalization({ countryCode: "UA", routeLocale: "ru" }),
    ).toMatchObject({
      market: "ukraine",
      locale: "ru",
      marketSource: "country",
      localeSource: "route",
    });
  });

  it("is the named production failure, and its answer", () => {
    // Observed on production on 2026-09-17: `/journals` answered
    // `Content-Language: bg` with `<html lang="uk">` and Bulgarian chrome over
    // Ukrainian content. The resolver was right; the document ignored it. What
    // the resolver must say for that request, and now does:
    const resolved = resolveInterfaceLocalization({
      countryCode: "BG",
      persistedMarket: undefined,
      routeLocale: undefined,
      persistedLocale: undefined,
    });
    expect(resolved).toMatchObject({
      market: "bulgaria",
      locale: "bg",
      localeSource: "market-default",
    });
    // And a reader who has chosen Ukrainian keeps it, in that same market.
    expect(
      resolveInterfaceLocalization({
        countryCode: "BG",
        persistedLocale: "uk",
      }),
    ).toMatchObject({ market: "bulgaria", locale: "uk" });
  });

  it("ignores Accept-Language entirely", () => {
    // It is not an input to this resolver and must not become one: a header
    // the reader never set cannot be read as a choice they made. The proxy
    // never passes it, and `resolveInterfaceLocalization` has no parameter for
    // it — asserted on the shape rather than on behaviour, because a function
    // cannot be tested for a parameter it does not have.
    const resolverSource = files.find(
      ({ path }) => path === "lib/interface-localization.ts",
    )!.text;
    expect(resolverSource.toLowerCase()).not.toContain("accept-language");
    const proxySource = files.find(({ path }) => path === "proxy.ts")!.text;
    const acceptLanguageReads = [
      ...proxySource.matchAll(/get\(\s*"accept-language"\s*\)/giu),
    ];
    expect(acceptLanguageReads).toEqual([]);
  });
});

describe("the three typed namespaces stay complete", () => {
  it("carries the same key set in every language, all the way down", () => {
    const shape = (value: unknown, prefix = ""): string[] => {
      if (typeof value !== "object" || value === null) return [prefix];
      return Object.entries(value).flatMap(([key, nested]) =>
        shape(nested, prefix ? `${prefix}.${key}` : key),
      );
    };
    const [reference, ...rest] = INTERFACE_LOCALE_CHOICES.map((locale) => ({
      locale,
      keys: shape(getInterfaceCopy(locale)).sort(),
    }));
    for (const other of rest) {
      expect(
        other.keys,
        `${other.locale} against ${reference!.locale}`,
      ).toEqual(reference!.keys);
    }
    expect(reference!.keys.length).toBeGreaterThan(50);
  });

  it("leaves no empty string in any language", () => {
    const empties: string[] = [];
    const walk = (value: unknown, path: string, locale: string) => {
      if (typeof value === "string") {
        if (value.trim().length === 0) empties.push(`${locale}:${path}`);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      for (const [key, nested] of Object.entries(value)) {
        walk(nested, path ? `${path}.${key}` : key, locale);
      }
    };
    for (const locale of INTERFACE_LOCALE_CHOICES) {
      walk(getInterfaceCopy(locale), "", locale);
    }
    expect(empties).toEqual([]);
  });
});
