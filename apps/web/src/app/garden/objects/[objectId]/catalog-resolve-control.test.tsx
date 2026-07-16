import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";

import { CatalogResolveControl } from "./catalog-resolve-control";

const expectations = [
  ["uk", "Зіставити цей об'єкт із каталогом", "Відповідність каталогу"],
  ["bg", "Съпоставяне на обекта с каталога", "Съвпадение в каталога"],
  ["ru", "Сопоставить объект с каталогом", "Соответствие каталогу"],
] as const satisfies readonly [InterfaceLocale, string, string][];

describe("CatalogResolveControl localization", () => {
  it.each(expectations)(
    "localizes catalog controls in %s and preserves the catalog value",
    (locale, title, matchLabel) => {
      const catalogValue = "Solanum lycopersicum 'Balconi Red'";
      const html = renderToStaticMarkup(
        <CatalogResolveControl
          locale={locale}
          objectId="object-1"
          currentVarietyText={catalogValue}
          currentVarietyState="user_added"
          action={vi.fn()}
        />,
      );

      expect(html).toContain(title.replaceAll("'", "&#x27;"));
      expect(html).toContain(matchLabel);
      expect(html).toContain(catalogValue.replaceAll("'", "&#x27;"));
      expect(html).not.toMatch(
        /Match this object to the catalog|No catalog match chosen yet|Search seeded catalog/i,
      );
    },
  );
});
