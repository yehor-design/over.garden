import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOperatorCount,
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
  operatorCapabilityLabel,
  operatorCommunityStateLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";

const LOCALES: InterfaceLocale[] = ["uk", "bg", "ru"];

describe("operator copy", () => {
  it("keeps exact recursive key parity across every selected locale", () => {
    const expected = recursiveKeys(getOperatorCopy("uk"));

    for (const locale of LOCALES) {
      expect(recursiveKeys(getOperatorCopy(locale))).toEqual(expected);
    }
  });

  it("localizes representative admin, moderation, and diagnostic copy", () => {
    expect(getOperatorCopy("uk").admin.controlPlane).toBe("Панель керування");
    expect(getOperatorCopy("bg").community.openReports).toBe(
      "Отворени сигнали",
    );
    expect(getOperatorCopy("ru").health.dbUnavailable).toContain("недоступна");
  });

  it("preserves machine values while localizing their display labels", () => {
    expect(operatorRoleLabel("uk", "owner")).toBe("Власник");
    expect(operatorCommunityStateLabel("bg", "open")).toBe("отворено");
    expect(operatorCommunityStateLabel("ru", "future_state")).toBe(
      "future_state",
    );
    expect(
      operatorCapabilityLabel("ru", ["operator:read", "operator:mutate"]),
    ).toBe("чтение операторских данных, операторские изменения");
  });

  it("formats templates, locale-aware dates, and plural counts", () => {
    expect(
      formatOperatorTemplate("{count} / {total}", { count: 2, total: 3 }),
    ).toBe("2 / 3");
    expect(formatOperatorDate("bg", "2026-07-16T10:00:00.000Z")).toMatch(
      /2026/,
    );
    expect(
      formatOperatorCount(
        "uk",
        5,
        getOperatorCopy("uk").adminUsers.assignmentCount,
      ),
    ).toBe("5 призначень");
  });
});

function recursiveKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...recursiveKeys(child, path)];
  });
}
