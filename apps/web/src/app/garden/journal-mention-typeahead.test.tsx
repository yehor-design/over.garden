import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
} from "@/lib/garden/journal-mentions";

import { JournalMentionTypeaheadPanel } from "./journal-mention-typeahead";

const suggestion: JournalMentionSuggestion = {
  kind: "catalog_item",
  id: "catalog-lavandula",
  label: "Lavandula angustifolia 'Hidcote'",
  insertText: "@lavandula-hidcote",
  detail: "EU Official Journal",
  disambiguationLabel: "plant_variety · la",
  catalogKind: "plant_variety",
};

const selection: JournalMentionSelection = {
  kind: "public_handle",
  id: "profile-yehor",
  label: "@yehor",
};

const localeExpectations = [
  ["uk", "Каталог", "Пов'язані згадки", "Видалити згадку @yehor"],
  [
    "bg",
    "Каталог",
    "Свързани споменавания",
    "Премахване на споменаването @yehor",
  ],
  ["ru", "Каталог", "Связанные упоминания", "Удалить упоминание @yehor"],
] as const satisfies readonly [InterfaceLocale, string, string, string][];

describe("journal mention typeahead localization", () => {
  it.each(localeExpectations)(
    "localizes mention chrome while preserving catalog and handle values in %s",
    (locale, kindLabel, linkedLabel, removeLabel) => {
      const html = renderToStaticMarkup(
        <JournalMentionTypeaheadPanel
          locale={locale}
          status="ready"
          suggestions={[suggestion]}
          selections={[selection]}
          onSelect={vi.fn()}
          onRemove={vi.fn()}
        />,
      );

      expect(html).toContain(kindLabel);
      expect(html).toContain(linkedLabel.replaceAll("'", "&#x27;"));
      expect(html).toContain(`aria-label="${removeLabel}"`);
      expect(html).toContain(suggestion.label.replaceAll("'", "&#x27;"));
      expect(html).toContain(suggestion.detail);
      expect(html).toContain(suggestion.disambiguationLabel);
      expect(html).toContain(selection.label);
      expect(html).not.toMatch(/Linked mentions|Remove mention/i);
    },
  );
});
