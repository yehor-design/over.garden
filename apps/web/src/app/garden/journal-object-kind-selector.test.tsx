import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { JournalObjectKindSelector } from "./journal-object-kind-selector";

describe("journal object kind selector", () => {
  it.each([
    ["uk", ["Рослина", "Тварина", "Бджолосім'я"]],
    ["bg", ["Растение", "Животно", "Пчелно семейство"]],
    ["ru", ["Растение", "Животное", "Пчелиная семья"]],
  ] as const)(
    "keeps plants, animals, and bee colonies explicit in %s",
    (locale, labels) => {
      const html = renderToStaticMarkup(
        <JournalObjectKindSelector
          locale={locale}
          value="animal"
          onChange={vi.fn()}
        />,
      );

      for (const label of labels) {
        expect(html).toContain(label.replaceAll("'", "&#x27;"));
      }
      expect(html).toContain('data-object-kind="animal"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain("break-words");
      expect(html).not.toMatch(/car|vehicle/i);
    },
  );
});
