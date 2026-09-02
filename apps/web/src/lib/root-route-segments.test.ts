import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ROOT_ROUTE_SEGMENTS, isUnknownRootPath } from "./root-route-segments";

function directories(url: URL) {
  return readdirSync(fileURLToPath(url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

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

  it("flags only first segments that nothing can serve", () => {
    for (const path of [
      "/__visual-fixtures",
      "/__nonexistent-xyz",
      "/xyz/journals",
      "/BG/journals",
      "/visual-fixtures/x",
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
      "/favicon.ico",
      "/apple-icon.png",
      "/licenses/GoogleSans-OFL.txt",
      "/api/interface/context",
    ]) {
      expect(isUnknownRootPath(path), path).toBe(false);
    }
  });
});
