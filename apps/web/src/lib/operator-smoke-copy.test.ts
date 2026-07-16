import { describe, expect, it } from "vitest";

import {
  getOperatorSmokeCopy,
  operatorSmokeCheckLabel,
} from "@/lib/operator-smoke-copy";

describe("operator smoke copy", () => {
  it("keeps exact recursive parity across selected locales", () => {
    const expected = recursiveKeys(getOperatorSmokeCopy("uk"));
    expect(recursiveKeys(getOperatorSmokeCopy("bg"))).toEqual(expected);
    expect(recursiveKeys(getOperatorSmokeCopy("ru"))).toEqual(expected);
  });

  it("localizes known checks and preserves unknown diagnostic ids", () => {
    expect(operatorSmokeCheckLabel("bg", "archive-410")).toBe(
      "Архивиране към 410",
    );
    expect(operatorSmokeCheckLabel("ru", "env-PUBLIC_SITE_URL")).toContain(
      "env-PUBLIC_SITE_URL",
    );
    expect(getOperatorSmokeCopy("uk").smokeSteps).toHaveLength(19);
  });
});

function recursiveKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...recursiveKeys(child, path)];
  });
}
