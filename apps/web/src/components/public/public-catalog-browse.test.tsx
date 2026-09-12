import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import { PublicCatalogBrowse } from "./public-catalog-browse";
import type {
  CatalogBrowseCard,
  CatalogBrowseKingdomSummary,
} from "@/server/public-catalog-browse-repository";

const kingdoms: CatalogBrowseKingdomSummary[] = [
  {
    kingdom: "Plantae",
    total: 65_811,
    initials: [
      { initial: "a", total: 4_010 },
      { initial: "s", total: 3_120 },
    ],
  },
  {
    kingdom: "Animalia",
    total: 27_640,
    initials: [{ initial: "a", total: 2_100 }],
  },
];

const firstHand: CatalogBrowseCard[] = [
  {
    id: "card-1",
    name: "Solanum lycopersicum L.",
    path: "/species/solanum-lycopersicum",
    rank: "species",
    hasFirstHandContent: true,
  },
];

function markup(node: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(node);
}

/**
 * The whole point of this page is the crawl path, and a crawl path made of
 * buttons is not one: ADR-0024 requires it to work with JavaScript off, and
 * `renderToStaticMarkup` is exactly what a crawler without JavaScript sees.
 */
describe("the catalog browse page", () => {
  it("reaches every kingdom and initial with a plain anchor", () => {
    const html = markup(
      <PublicCatalogBrowse
        locale="uk"
        copy={getPublicCatalogBrowseCopy("uk")}
        request={{ kingdom: null, initial: null, page: 1 }}
        kingdoms={kingdoms}
        firstHand={firstHand}
        page={null}
      />,
    );

    expect(html).toContain('href="/species?kingdom=plantae"');
    expect(html).toContain('href="/species?kingdom=animalia"');
    expect(html).toContain('href="/species?kingdom=plantae&amp;letter=s"');
    // The indexable cards are on the root, which is what puts them three
    // clicks from `/` rather than four.
    expect(html).toContain('href="/species/solanum-lycopersicum"');
    expect(html).not.toContain("<button");
  });

  it("greys an initial nothing is filed under instead of linking it", () => {
    const html = markup(
      <PublicCatalogBrowse
        locale="uk"
        copy={getPublicCatalogBrowseCopy("uk")}
        request={{ kingdom: null, initial: null, page: 1 }}
        kingdoms={kingdoms}
        firstHand={[]}
        page={null}
      />,
    );

    expect(html).toContain('href="/species?kingdom=animalia&amp;letter=a"');
    expect(html).not.toContain('href="/species?kingdom=animalia&amp;letter=s"');
  });

  it("links the organisms of a kingdom and its next page", () => {
    const html = markup(
      <PublicCatalogBrowse
        locale="bg"
        copy={getPublicCatalogBrowseCopy("bg")}
        request={{ kingdom: "Plantae", initial: "s", page: 2 }}
        kingdoms={kingdoms}
        firstHand={[]}
        page={{
          total: 180,
          pageCount: 3,
          cards: [
            {
              id: "card-2",
              name: "Salvia officinalis",
              path: "/species/salvia-officinalis",
              rank: "species",
              hasFirstHandContent: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('href="/bg/species/salvia-officinalis"');
    expect(html).toContain(
      'href="/bg/species?kingdom=plantae&amp;letter=s&amp;page=3"',
    );
    expect(html).toContain(
      'href="/bg/species?kingdom=plantae&amp;letter=s"',
    );
    expect(html).toContain("Страница 2 от 3");
  });

  it("says so when an initial holds nothing, rather than showing an empty list", () => {
    const html = markup(
      <PublicCatalogBrowse
        locale="uk"
        copy={getPublicCatalogBrowseCopy("uk")}
        request={{ kingdom: "Fungi", initial: "q", page: 1 }}
        kingdoms={kingdoms}
        firstHand={[]}
        page={{ total: 0, pageCount: 1, cards: [] }}
      />,
    );

    expect(html).toContain("На цю літеру тут поки нічого немає.");
  });
});
