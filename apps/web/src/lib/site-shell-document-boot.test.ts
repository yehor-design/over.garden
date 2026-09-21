import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalSiteShellPath,
  resolveSiteShellSection,
  resolveSiteShellSecondary,
  SITE_SHELL_SECTION_ATTRIBUTE,
  siteShellDocumentBootScript,
  siteShellSectionMatchers,
} from "./site-shell-navigation";

/** Runs the inline script the way a document does, against a stand-in. */
function bootSection(pathname: string): string | null {
  let section: string | null = null;
  const run = new Function(
    "document",
    "location",
    siteShellDocumentBootScript(),
  );
  run(
    {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          if (name === SITE_SHELL_SECTION_ATTRIBUTE) section = value;
        },
      },
    },
    { pathname },
  );
  return section;
}

describe("the current section, before React is there to say so (ADR-0032 D3)", () => {
  it("marks the same item the rendered navigation marks", () => {
    // The inline script is a second implementation of the matcher, in the one
    // place a module cannot be imported. This is what keeps the two one rule.
    for (const pathname of [
      "/",
      "/uk",
      "/bg",
      "/journals",
      "/bg/journals",
      "/journal/polyv",
      "/catalog",
      "/ru/catalog",
      "/species/solanum-lycopersicum",
      "/species/solanum-lycopersicum/de-barao",
      "/variety/x",
      "/lineage/objects/0b1c2d3e-4f50-4a61-8b72-9c83d94e05f6",
      "/communities",
      "/communities/tomaty/discussions/1",
      "/knowledge",
      "/guides/start",
      "/blog",
      "/blog/field-note",
      "/markets/ukraine",
      "/feed",
      "/notifications",
      "/bookmarks",
      "/wishlist",
      "/garden",
      "/garden/lineage/claims",
      "/garden/profile",
      "/@yehor",
      "/%40yehor/post/3",
      "/privacy",
      "/journals/",
      "/feedback",
    ]) {
      expect(bootSection(pathname), pathname).toBe(
        resolveSiteShellSection(pathname),
      );
    }
  });

  it("agrees with the shell on one spelling of an address", () => {
    expect(canonicalSiteShellPath("/uk/journals")).toBe("/journals");
    expect(canonicalSiteShellPath("/bg/%40green_thumb/post/3")).toBe(
      "/@green_thumb/post/3",
    );
    expect(canonicalSiteShellPath("/uk")).toBe("/");
    expect(canonicalSiteShellPath("/ru/journals/?page=2#top")).toBe(
      "/journals",
    );
  });

  it("has a rule in globals.css for every item an address can light up", () => {
    const globals = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    // A selector cannot compare two attributes, so there is one per key, and a
    // key added to the navigation without one would simply never be marked
    // before hydration.
    for (const { key } of siteShellSectionMatchers()) {
      expect(globals, key).toContain(
        `html[${SITE_SHELL_SECTION_ATTRIBUTE}="${key}"]`,
      );
      expect(globals, key).toContain(`[data-site-shell-nav-item="${key}"]`);
    }
  });
});

describe("secondary navigation before paint", () => {
  it.each([
    "/",
    "/bg/feed",
    "/ru/journals",
    "/catalog",
    "/bg/communities",
    "/@yehor",
    "/@yehor/post/11",
    "/@yehor/objects/tomato",
    "/garden",
    "/support",
  ])("agrees with enhanced navigation at %s", (pathname) => {
    const attrs = new Map<string, string>();
    new Function("document", "location", siteShellDocumentBootScript())(
      {
        documentElement: {
          setAttribute: (name: string, value: string) => attrs.set(name, value),
          removeAttribute: (name: string) => attrs.delete(name),
        },
      },
      { pathname },
    );
    expect(attrs.get("data-shell-secondary") ?? null).toBe(
      resolveSiteShellSecondary(pathname),
    );
  });
});
