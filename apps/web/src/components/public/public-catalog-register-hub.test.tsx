import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { registerNumber } from "@/lib/catalog/source-names";
import { getPublicCatalogRegisterCopy } from "@/lib/public-catalog-register-copy";
import { PublicCatalogRegisterHub } from "./public-catalog-register-hub";
import type { CatalogRegisterHub } from "@/server/public-catalog-register-repository";

const HUB: CatalogRegisterHub = {
  speciesId: "species-1",
  speciesName: "Solanum lycopersicum",
  speciesDisplayName: "помідор їстівний",
  speciesKingdom: "Plantae",
  speciesSlug: "solanum-lycopersicum",
  speciesPath: "/species/solanum-lycopersicum",
  total: 4,
  registeredUa: 2,
  registeredEu: 1,
  query: "",
  matching: 4,
  page: 1,
  pageCount: 1,
  forms: [
    {
      id: "form-1",
      name: "Advance",
      path: "/species/solanum-lycopersicum/advance",
      registeredUa: true,
      registeredEu: false,
      uaRegisterNumber: "RegisterVarietis:09040016",
      euCatalogueReference: null,
    },
    {
      id: "form-2",
      name: "Elietta",
      path: "/species/solanum-lycopersicum/elietta",
      registeredUa: false,
      registeredEu: true,
      uaRegisterNumber: null,
      euCatalogueReference: "EUR-Lex:ELI:C/2026/829:row:00607ae12761ac87",
    },
    {
      id: "form-3",
      name: "Незнайомець",
      path: "/species/solanum-lycopersicum/neznaiomets",
      registeredUa: true,
      registeredEu: false,
      uaRegisterNumber: null,
      euCatalogueReference: null,
    },
    {
      id: "form-4",
      name: "Бабусин",
      path: "/species/solanum-lycopersicum/babusyn",
      registeredUa: false,
      registeredEu: false,
      uaRegisterNumber: null,
      euCatalogueReference: null,
    },
  ],
};

/**
 * The hub is the argument of ADR-0029 D13 item 4: a card built only from
 * sources stays `noindex` (ADR-0026 D9), and the aggregation over those cards
 * is what is worth indexing. So it has to carry facts no card carries, and
 * every row has to be a link a crawler can follow without JavaScript.
 */
describe("a species' register hub", () => {
  it("says the count, the split, and every form's register number", () => {
    const html = renderToStaticMarkup(
      <PublicCatalogRegisterHub
        locale="uk"
        copy={getPublicCatalogRegisterCopy("uk")}
        hub={HUB}
      />,
    );

    // `OVE-497`: the heading names what the rows are — a plant's cultivars —
    // in the reader's language, and no longer claims a register for all.
    expect(html).toContain(">Сорти виду «помідор їстівний»</h1>");
    expect(html).toContain("Усього: 4");
    expect(html).toContain("2 у Держреєстрі України");
    expect(html).toContain("1 у Спільному каталозі ЄС");
    // The register number, without the scheme prefix the ingest stored.
    expect(html).toContain("09040016");
    expect(html).not.toContain("RegisterVarietis:");
    // A registered form whose number the source never carried says so rather
    // than showing an empty cell.
    expect(html).toContain("Номер не вказано");
    // And a form in neither register says that, not "no number".
    expect(html).toContain("Не в цих реєстрах");
  });

  it("links every form and the species it belongs to", () => {
    const html = renderToStaticMarkup(
      <PublicCatalogRegisterHub
        locale="bg"
        copy={getPublicCatalogRegisterCopy("bg")}
        hub={HUB}
      />,
    );

    expect(html).toContain('href="/bg/species/solanum-lycopersicum/advance"');
    expect(html).toContain('href="/bg/species/solanum-lycopersicum/elietta"');
    expect(html).toContain('href="/bg/species/solanum-lycopersicum"');
  });

  it("reads a register identifier the way a reader would quote it", () => {
    expect(registerNumber("RegisterVarietis:09040016")).toBe("09040016");
    expect(registerNumber("EUR-Lex:ELI:C/2026/829:row:00607ae12761ac87")).toBe(
      "ELI:C/2026/829",
    );
    expect(registerNumber(null)).toBeNull();
    // Anything the two patterns do not describe is shown as stored rather than
    // silently truncated.
    expect(registerNumber("SOMETHING-ELSE")).toBe("SOMETHING-ELSE");
  });

  it("is a real table, named and scoped, not a grid of divs", () => {
    const html = renderToStaticMarkup(
      <PublicCatalogRegisterHub
        locale="uk"
        copy={getPublicCatalogRegisterCopy("uk")}
        hub={HUB}
      />,
    );

    // DESIGN.md §8: a caption and a `scope` on every header are what let a
    // screen reader read a cell as "row three, реєстр, 09040016" rather than
    // as a number with no subject. The caption may be hidden, never absent.
    expect(html).toContain("<caption");
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('data-slot="table"');

    // And nothing here reaches for the pre-redesign palette any more.
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground");
  });

  it("searches and pages in the address, so Back returns to the same view", () => {
    // `OVE-497`: a species can have four thousand forms. A real GET form to
    // the hub itself, the search kept in the field, and page links that keep
    // the search.
    const html = renderToStaticMarkup(
      <PublicCatalogRegisterHub
        locale="uk"
        copy={getPublicCatalogRegisterCopy("uk")}
        hub={{ ...HUB, query: "пунто", matching: 250, page: 2, pageCount: 3 }}
      />,
    );
    const form = html.slice(
      html.indexOf("<form"),
      html.indexOf("</form>") + "</form>".length,
    );
    expect(form).toMatch(/method="get"/u);
    expect(form).toContain('action="/species/solanum-lycopersicum/register"');
    expect(form).toContain('role="search"');
    expect(form).toMatch(/<input[^>]*name="q"[^>]*value="пунто"/u);
    expect(html).toContain("За «пунто» знайдено: 250");
    expect(html).toContain('href="/species/solanum-lycopersicum/register"');
    expect(html).toContain(
      'href="/species/solanum-lycopersicum/register?q=%D0%BF%D1%83%D0%BD%D1%82%D0%BE"',
    );
    expect(html).toContain(
      'href="/species/solanum-lycopersicum/register?q=%D0%BF%D1%83%D0%BD%D1%82%D0%BE&amp;page=3"',
    );
    expect(html).toContain("Сторінка 2 з 3");
  });

  it("says a search found nothing, and offers every form back", () => {
    const html = renderToStaticMarkup(
      <PublicCatalogRegisterHub
        locale="ru"
        copy={getPublicCatalogRegisterCopy("ru")}
        hub={{ ...HUB, query: "ыыы", matching: 0, forms: [] }}
      />,
    );
    expect(html).toContain("По «ыыы» ничего не найдено.");
    expect(html).toContain(">Показать все<");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('data-slot="pagination"');
  });

  it("calls an animal's forms breeds", () => {
    const html = renderToStaticMarkup(
      <PublicCatalogRegisterHub
        locale="bg"
        copy={getPublicCatalogRegisterCopy("bg")}
        hub={{
          ...HUB,
          speciesDisplayName: "медоносна пчела",
          speciesKingdom: "Animalia",
        }}
      />,
    );
    expect(html).toContain(">Породи на вида „медоносна пчела“</h1>");
  });
});
