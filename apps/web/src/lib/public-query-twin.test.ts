import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isPublicQueryTwinPath,
  PUBLIC_QUERY_TWINS,
  PUBLIC_QUERY_TWIN_PATTERNS,
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
    expect(publicQueryTwinPath("/knowledge", "?kind=plant")).toBeNull();
    expect(publicQueryTwinPath("/garden", "?kind=plant")).toBeNull();
  });

  it("reads every journal filter only through its mounted twin", () => {
    for (const key of [
      "q",
      "kind",
      "catalog",
      "topic",
      "season",
      "region",
      "sort",
      "page",
    ]) {
      for (const prefix of ["", "/uk", "/bg", "/ru"]) {
        expect(publicQueryTwinPath(`${prefix}/journals`, `?${key}=value`)).toBe(
          "/q/journals",
        );
      }
    }
    expect(publicQueryTwinPath("/journals", "?utm_source=mail")).toBeNull();
    expect(publicQueryTwinPath("/journals", "?q=&kind=")).toBeNull();
  });

  it("routes every catalog facet, including repeated values, to its twin", () => {
    for (const key of [
      "kingdom",
      "rank",
      "register",
      "grown",
      "letter",
      "q",
      "sort",
      "page",
    ]) {
      for (const prefix of ["", "/uk", "/bg", "/ru"]) {
        expect(publicQueryTwinPath(`${prefix}/catalog`, `?${key}=value`)).toBe(
          "/q/catalog",
        );
      }
    }
    expect(publicQueryTwinPath("/catalog", "?kingdom=&kingdom=plantae")).toBe(
      "/q/catalog",
    );
    expect(
      publicQueryTwinPath(
        "/catalog",
        new URLSearchParams("rank=&rank=cultivar"),
      ),
    ).toBe("/q/catalog");
    expect(
      publicQueryTwinPath("/catalog", "?kingdom=&rank=&utm_source=mail"),
    ).toBeNull();
    expect(publicQueryTwinPath("/catalog", "?kind=plant")).toBeNull();
  });

  it("routes profile tabs, but not viewer status or object addresses, to the mounted dynamic twin", () => {
    for (const prefix of ["", "/uk", "/bg", "/ru"]) {
      expect(publicQueryTwinPath(`${prefix}/@gardener`, "?tab=entries")).toBe(
        "/q/@gardener",
      );
      expect(
        publicQueryTwinPath(`${prefix}/@gardener`, "?profileAction=followed"),
      ).toBeNull();
      expect(
        publicQueryTwinPath(`${prefix}/@gardener`, "?utm_source=mail"),
      ).toBeNull();
      expect(
        publicQueryTwinPath(
          `${prefix}/@gardener/objects/tomato`,
          "?tab=entries",
        ),
      ).toBeNull();
    }
    expect(
      existsSync(
        path.join(process.cwd(), "src/app/[locale]/q/[profileHandle]/page.tsx"),
      ),
    ).toBe(true);
  });

  it("recognises the reserved segment with and without a locale", () => {
    for (const address of ["/q", "/q/journals", "/uk/q", "/bg/q/journals"]) {
      expect(isPublicQueryTwinPath(address), address).toBe(true);
    }
    for (const address of ["/", "/quince", "/uk", "/journals/q", "/@q"]) {
      expect(isPublicQueryTwinPath(address), address).toBe(false);
    }
  });

  it("sends a community's own facets to its twin and nothing else", () => {
    for (const prefix of ["", "/bg", "/ru"]) {
      for (const query of ["?q=томат", "?kind=plant", "?cursor=abc"]) {
        expect(
          publicQueryTwinPath(`${prefix}/communities/tomatoes`, query),
        ).toBe("/q/communities/tomatoes");
      }
      for (const query of [
        "?communityAction=joined",
        "?authIntent=follow",
        "?utm_source=mail",
        "?kind=",
      ]) {
        expect(
          publicQueryTwinPath(`${prefix}/communities/tomatoes`, query),
        ).toBeNull();
      }
      expect(
        publicQueryTwinPath(`${prefix}/communities`, "?kind=plant"),
      ).toBeNull();
      expect(
        publicQueryTwinPath(
          `${prefix}/communities/tomatoes/discussions/x`,
          "?kind=plant",
        ),
      ).toBeNull();
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
    for (const twin of PUBLIC_QUERY_TWIN_PATTERNS) {
      const page = path.join(
        process.cwd(),
        "src/app/[locale]",
        PUBLIC_QUERY_TWIN_SEGMENT,
        twin.route,
        "page.tsx",
      );
      expect(existsSync(page), page).toBe(true);
    }
  });
});
