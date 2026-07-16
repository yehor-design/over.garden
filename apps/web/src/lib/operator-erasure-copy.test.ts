import { describe, expect, it } from "vitest";

import {
  getOperatorErasureCopy,
  operatorErasureCountLabel,
} from "@/lib/operator-erasure-copy";

describe("operator erasure copy", () => {
  it("keeps exact recursive parity across locales", () => {
    const expected = recursiveKeys(getOperatorErasureCopy("uk"));
    expect(recursiveKeys(getOperatorErasureCopy("bg"))).toEqual(expected);
    expect(recursiveKeys(getOperatorErasureCopy("ru"))).toEqual(expected);
  });

  it("localizes dry-run classes and count labels", () => {
    expect(
      getOperatorErasureCopy("bg").dataClasses.media_assets.label,
    ).toContain("медии");
    expect(operatorErasureCountLabel("ru", "pending_index_jobs")).toContain(
      "index jobs",
    );
    expect(operatorErasureCountLabel("uk", "future_count")).toBe(
      "future_count",
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
