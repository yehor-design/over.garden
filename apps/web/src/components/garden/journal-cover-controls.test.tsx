import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import { PUBLIC_LOCALES } from "@/lib/public-localization";

import {
  describeCoverSelection,
  journalCoverPhotoLabel,
  JournalCoverControls,
  type JournalCoverEligibleInline,
  type JournalCoverSelectionState,
} from "./journal-cover-controls";

const copy = getJournalCoverControlsCopy("uk");

const ELIGIBLE: JournalCoverEligibleInline[] = [
  { mediaAssetId: "media-1", previewUrl: "/a.webp", label: "Перше фото" },
  { mediaAssetId: "media-2", previewUrl: null, label: "Друге фото" },
];

function markup(selection: JournalCoverSelectionState) {
  return renderToStaticMarkup(
    <JournalCoverControls
      copy={copy}
      selection={selection}
      eligibleInline={ELIGIBLE}
      onChange={() => undefined}
    />,
  );
}

describe("describeCoverSelection", () => {
  it("names the chosen photograph rather than its category", () => {
    expect(
      describeCoverSelection(
        { mode: "explicit_inline", mediaAssetId: "media-2" },
        ELIGIBLE,
        copy,
      ),
    ).toBe("Друге фото");
  });

  it("falls back to the category only when the photograph is unknown", () => {
    expect(
      describeCoverSelection(
        { mode: "explicit_inline", mediaAssetId: "media-gone" },
        ELIGIBLE,
        copy,
      ),
    ).toBe(copy.valueInline);
  });

  it("gives every other mode a word of its own", () => {
    expect(describeCoverSelection({ mode: "automatic" }, ELIGIBLE, copy)).toBe(
      copy.automatic,
    );
    expect(describeCoverSelection({ mode: "none" }, ELIGIBLE, copy)).toBe(
      copy.noCover,
    );
    expect(describeCoverSelection({ mode: "separate" }, ELIGIBLE, copy)).toBe(
      copy.valueSeparate,
    );
  });
});

describe("JournalCoverControls", () => {
  it("states its value in words, not in a fill (`OVE-458` AC7)", () => {
    const html = markup({ mode: "none" });
    expect(html).toContain('data-journal-cover-value="true"');
    expect(html).toContain(`${copy.currentLabel}: ${copy.noCover}`);
    expect(html).toContain('data-journal-cover-mode="none"');
  });

  it("puts the pressed state on the control a screen reader reads", () => {
    const automatic = markup({ mode: "automatic" });
    // Exactly one toggle is pressed at a time, in every state.
    for (const selection of [
      { mode: "automatic" },
      { mode: "none" },
      { mode: "explicit_inline", mediaAssetId: "media-1" },
    ] satisfies JournalCoverSelectionState[]) {
      const html = markup(selection);
      expect(html.match(/aria-pressed="true"/gu)).toHaveLength(1);
    }
    expect(automatic).toContain('aria-pressed="false"');
  });

  it("badges the chosen photograph and keeps every thumbnail's own name", () => {
    const html = markup({ mode: "explicit_inline", mediaAssetId: "media-1" });
    expect(html).toContain('data-journal-cover-selected="true"');
    // The name under a thumbnail is the photograph's, never an instruction to
    // do what has already been done.
    expect(html).toContain("Перше фото");
    expect(html).toContain("Друге фото");
    expect(html).toContain(`${copy.currentLabel}: Перше фото`);
  });

  it("offers one control per value — no two buttons doing the same thing", () => {
    const html = markup({ mode: "automatic" });
    expect(html.match(/aria-pressed=/gu)).toHaveLength(5);
  });
});

describe("journal cover copy", () => {
  it("carries the value vocabulary in every locale", () => {
    for (const locale of PUBLIC_LOCALES) {
      const localized = getJournalCoverControlsCopy(locale);
      for (const key of [
        "currentLabel",
        "valueInline",
        "valueSeparate",
      ] as const) {
        expect(localized[key].length, `${locale}.${key}`).toBeGreaterThan(0);
      }
      // A label that still carries its placeholder is a label nobody filled.
      const photo = journalCoverPhotoLabel(localized, 1);
      expect(photo, locale).toContain("2");
      expect(photo, locale).not.toContain("{index}");
    }
  });
});
