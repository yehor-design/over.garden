import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
} from "@/lib/garden/journal-mentions";

import {
  JournalMentionTypeaheadPanel,
  parseJournalMentionSuggestions,
  toMentionSelection,
} from "./journal-mention-typeahead";

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

  it("keeps the stable user id server-only while rendering an opaque handle selection", () => {
    const targetUserId = "00000000-0000-4000-8000-000000000010";
    const opaqueSelectionId =
      "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.CCCCCCCCCCCCCCCCCCCCCC";
    const [parsed] = parseJournalMentionSuggestions({
      suggestions: [
        {
          kind: "public_handle",
          id: opaqueSelectionId,
          label: "@green_garden",
          insertText: "@green_garden",
          detail: "Public gardener handle",
          disambiguationLabel: "Green Garden",
          catalogKind: null,
        },
      ],
    });

    expect(parsed).toBeDefined();
    expect(toMentionSelection(parsed!)).toEqual({
      kind: "public_handle",
      id: opaqueSelectionId,
      label: "@green_garden",
    });

    const html = renderToStaticMarkup(
      <JournalMentionTypeaheadPanel
        locale="uk"
        status="ready"
        suggestions={[parsed!]}
        selections={[toMentionSelection(parsed!)]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(html).toContain("@green_garden");
    expect(html).toContain("Green Garden");
    expect(html).not.toContain(targetUserId);

    expect(
      parseJournalMentionSuggestions({
        suggestions: [
          {
            kind: "public_handle",
            id: targetUserId,
            label: "@green_garden",
            insertText: "@green_garden",
            detail: "Public gardener handle",
            disambiguationLabel: "Green Garden",
            catalogKind: null,
          },
        ],
      }),
    ).toEqual([]);
  });
});
