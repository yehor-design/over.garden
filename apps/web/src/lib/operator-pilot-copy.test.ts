import { describe, expect, it } from "vitest";

import { getOperatorPilotCopy } from "@/lib/operator-pilot-copy";

describe("operator pilot copy", () => {
  it("keeps exact recursive parity across uk, bg, and ru", () => {
    const expected = recursiveKeys(getOperatorPilotCopy("uk"));
    expect(recursiveKeys(getOperatorPilotCopy("bg"))).toEqual(expected);
    expect(recursiveKeys(getOperatorPilotCopy("ru"))).toEqual(expected);
  });

  it("contains only automatic health copy and its metric labels", () => {
    expect(Object.keys(getOperatorPilotCopy("uk"))).toEqual([
      "metrics",
      "health",
    ]);
    expect(Object.keys(getOperatorPilotCopy("bg"))).toEqual([
      "metrics",
      "health",
    ]);
    expect(Object.keys(getOperatorPilotCopy("ru"))).toEqual([
      "metrics",
      "health",
    ]);
  });

  it("states the deferred H6 acquisition status in every supported locale", () => {
    expect(getOperatorPilotCopy("uk").health.mvpLearningH6).toContain(
      "ще не вимірюється",
    );
    expect(getOperatorPilotCopy("bg").health.mvpLearningH6).toContain(
      "не се измерва",
    );
    expect(getOperatorPilotCopy("ru").health.mvpLearningH6).toContain(
      "не измеряется",
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
