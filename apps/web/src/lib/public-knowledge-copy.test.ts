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
    expect(uk.editorialLabel).not.toBe(uk.journalEvidenceLabel);
    expect(bg.emptyEvidenceTitle).toContain("публични");
    expect(ru.unavailableTitle).toContain("недоступен");
    expect(uk.viewAllEvidence).toBe("Відкрити пов'язані журнали");
    expect(bg.viewAllEvidence).toBe("Отворете свързани дневници");
    expect(ru.viewAllEvidence).toBe("Открыть связанные журналы");
    expect(
      [uk, bg, ru].every((copy) => copy.filters.types.topic.length > 0),
    ).toBe(true);
  });

  it("uses grammatically correct one, few, and many evidence counts", () => {
    expect(
      formatPublicKnowledgeEvidenceCount(1, "uk", getPublicKnowledgeCopy("uk")),
    ).toBe("1 публічний запис");
    expect(
      formatPublicKnowledgeEvidenceCount(4, "uk", getPublicKnowledgeCopy("uk")),
    ).toBe("4 публічні записи");
    expect(
      formatPublicKnowledgeEvidenceCount(
        11,
        "ru",
        getPublicKnowledgeCopy("ru"),
      ),
    ).toBe("11 публичных записей");
    expect(
      formatPublicKnowledgeEvidenceCount(1, "bg", getPublicKnowledgeCopy("bg")),
    ).toBe("1 публичен запис");
  });
});
