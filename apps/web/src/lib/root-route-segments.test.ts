import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LOCALE_ROUTE_SEGMENTS,
  ROOT_ROUTE_FILES,
  ROOT_ROUTE_SEGMENTS,
  ROOT_SEGMENTS_WITHOUT_INDEX,
  isSectionRootWithoutIndex,
  isUnknownLocalizedPath,
  isUnknownRootPath,
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

  it("matches the [locale] tree's own directories exactly", () => {
    const expected = directories(new URL("../app/[locale]/", import.meta.url))
      .filter((name) => name !== "[profileHandle]")
      .sort();

    expect([...LOCALE_ROUTE_SEGMENTS].sort()).toEqual(expected);
  });

  it("flags a prefixed path the prefixed tree cannot serve", () => {
    for (const path of [
      "/bg/support",
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
      // `/species` is the catalog's front door since OVE-431. It used to be a
      // section root with no page, and a 404 there is now a 404 on the only
      // inbound link 114 669 organism pages have.
      "/species",
      "/bg/species",
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
