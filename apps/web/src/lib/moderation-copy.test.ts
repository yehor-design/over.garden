import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  fillModerationTemplate,
  getModerationCopy,
} from "@/lib/moderation-copy";

const LOCALES: InterfaceLocale[] = ["uk", "bg", "ru"];

describe("moderation copy (OVE-500)", () => {
  it("has the same keys in every language", () => {
    const expected = recursiveKeys(getModerationCopy("uk"));
    for (const locale of LOCALES) {
      expect(recursiveKeys(getModerationCopy(locale))).toEqual(expected);
    }
  });

  it("names every report reason and state in words, never as an enum", () => {
    for (const locale of LOCALES) {
      const copy = getModerationCopy(locale);
      for (const label of [
        ...Object.values(copy.reasons),
        ...Object.values(copy.reportStates),
      ]) {
        expect(label).not.toMatch(/_|^[a-z]+$/u);
      }
    }
  });

  it("keeps the team's vocabulary out of the owner's pages", () => {
    const text = JSON.stringify(LOCALES.map(getModerationCopy));
    expect(text).not.toMatch(
      /fail-closed|шлюз|канонічн|каноничн|канонич|audit|аудит/iu,
    );
  });

  it("fills templates by name and leaves an unknown one visible", () => {
    expect(
      fillModerationTemplate(getModerationCopy("uk").communities.openReports, {
        count: 3,
      }),
    ).toBe("Відкритих скарг: 3");
    expect(fillModerationTemplate("{title} / {missing}", { title: "A" })).toBe(
      "A / {missing}",
    );
  });
});

function recursiveKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...recursiveKeys(child, path)];
  });
}
