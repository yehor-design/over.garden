import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getPublicCatalogRegisterCopy } from "@/lib/public-catalog-register-copy";
import {
  PublicCatalogRegisterHub,
  registerNumber,
} from "./public-catalog-register-hub";
import type { CatalogRegisterHub } from "@/server/public-catalog-register-repository";

const HUB: CatalogRegisterHub = {
  speciesId: "species-1",
  speciesName: "Solanum lycopersicum",
  speciesSlug: "solanum-lycopersicum",
  speciesPath: "/species/solanum-lycopersicum",
  total: 3,
  registeredUa: 2,
  registeredEu: 1,
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

    expect(html).toContain("3 сортів Solanum lycopersicum у реєстрах");
    expect(html).toContain("2 у Держреєстрі України");
    expect(html).toContain("1 у Спільному каталозі ЄС");
    // The register number, without the scheme prefix the ingest stored.
    expect(html).toContain("09040016");
    expect(html).not.toContain("RegisterVarietis:");
    // A registered form whose number the source never carried says so rather
    // than showing an empty cell.
    expect(html).toContain("Номер не вказано");
    expect(html).not.toContain("<button");
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
    expect(
      registerNumber("EUR-Lex:ELI:C/2026/829:row:00607ae12761ac87"),
    ).toBe("ELI:C/2026/829");
    expect(registerNumber(null)).toBeNull();
    // Anything the two patterns do not describe is shown as stored rather than
    // silently truncated.
    expect(registerNumber("SOMETHING-ELSE")).toBe("SOMETHING-ELSE");
  });
});
