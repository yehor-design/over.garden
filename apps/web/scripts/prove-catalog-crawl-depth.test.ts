import { describe, expect, it } from "vitest";

import {
  crawlForOrganisms,
  documentLinks,
  isOrganismPath,
} from "./prove-catalog-crawl-depth";

describe("the crawl-depth proof", () => {
  it("follows only same-origin anchors in the served markup", () => {
    const html = `
      <a href="/species">catalog</a>
      <a href="/species?kingdom=plantae">plants</a>
      <a href="https://example.com/away">away</a>
      <a href="//cdn.example.com/x">protocol relative</a>
      <a href="/api/health">api</a>
      <a href="/garden/entries">workspace</a>
      <a href="/species#top">fragment of a path it already has</a>
      <button data-href="/species/never">not a link</button>
    `;

    expect(documentLinks(html)).toEqual([
      "/species",
      "/species?kingdom=plantae",
    ]);
  });

  it("knows an organism address from a browse view", () => {
    expect(isOrganismPath("/species/solanum-lycopersicum")).toBe(true);
    expect(isOrganismPath("/bg/species/solanum-lycopersicum")).toBe(true);
    expect(isOrganismPath("/species/solanum-lycopersicum/bull-s-heart")).toBe(
      true,
    );
    expect(isOrganismPath("/variety/bull-s-heart")).toBe(true);
    expect(isOrganismPath("/species")).toBe(false);
    expect(isOrganismPath("/species?kingdom=plantae")).toBe(false);
    expect(isOrganismPath("/journals")).toBe(false);
  });

  // The acceptance criterion of OVE-431, measured on a fixture site shaped
  // like the real one: home → knowledge → catalog → kingdom → organism is
  // four clicks, and the proof fails the moment it becomes five.
  it("reports the shallowest depth at which an organism appears", async () => {
    const site: Record<string, string> = {
      "/": '<a href="/knowledge">knowledge</a><a href="/journals">journals</a>',
      "/knowledge": '<a href="/species">catalog</a>',
      "/journals": '<a href="/knowledge">knowledge</a>',
      "/species":
        '<a href="/species?kingdom=plantae">plants</a><a href="/species?kingdom=fungi">fungi</a>',
      "/species?kingdom=plantae":
        '<a href="/species/solanum-lycopersicum">tomato</a><a href="/species/apis-mellifera">bee</a>',
      "/species?kingdom=fungi": "<p>nothing yet</p>",
    };

    const result = await crawlForOrganisms({
      baseUrl: "https://example.test",
      maxDepth: 4,
      maxFetches: 50,
      fetchPath: async (path) => site[path] ?? null,
    });

    expect(result.catalogFrontDoorDepth).toBe(2);
    expect(result.organismDepth).toBe(4);
    expect(result.organismsFound).toBe(2);
    expect(result.pathToFirstOrganism).toEqual([
      "/",
      "/knowledge",
      "/species",
      "/species?kingdom=plantae",
      "/species/solanum-lycopersicum",
    ]);
  });

  it("reports no organism at all when nothing links to one", async () => {
    const result = await crawlForOrganisms({
      baseUrl: "https://example.test",
      maxDepth: 4,
      maxFetches: 50,
      fetchPath: async (path) =>
        path === "/" ? '<a href="/journals">journals</a>' : "<p>end</p>",
    });

    expect(result.organismDepth).toBeNull();
    expect(result.organismsFound).toBe(0);
  });
});
