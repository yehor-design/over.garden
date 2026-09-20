import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isPublicQueryTwinPath,
  PUBLIC_QUERY_TWINS,
  PUBLIC_QUERY_TWIN_SEGMENT,
  publicQueryTwinPath,
} from "./public-query-twin";

describe("a listing's query twin (ADR-0032 D5)", () => {
  it("sends a request to the twin only for a parameter the listing itself reads", () => {
    expect(publicQueryTwinPath("/", "?kind=plant")).toBe("/q");
    expect(publicQueryTwinPath("/bg", new URLSearchParams("kind=animal"))).toBe(
      "/q",
    );
    // `topic` and `cursor` are the feed's own, and the interface route policy
    // drops both — it lists what survives a change of language, which is a
    // different question. Deciding from it sent a filtered feed to the static
    // document, which ignores the filter.
    expect(publicQueryTwinPath("/", "?topic=winter-care")).toBe("/q");
    expect(publicQueryTwinPath("/ru", "?cursor=abc")).toBe("/q");
    // No query, an empty one, an empty value, and what no listing reads: the
    // static document.
    expect(publicQueryTwinPath("/", "")).toBeNull();
    expect(publicQueryTwinPath("/", null)).toBeNull();
    expect(publicQueryTwinPath("/", "?kind=")).toBeNull();
    expect(publicQueryTwinPath("/", "?utm_source=x&fbclid=y")).toBeNull();
    expect(publicQueryTwinPath("/", "?token=opaque")).toBeNull();
  });

  it("leaves a route without a mounted twin to read its own query string", () => {
    expect(publicQueryTwinPath("/journals", "?topic=tomaty")).toBeNull();
    expect(publicQueryTwinPath("/garden", "?kind=plant")).toBeNull();
  });

  it("recognises the reserved segment with and without a locale", () => {
    for (const address of ["/q", "/q/journals", "/uk/q", "/bg/q/journals"]) {
      expect(isPublicQueryTwinPath(address), address).toBe(true);
    }
    for (const address of ["/", "/quince", "/uk", "/journals/q", "/@q"]) {
      expect(isPublicQueryTwinPath(address), address).toBe(false);
    }
  });

  it("has a page mounted for every path it rewrites to", () => {
    // Listing a path here without mounting its twin would 404 every filtered
    // view of that listing, and nothing else in the suite would notice.
    for (const canonicalPath of PUBLIC_QUERY_TWINS.keys()) {
      const page = path.join(
        process.cwd(),
        "src/app/[locale]",
        PUBLIC_QUERY_TWIN_SEGMENT,
        canonicalPath === "/" ? "" : canonicalPath,
        "page.tsx",
      );
      expect(existsSync(page), page).toBe(true);
    }
  });
});
