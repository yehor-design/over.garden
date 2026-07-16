import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCurationCopy,
  operatorCurationMapLabel,
} from "@/lib/operator-curation-copy";

const LOCALES: InterfaceLocale[] = ["uk", "bg", "ru"];

describe("operator curation copy", () => {
  it("keeps exact recursive key parity across supported locales", () => {
    const expected = recursiveKeys(getOperatorCurationCopy("uk"));

    for (const locale of LOCALES) {
      expect(recursiveKeys(getOperatorCurationCopy(locale))).toEqual(expected);
    }
  });

  it("localizes representative curation decisions and QA labels", () => {
    expect(getOperatorCurationCopy("uk").alias.approve).toBe("Схвалити назву");
    expect(getOperatorCurationCopy("bg").sourceReview.promote).toBe(
      "Публикуване",
    );
    expect(
      getOperatorCurationCopy("ru").entity.groups.alias_collision.label,
    ).toBe("Конфликт названий");
  });

  it("preserves unknown machine values while mapping known states", () => {
    const copy = getOperatorCurationCopy("uk");
    expect(
      operatorCurationMapLabel(
        copy.common.statuses,
        "quarantined",
        copy.common.unknown,
      ),
    ).toBe("У карантині");
    expect(
      operatorCurationMapLabel(
        copy.common.statuses,
        "future_machine_state",
        copy.common.unknown,
      ),
    ).toBe("future_machine_state");
  });
});

function recursiveKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...recursiveKeys(child, path)];
  });
}
