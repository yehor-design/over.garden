import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import type { PublicLocale } from "@/lib/public-localization";
import type {
  CatalogBrowseCard,
  CatalogBrowseFacetCounts,
} from "@/server/public-catalog-browse-repository";

const { railRegistration } = vi.hoisted(() => ({
  railRegistration: vi.fn(() => null),
}));
vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: railRegistration,
  SiteShellContextRailModules: () => null,
}));
// The listing it shares rows with imports a client filter bar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalog",
  useSearchParams: () => new URLSearchParams(),
}));

import { PublicCatalogDoor } from "./public-catalog-door";

const TOMATO: CatalogBrowseCard = {
  id: "tomato",
  name: "Solanum lycopersicum",
  vernacularName: "Томат",
  path: "/species/solanum-lycopersicum",
  rank: "species",
  kingdom: "Plantae",
  registers: ["ua"],
  hasFirstHandContent: true,
  speciesName: null,
  publicSlug: "solanum-lycopersicum",
};

const FACETS: CatalogBrowseFacetCounts = {
  kingdoms: { Plantae: 65_832, Animalia: 21_844 },
  ranks: { species: 79_862, cultivar: 15_909 },
  registers: { ua: 15_402, eu: 763 },
  grown: 22,
  initials: { s: 4_120, a: 3_900 },
  total: 87_676,
};

function render(
  overrides: Partial<Parameters<typeof PublicCatalogDoor>[0]> = {},
  locale: PublicLocale = "uk",
) {
  return renderToStaticMarkup(
    <PublicCatalogDoor
      locale={locale}
      copy={getPublicCatalogBrowseCopy(locale)}
      kingdomTotals={{ Plantae: 65_832, Animalia: 21_844 }}
      firstHand={[TOMATO]}
      facets={FACETS}
      registerHubs={[
        { slug: "solanum-lycopersicum", name: "Томати", total: 1_203 },
      ]}
      state="ready"
      {...overrides}
    />,
  );
}

describe("the catalogue's door", () => {
  it("leads with a search whose scope is said out loud", () => {
    // `OVE-496`, OG-UX-012: a gardener with a tomato in their hand meets a
    // search, not page one of 114 669 names.
    const html = render();
    const form = html.slice(
      html.indexOf("<form"),
      html.indexOf("</form>") + "</form>".length,
    );
    const opening = form.slice(0, form.indexOf(">") + 1);
    expect(opening).toContain('method="get"');
    expect(opening).toContain('action="/catalog"');
    expect(opening).toContain('role="search"');
    expect(form).toContain("<legend");
    expect(form).toContain("Що шукаєте");
    // Plants are chosen until the reader says otherwise.
    expect(form).toMatch(
      /<input type="radio"[^>]*name="kingdom" checked="" value="plantae"/u,
    );
    expect(form).toMatch(/name="kingdom" value="animalia"/u);
    expect(form).toMatch(/name="kingdom" value=""/u);
    expect(form).toContain(">Усе<");
    const query = form.match(/<input[^>]*name="q"[^>]*\/?>/u)?.[0] ?? "";
    expect(query).toContain('required=""');
    expect(query).toContain('type="search"');
    expect(form).toMatch(/<button[^>]*type="submit"/u);
    // The door's heading is the task, not the register's name.
    expect(html).toContain(">Знайдіть рослину чи тварину</h1>");
    expect(html.indexOf("<form")).toBeLessThan(
      html.indexOf('id="catalog-first-hand"'),
    );
  });

  it("shows what gardeners here wrote about — only that, and how many there are", () => {
    const html = render();
    expect(html).toContain('id="catalog-first-hand"');
    expect(html).toContain('data-catalog-card="tomato"');
    expect(html).toContain('href="/catalog?grown=1"');
    expect(html).toContain("Усі, про які писали: 22");
    // Nothing on the door claims a popularity it does not have.
    expect(html).not.toMatch(/популяр|popular/iu);

    const none = render({
      firstHand: [],
      facets: { ...FACETS, grown: 0 },
    });
    expect(none).toContain("Поки ніхто тут не писав");
    expect(none).not.toContain('href="/catalog?grown=1"');
  });

  it("tells a species, its forms and the reader's own object apart, without a tutorial", () => {
    const html = render();
    const legend = html.slice(html.indexOf('id="catalog-legend"'));
    expect(legend).toContain("<dt");
    expect(legend).toContain(">Вид</dt>");
    expect(legend).toContain(">Сорт або порода</dt>");
    expect(legend).toContain(">Ваша рослина чи тварина</dt>");
  });

  it("repeats none of its sections in the context rail", () => {
    // OG-UX-015: the kingdoms and the register hubs are sections of the door;
    // a rail carrying them again would offer one choice three ways at once.
    railRegistration.mockClear();
    render();
    expect(railRegistration).not.toHaveBeenCalled();
  });

  it("keeps the whole register one explicit step away", () => {
    const html = render();
    const all = html.slice(html.indexOf('id="catalog-all"'));
    expect(all).toContain('href="/catalog?kingdom=plantae"');
    expect(all).toContain('href="/catalog?kingdom=animalia"');
    expect(all).toMatch(/87\s676/u);
    expect(all).toContain('href="/catalog?letter=s"');
    // "All letters" would be the door itself.
    expect(all).not.toContain(">Усі літери<");
    expect(html).toContain('href="/species/solanum-lycopersicum/register"');
  });

  it("hides a section whose read failed, says so, and keeps the search", () => {
    const html = render({
      firstHand: null,
      registerHubs: null,
      state: "partial",
    });
    expect(html).toContain('data-public-catalog-state="partial"');
    expect(html).toContain("Частину каталогу зараз не вдалося показати");
    expect(html).toContain('data-catalog-search-form="true"');
    expect(html).not.toContain('id="catalog-first-hand"');
    expect(html).not.toContain('id="catalog-registers"');
  });

  it("asks in the reader's language", () => {
    const bg = render({}, "bg");
    expect(bg).toContain('lang="bg"');
    expect(bg).toContain("Намерете растение или животно");
    expect(bg).toContain('action="/bg/catalog"');
    expect(bg).toContain("Какво търсите");
    const ru = render({}, "ru");
    expect(ru).toContain("Найдите растение или животное");
    expect(ru).toContain('href="/ru/catalog?letter=s"');
  });
});
