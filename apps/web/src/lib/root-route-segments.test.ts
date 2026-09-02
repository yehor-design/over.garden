import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ROOT_ROUTE_FILES,
  ROOT_ROUTE_SEGMENTS,
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
  "favicon.ico": "favicon.ico",
  "robots.ts": "robots.txt",
  "sitemap.ts": "sitemap.xml",
};

describe("root route segments", () => {
  it("matches the App Router root directories and public/ directories exactly", () => {
    const expected = [
      ...directories(new URL("../app/", import.meta.url)).filter(
        (name) => name !== "[locale]",
      ),
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
      "/sitemap/0.xml",
      "/favicon.ico",
      "/apple-icon.png",
      "/next.svg",
      "/licenses/GoogleSans-OFL.txt",
      "/api/interface/context",
    ]) {
      expect(isUnknownRootPath(path), path).toBe(false);
    }
  });
});
