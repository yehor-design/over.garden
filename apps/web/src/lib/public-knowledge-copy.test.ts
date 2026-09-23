import { describe, expect, it } from "vitest";

import {
  formatPublicKnowledgeEvidenceCount,
  getPublicKnowledgeCopy,
} from "./public-knowledge-copy";

describe("public knowledge copy", () => {
  it("localizes the hub and trust boundary in every public locale", () => {
    const uk = getPublicKnowledgeCopy("uk");
    const bg = getPublicKnowledgeCopy("bg");
    const ru = getPublicKnowledgeCopy("ru");

    expect(uk.heading).toBe("Знання");
    expect(bg.heading).toBe("Знания");
    expect(ru.heading).toBe("Знания");
    // Advice and help with the product are named apart (`OVE-498`).
    for (const copy of [uk, bg, ru]) {
      expect(copy.subjects.gardening).not.toBe(copy.subjects.product);
      expect(copy.subjects.product).toContain("OverGarden");
      expect(copy.filters.types.topic.length).toBeGreaterThan(0);
    }
    expect(bg.emptyEvidenceTitle).toContain("градинари");
    expect(ru.unavailableTitle).toContain("недоступен");
    expect(uk.viewAllEvidence("9")).toBe("Усі записи (9)");
    expect(bg.viewAllEvidence("9")).toBe("Всички записи (9)");
    expect(ru.viewAllEvidence("9")).toBe("Все записи (9)");
  });

  it("says nothing about search-engine indexing to a reader", () => {
    // OG-UX-032: an internal threshold is not a quality cue.
    for (const locale of ["uk", "bg", "ru"] as const) {
      expect(JSON.stringify(getPublicKnowledgeCopy(locale))).not.toMatch(
        /індекс|индекс|перевірен|проверен/iu,
      );
    }
  });

  it("uses grammatically correct one, few, and many counts", () => {
    expect(
      formatPublicKnowledgeEvidenceCount(1, "uk", getPublicKnowledgeCopy("uk")),
    ).toBe("1 запис садівника");
    expect(
      formatPublicKnowledgeEvidenceCount(4, "uk", getPublicKnowledgeCopy("uk")),
    ).toBe("4 записи садівників");
    expect(
      formatPublicKnowledgeEvidenceCount(
        11,
        "ru",
        getPublicKnowledgeCopy("ru"),
      ),
    ).toBe("11 записей садоводов");
    expect(
      formatPublicKnowledgeEvidenceCount(1, "bg", getPublicKnowledgeCopy("bg")),
    ).toBe("1 запис на градинар");
    expect(getPublicKnowledgeCopy("uk").sourcesCount(4)).toBe("4 джерела");
    expect(getPublicKnowledgeCopy("uk").sourcesCount(5)).toBe("5 джерел");
    expect(getPublicKnowledgeCopy("ru").sourcesCount(1)).toBe("1 источник");
    expect(getPublicKnowledgeCopy("bg").aboutLink(4)).toBe(
      "4 източника и ограничения",
    );
    expect(getPublicKnowledgeCopy("uk").aboutLink(0)).toBe(
      "Основа й обмеження",
    );
  });
});
