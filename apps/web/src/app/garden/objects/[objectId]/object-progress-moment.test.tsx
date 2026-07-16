import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";

import { ObjectProgressMoment } from "./object-progress-moment";

describe("ObjectProgressMoment", () => {
  it.each([
    ["uk", "Прогрес живого об'єкта", "Раніше"],
    ["bg", "Напредък на живия обект", "По-ранна снимка"],
    ["ru", "Прогресс живого объекта", "Ранее"],
  ] as const satisfies readonly [InterfaceLocale, string, string][])(
    "renders a localized private chronological readback in %s with derivative-only media",
    (locale, title, earlierPhoto) => {
      const html = renderToStaticMarkup(
        <ObjectProgressMoment
          locale={locale}
          objectName="Balcony tomato"
          entries={[
            {
              id: "entry-1",
              title: "First check-in",
              body: "Planted the seedling and watered lightly.",
              entryDate: "2026-06-01",
              mediaPublicUrl: "https://media.over.garden/earlier.webp",
            },
            {
              id: "entry-2",
              title: "First flowers",
              body: "Two small yellow flowers opened today.",
              entryDate: "2026-06-15",
              mediaPublicUrl: "https://media.over.garden/latest.webp",
            },
          ]}
        />,
      );

      expect(html).toContain(title.replaceAll("'", "&#x27;"));
      expect(html).toContain(earlierPhoto);
      expect(html).toContain("Balcony tomato");
      expect(html).toContain("First check-in");
      expect(html).toContain("First flowers");
      expect(html).toContain("2026");
      expect(html).toContain("https://media.over.garden/earlier.webp");
      expect(html).toContain("https://media.over.garden/latest.webp");
      expect(html).not.toMatch(/Your plant progress|only you can see this/i);
      expect(html).not.toMatch(/[рг]\.\./u);
      expect(html).not.toContain("derivative_key");
      expect(html).not.toContain("quarantine");
    },
  );
});
