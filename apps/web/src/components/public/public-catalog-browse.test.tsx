import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import {
  normalizePublicCatalogBrowseRequest,
  type PublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import type {
  CatalogBrowseCard,
  CatalogBrowseFacetCounts,
  CatalogBrowsePage,
} from "@/server/public-catalog-browse-repository";

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
  SiteShellContextRailModules: ({
    modules,
  }: {
    modules: Array<{ key: string; items: Array<{ href: string }> }>;
  }) => (
    <ul data-rail-modules={modules.map((module) => module.key).join(" ")}>
      {modules.flatMap((module) =>
        module.items.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.href}</a>
          </li>
        )),
      )}
    </ul>
  ),
}));

// `FilterBar` is a client component that navigates through the router once
// hydrated; a static render only needs the router's hooks to exist.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalog",
  useSearchParams: () => new URLSearchParams(),
}));

import { PublicCatalogBrowse } from "./public-catalog-browse";

const COPY = getPublicCatalogBrowseCopy("uk");

function card(overrides: Partial<CatalogBrowseCard> = {}): CatalogBrowseCard {
  return {
    id: "catalog-1",
    name: "Solanum lycopersicum",
    vernacularName: "Помідор їстівний",
    path: "/species/solanum-lycopersicum",
    rank: "species",
    kingdom: "Plantae",
    registers: [],
    hasFirstHandContent: false,
    speciesName: null,
    publicSlug: "solanum-lycopersicum",
    ...overrides,
  };
}

const FACETS: CatalogBrowseFacetCounts = {
  kingdoms: { Plantae: 65_832, Animalia: 21_844, Fungi: 6_250 },
  ranks: { species: 79_862, cultivar: 15_909 },
  registers: { ua: 15_402, eu: 763 },
  grown: 22,
  initials: { s: 4_120, a: 3_900 },
  total: 101_600,
};

function render(
  request: PublicCatalogBrowseRequest,
  page: CatalogBrowsePage,
  state: "ready" | "empty" = "ready",
) {
  return renderToStaticMarkup(
    <PublicCatalogBrowse
      locale="uk"
      copy={COPY}
      request={request}
      page={page}
      facets={FACETS}
      kingdomTotals={{ Plantae: 65_832, Animalia: 21_844 }}
      registerHubs={[
        { slug: "solanum-lycopersicum", name: "Томати", total: 9 },
      ]}
      state={state}
    />,
  );
}

