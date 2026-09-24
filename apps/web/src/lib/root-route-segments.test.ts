import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LOCALE_ROUTE_SEGMENTS,
  ROOT_ROUTE_FILES,
  ROOT_ROUTE_SEGMENTS,
  ROOT_SEGMENTS_WITHOUT_INDEX,
  SECTION_SUBPATHS,
  isSectionRootWithoutIndex,
  isUnknownLocalizedPath,
  isUnknownRootPath,
  isUnservedSectionPath,
  matchAuthoredAddress,
} from "./root-route-segments";

function directories(url: URL) {
  return readdirSync(fileURLToPath(url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function files(url: URL) {
  return readdirSync(fileURLToPath(url), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

const APP_FILE_CONVENTIONS: Record<string, string> = {
  "apple-icon.png": "apple-icon.png",
  "favicon.ico": "favicon.ico",
  "icon.svg": "icon.svg",
  "robots.ts": "robots.txt",
};

describe("root route segments", () => {
  it("matches the App Router root directories and public/ directories exactly", () => {
    const expected = [
      ...directories(new URL("../app/", import.meta.url))
        .filter((name) => name !== "[locale]" && name !== "(default)")
        .concat(directories(new URL("../app/(default)/", import.meta.url))),
      ...directories(new URL("../../public/", import.meta.url)),
    ].sort();

    expect([...ROOT_ROUTE_SEGMENTS].sort()).toEqual(expected);
  });

  it("matches the App Router root file conventions and public/ files exactly", () => {
    const expected = [
      ...files(new URL("../app/", import.meta.url))
        .filter((name) => name in APP_FILE_CONVENTIONS)
        .map((name) => APP_FILE_CONVENTIONS[name]),
      ...files(new URL("../../public/", import.meta.url)),
    ].sort();

    expect([...ROOT_ROUTE_FILES].sort()).toEqual(expected);
  });

  /**
   * The list is the filesystem's, not a judgement: a root segment that has no
   * `page.tsx` directly under it in `(default)` has no front door, except the
   * ones that are not documents at all.
   */
  it("matches the root directories with no page of their own", () => {
    // Not documents: these answer as route handlers or static files, and an
    // HTML 404 document is the wrong shape for them.
    const NOT_DOCUMENTS = new Set([
      "api",
      "engagement",
      "licenses",
      "sitemap.xml",
      "sitemaps",
    ]);
    const defaultRoot = new URL("../app/(default)/", import.meta.url);
    // A route group serves the bare path without appearing in it, which is how
    // `/garden` has a page while `garden/page.tsx` does not exist.
    const hasIndex = (name: string) => {
      const section = new URL(`${name}/`, defaultRoot);
      if (existsSync(fileURLToPath(new URL("page.tsx", section)))) return true;
      return directories(section).some(
        (child) =>
          child.startsWith("(") &&
          existsSync(fileURLToPath(new URL(`${child}/page.tsx`, section))),
      );
    };
    const expected = directories(defaultRoot)
      .filter((name) => !NOT_DOCUMENTS.has(name))
      .filter((name) => !hasIndex(name))
      .sort();

    expect([...ROOT_SEGMENTS_WITHOUT_INDEX].sort()).toEqual(expected);
  });

  it("lists every address each section serves below its root, and no other", () => {
    // Every `page.tsx` and `route.ts` below the section in both trees, route
    // groups dropped; the section's own catch-all is what this table replaces.
    const servedBelow = (section: string) => {
      const found = new Set<string>();
      const walk = (url: URL, parts: string[]) => {
        if (!existsSync(fileURLToPath(url))) return;
        if (
          parts.length > 0 &&
          (existsSync(fileURLToPath(new URL("page.tsx", url))) ||
            existsSync(fileURLToPath(new URL("route.ts", url))))
        ) {
          found.add(parts.join("/"));
        }
        for (const child of directories(url)) {
          if (child.startsWith("[...")) continue;
          walk(
            new URL(`${child}/`, url),
            child.startsWith("(") ? parts : [...parts, child],
          );
        }
      };
      for (const tree of ["(default)", "[locale]"]) {
        walk(new URL(`../app/${tree}/${section}/`, import.meta.url), []);
      }
      return [...found].sort();
    };

    for (const [section, patterns] of Object.entries(SECTION_SUBPATHS)) {
      expect([...patterns].sort(), section).toEqual(servedBelow(section));
    }
  });

  it("answers 404 below a section only where none of its pages match", () => {
    for (const path of [
      "/catalog/x",
      "/garden/objects/1/x",
      "/garden/spaces",
      "/bg/journals/x",
      "/ru/notifications/x",
      "/markets/ukraine/x",
      "/answers/a/b",
      "/col/1/x",
      "/bg/wikidata/Q1/x",
    ]) {
      expect(isUnservedSectionPath(path), path).toBe(true);
    }
    for (const path of [
      "/catalog",
      "/garden/objects/1",
      "/garden/objects/new",
      "/garden/lineage/invitations/claim/handoff",
      "/auth/intent/start",
      "/bg/notifications/settings",
      "/answers/anything",
      // One segment under a source alias is its handler's to look up.
      "/col/1",
      "/gbif/5",
      // Not this table's question: a legacy prefix, an address looked up by
      // the proxy, a handle.
      "/uk/catalog/x",
      "/species/a/b",
      "/@yehor/x",
    ]) {
      expect(isUnservedSectionPath(path), path).toBe(false);
    }
  });

  it("names the authored page an address asks for", () => {
    expect(matchAuthoredAddress("/answers/why")).toEqual({
      section: "answers",
      name: "why",
    });
    expect(matchAuthoredAddress("/bg/markets/ukraine")).toEqual({
      section: "markets",
      name: "ukraine",
    });
    expect(matchAuthoredAddress("/uk/answers/why")).toBeNull();
    expect(matchAuthoredAddress("/answers")).toBeNull();
    expect(matchAuthoredAddress("/answers/a/b")).toBeNull();
    expect(matchAuthoredAddress("/topics/plants")).toBeNull();
  });

  it("matches the [locale] tree's own directories exactly", () => {
    const expected = directories(new URL("../app/[locale]/", import.meta.url))
      .filter((name) => name !== "[profileHandle]")
      .sort();

    expect([...LOCALE_ROUTE_SEGMENTS].sort()).toEqual(expected);
  });

  it("flags a prefixed path the prefixed tree cannot serve", () => {
    for (const path of [
      "/bg/erasure",
      "/ru/erasure",
      "/bg/garden",
      "/bg/account",
      "/ru/nonexistent",
    ]) {
      expect(isUnknownLocalizedPath(path), path).toBe(true);
    }
    for (const path of [
      // `/uk/**` is a legacy prefix that folds to the unprefixed path with a
      // 308; a 404 here would take a mail link away from the reader instead.
      "/uk/nonexistent",
      "/uk/auth/reset-password",
      "/bg",
      "/bg/journals",
      "/ru/topics/plants",
      "/bg/@yehor",
      "/bg/%40yehor",
      "/journals",
      "/support",
      "/",
    ]) {
      expect(isUnknownLocalizedPath(path), path).toBe(false);
    }
  });

  it("answers a section root without a page, in every locale", () => {
    for (const path of [
      "/variety",
      "/topics",
      "/ru/topics",
      "/journal",
      "/lineage",
    ]) {
      expect(isSectionRootWithoutIndex(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/bg",
      "/journals",
      "/communities",
      "/feed",
      // `/species` is a section root with no page again since `OVE-451`
      // merged the catalogue's doors — but it is not a 404: the proxy answers
      // it with a 308 to `/catalog`, decided *before* this check, because a
      // 404 there would be a 404 on an address the product published.
      "/species/solanum",
      "/bg/species/solanum",
      "/api",
      "/sitemaps",
    ]) {
      expect(isSectionRootWithoutIndex(path), path).toBe(false);
    }
  });

  it("flags only first segments that nothing can serve", () => {
    for (const path of [
      "/__visual-fixtures",
      "/__nonexistent-xyz",
      "/xyz/journals",
      "/BG/journals",
      "/visual-fixtures/x",
      "/sw.js",
      "/manifest.webmanifest",
      "/icon-192.png",
      "/wp-login.php",
      "/fonts/google-sans/google-sans-latin.woff2",
    ]) {
      expect(isUnknownRootPath(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/bg",
      "/bg/anything",
      "/feed",
      "/journal/slug",
      "/@gardener",
      "/%40gardener",
      "/.well-known/security.txt",
      "/_next/static/chunk.js",
      "/robots.txt",
      "/sitemap.xml",
      "/sitemaps/entries-0.xml",
      "/favicon.ico",
      "/icon.svg",
      "/apple-icon.png",
      "/next.svg",
      "/licenses/GoogleSans-OFL.txt",
      "/api/interface/context",
    ]) {
      expect(isUnknownRootPath(path), path).toBe(false);
    }
  });
});
