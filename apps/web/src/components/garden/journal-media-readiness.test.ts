import { describe, expect, it } from "vitest";

import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import { PUBLIC_LOCALES } from "@/lib/public-localization";

import {
  journalMediaReadinessText,
  summarizeJournalMediaReadiness,
} from "./journal-media-readiness";

/**
 * Publish readiness, all photographs at once (`OVE-487` criterion 2): how many
 * are ready, how many Publish waits for, and which must be retried or removed.
 * "Ready" is always ready to publish — never "uploaded" or "published".
 */
describe("journal media readiness", () => {
  const labels = getStructuredJournalComposerLabels("uk");

  it("says nothing for a note without photographs", () => {
    const summary = summarizeJournalMediaReadiness([], new Map());
    expect(journalMediaReadinessText(summary, labels)).toBeNull();
  });

  it("counts what Publish will wait for, a photograph with no state included", () => {
    const summary = summarizeJournalMediaReadiness(
      ["a", "b", "c"],
      new Map([
        ["a", { status: "ready" as const, source: "staged" as const }],
        ["b", { status: "encoding" as const, source: "staged" as const }],
      ]),
    );
    expect(summary).toMatchObject({ total: 3, ready: 1, preparing: 2 });
    expect(journalMediaReadinessText(summary, labels)).toBe(
      "Готуємо фото: 1 з 3. «Опублікувати» зачекає на решту.",
    );
  });

  it("names every failed photograph by its position", () => {
    const summary = summarizeJournalMediaReadiness(
      ["a", "b", "c"],
      new Map([
        ["a", { status: "failed" as const, source: "staged" as const }],
        ["b", { status: "ready" as const, source: "staged" as const }],
        ["c", { status: "failed" as const, source: "staged" as const }],
      ]),
    );
    expect(summary.failedMediaAssetIds).toEqual(["a", "c"]);
    expect(journalMediaReadinessText(summary, labels)).toBe(
      "Не вдалося підготувати: Фото 1, Фото 3. Повторіть або приберіть, щоб опублікувати.",
    );
  });

  it("promises publication only together with the entry", () => {
    const summary = summarizeJournalMediaReadiness(
      ["a"],
      new Map([["a", { status: "ready" as const, source: "staged" as const }]]),
    );
    for (const locale of PUBLIC_LOCALES) {
      const text = journalMediaReadinessText(
        summary,
        getStructuredJournalComposerLabels(locale),
      );
      expect(text, locale).toContain("1");
      expect(text, locale).not.toMatch(
        /завантажено|збережено|опубліковано|качен|запазен|публикуван[аио]\b|загружено|сохранено|опубликовано/iu,
      );
    }
  });

  it("stays quiet while editing photographs that are already published", () => {
    const summary = summarizeJournalMediaReadiness(
      ["a"],
      new Map([
        ["a", { status: "ready" as const, source: "existing" as const }],
      ]),
    );
    expect(journalMediaReadinessText(summary, labels)).toBeNull();
  });
});
