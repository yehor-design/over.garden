import { describe, expect, it } from "vitest";

import {
  getOperatorPilotCopy,
  operatorDecisionSignalLabel,
  operatorPilotLabel,
  operatorPilotOptions,
} from "@/lib/operator-pilot-copy";

describe("operator pilot copy", () => {
  it("keeps exact recursive parity across uk, bg, and ru", () => {
    const expected = recursiveKeys(getOperatorPilotCopy("uk"));
    expect(recursiveKeys(getOperatorPilotCopy("bg"))).toEqual(expected);
    expect(recursiveKeys(getOperatorPilotCopy("ru"))).toEqual(expected);
  });

  it("localizes display labels without changing enum values", () => {
    expect(operatorPilotLabel("bg", "segments", "power_collector")).toContain(
      "колекционер",
    );
    expect(
      operatorPilotOptions("ru", "nextActions", ["continue_pilot"]),
    ).toEqual([
      { value: "continue_pilot", label: "Продолжить пилот с этим садоводом" },
    ]);
    expect(operatorDecisionSignalLabel("uk", "distributed")).toBe(
      "розподілений",
    );
    expect(operatorPilotLabel("uk", "segments", "future_segment")).toBe(
      "future_segment",
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