describe("the catalogue's one door", () => {
  it("is one listing, with the facets in the URL and the alphabet as links", () => {
    const html = render(normalizePublicCatalogBrowseRequest(), {
      cards: [card(), card({ id: "catalog-2", name: "Apis mellifera" })],
      total: 101_600,
      pageCount: 1_694,
    });

    expect(html).toContain('data-public-catalog-browse="true"');
    expect(html).toContain('data-public-catalog-state="ready"');
    expect(html).toMatch(/<h1[^>]*>Каталог організмів<\/h1>/);

    // A real GET form to the listing's own address: the facets work for a
    // crawler and for a reader whose bundle never arrived (ADR-0024).
    expect(html).toContain('data-filter-bar-form="true"');
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/catalog"');

    // Every facet the listing speaks is a named parameter of its own.
    for (const name of ["q", "rank", "register", "grown", "sort"]) {
      expect(html, `no control for ${name}`).toContain(`name="${name}"`);
    }
    // The kingdom is the listing's one mode: links, in one place (OVE-482).
    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toContain('href="/catalog?kingdom=plantae"');

    // The alphabet is a list of anchors, not a row of buttons: a crawler
    // walks it and a keyboard reaches it without 27 tab stops in a toolbar.
    expect(html).toContain('href="/catalog?letter=s"');
    expect(html).toContain('href="/catalog?letter=a"');
    // A letter nothing is filed under is not a link at all.
    expect(html).toContain('aria-disabled="true"');

    expect(html).toContain("Solanum lycopersicum");
    expect(html).toContain("Apis mellifera");
  });

  it("shows the five facts a result card owes a reader", () => {
    const html = render(normalizePublicCatalogBrowseRequest(), {
      cards: [
        card({ registers: ["ua", "eu"], hasFirstHandContent: true }),
        card({
          id: "catalog-3",
          name: "Malus 'Antonivka'",
          vernacularName: null,
          rank: "cultivar",
          path: "/variety/malus-antonivka",
        }),
      ],
      total: 2,
      pageCount: 1,
    });

    // Accepted name, the reader's own name for it, the rank, the registers,
    // and whether a gardener here has written about it.
    expect(html).toContain("Solanum lycopersicum");
    expect(html).toContain("Помідор їстівний");
    expect(html).toContain("Вид");
    // A page is sixty of these: a list of things is a list (DESIGN.md §4.1),
    // not sixty bordered boxes for sixty one-line names.
    expect(html).toContain('data-slot="list-row"');
    expect(html).not.toContain('data-slot="card"');
    expect(html).toContain("Сорт");
    expect(html).toContain("Реєстр України");
    expect(html).toContain("Реєстр ЄС");
    expect(html).toContain("Є записи садівників");

    // A binomial is Latin whatever the page's language; a denomination a
    // gardener chose is not (WCAG 3.1.2).
    expect(html).toMatch(/lang="la"[^>]*>Solanum lycopersicum/u);
    expect(html).not.toMatch(/lang="la"[^>]*>Malus/u);
  });

  it("says what is filtered, and offers a way back out of it", () => {
    const request = normalizePublicCatalogBrowseRequest({
      kingdom: "fungi",
      grown: "1",
      q: "amanita",
    });
    const html = render(
      request,
      { cards: [], total: 0, pageCount: 1 },
      "empty",
    );

    expect(html).toContain('data-public-catalog-state="empty"');
    // Something does exist and the filters excluded it, so the state carries
    // no illustration and the filters are what the reader is shown.
    expect(html).toContain('data-screen-state="empty-no-results"');
    expect(html).not.toContain("/illustrations/");
    expect(html).toContain("Гриби");
    expect(html).toContain("amanita");
    expect(html).toContain("Лише ті, про які писали");
    // Each chip removes exactly its own filter, as a real href.
    expect(html).toContain('href="/catalog?q=amanita&amp;grown=1"');
    expect(html).toContain('href="/catalog?kingdom=fungi&amp;grown=1"');
  });

  it("carries the letter through a facet change, rather than dropping it", () => {
    const request = normalizePublicCatalogBrowseRequest({ letter: "s" });
    const html = render(request, {
      cards: [card()],
      total: 1,
      pageCount: 1,
    });

    // The letter is a facet of the same listing. If the form did not carry it,
    // changing a select would silently drop the reader back to the whole
    // catalogue — which is the defect the journals directory shipped once.
    expect(html).toMatch(/name="letter"[^>]*value="s"/u);
  });

  it("counts every option against the rest of the filters, not against itself", () => {
    const html = render(
      normalizePublicCatalogBrowseRequest({ kingdom: "plantae" }),
      { cards: [card()], total: 65_832, pageCount: 1_098 },
    );

    // Choosing Plantae must not make every other kingdom read zero, or the
    // reader has no way to see that Animalia holds 21 844 and switch to it.
    // The number is grouped in the reader's own language: at catalogue scale
    // `65832` is unreadable, and the bar formats nothing itself.
    expect(html).toContain((21_844).toLocaleString("uk"));
    expect(html).toContain((65_832).toLocaleString("uk"));
    expect(html).not.toContain("(21844)");
  });

  it("is complete without the context rail, from a filtered view too", () => {
    // DESIGN.md §3.2: the rail is never the only home of an action. The
    // filter bar narrows the view a reader is *in* — from "grown here" its
    // plants link is `?grown=1&kingdom=plantae` — so the whole kingdom, which
    // the rail offers, was reachable at `xl` and nowhere else.
    const html = render(normalizePublicCatalogBrowseRequest({ grown: "1" }), {
      cards: [card()],
      total: 22,
      pageCount: 1,
    });

    expect(html).toMatch(
      /xl:hidden[^>]*>\s*<ul data-rail-modules="catalog-kingdoms">/u,
    );
    expect(html).toContain('<a href="/catalog?kingdom=plantae">');
    expect(html).toContain('<a href="/catalog?kingdom=animalia">');
    // The registers already have a section of their own at every width.
    expect(html).not.toContain('data-rail-modules="catalog-registers"');
    expect(html.match(/id="catalog-registers"/gu)).toHaveLength(1);
  });

  it("keeps the count in one live region that survives a filter change", () => {
    const html = render(normalizePublicCatalogBrowseRequest(), {
      cards: [card()],
      total: 101_600,
      pageCount: 1_694,
    });

    const regions = [...html.matchAll(/data-catalog-result-count="true"/gu)];
    expect(regions).toHaveLength(1);
    expect(html).toMatch(
      /data-catalog-result-count="true"[^>]*aria-live="polite"/u,
    );
  });
  it("names the species a form belongs to, and offers nothing to add", () => {
    // `OVE-496`: a cultivar called "Де Барао" says nothing on its own.
    const html = render(normalizePublicCatalogBrowseRequest({ q: "де" }), {
      cards: [
        card({
          id: "de-barao",
          name: "Де Барао",
          rank: "cultivar",
          vernacularName: null,
          speciesName: "томат",
          publicSlug: "de-barao",
        }),
        card({
          id: "chanterelle",
          name: "Cantharellus cibarius",
          kingdom: "Fungi",
          vernacularName: "Лисичка",
          publicSlug: "cantharellus-cibarius",
        }),
      ],
      total: 2,
      pageCount: 1,
    });

    expect(html).toContain(
      '<span data-catalog-card-species="true">Сорт виду «томат»</span>',
    );
    // «Додати в мій сад» is gone from every organism (`OVE-519`).
    expect(html).not.toContain("data-catalog-add-to-garden");
    expect(html).not.toContain("/garden/objects/new");
    // A species is its own species.
    expect(
      render(normalizePublicCatalogBrowseRequest({ q: "solanum" }), {
        cards: [card({ speciesName: "томат" })],
        total: 1,
        pageCount: 1,
      }),
    ).not.toContain("data-catalog-card-species");
  });

  it("offers the same search across every kingdom when the chosen one has none", () => {
    const html = render(
      normalizePublicCatalogBrowseRequest({ q: "бджола", kingdom: "plantae" }),
      { cards: [], total: 0, pageCount: 1 },
      "empty",
    );
    // The kingdom counts ignore the kingdom filter, so they are that number.
    expect(html).toContain('data-catalog-search-everywhere="true"');
    expect(html).toContain("Шукати в усьому каталозі (93");
    expect(html).toContain(`href="/catalog?q=${encodeURIComponent("бджола")}"`);
  });

  it("is one step from the door", () => {
    const html = render(normalizePublicCatalogBrowseRequest({ letter: "s" }), {
      cards: [card()],
      total: 1,
      pageCount: 1,
    });
    expect(html).toMatch(
      /<a[^>]*href="\/catalog"[^>]*data-catalog-door-link="true"|data-catalog-door-link="true"[^>]*href="\/catalog"/u,
    );
  });
});
