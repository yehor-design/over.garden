/**
 * OVE-234 — bounded-scan proof for the precise-location detector.
 *
 * The detector runs synchronously on every journal write, so a pathological
 * input must not be able to wedge the request. These cases feed adversarial
 * strings shaped to provoke catastrophic backtracking in the pair, DMS,
 * hemisphere, and URL patterns, and assert the scan stays inside a bounded
 * wall-clock budget at the maximum document size the composer allows.
 *
 * PERF-01 metric key: `precise_location_scan_max_ms`.
 */

import { describe, expect, it } from "vitest";

import { MAX_JOURNAL_PLAIN_TEXT_CHARS } from "@/lib/garden/journal-document";
import {
  containsPreciseLocationText,
  findPreciseLocationText,
} from "@/lib/privacy/precise-location-text";

/** PERF-01 budget for one worst-case scan of a maximum-size journal body. */
const PRECISE_LOCATION_SCAN_MAX_MS = 250;

function measureMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

const ADVERSARIAL_INPUTS: Array<[string, string]> = [
  ["repeated decimal runs", "1.".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 2)],
  [
    "comma-separated numeric soup",
    "1.1,".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 4),
  ],
  ["degree-prime runs", "1°1'".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 4)],
  [
    "hemisphere alternation",
    "N1.11 E1.11 ".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 12),
  ],
  [
    "long url token",
    `https://example.org/${"1.11/".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 5)}`,
  ],
  [
    "label followed by numeric soup",
    `latitude ${"9".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS - 10)}`,
  ],
  [
    "combining-mark padding",
    `${"а́".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 2)}`,
  ],
  ["signed number runs", "-1.1+".repeat(MAX_JOURNAL_PLAIN_TEXT_CHARS / 5)],
];

describe("precise location scan stays bounded", () => {
  it.each(ADVERSARIAL_INPUTS)(
    "terminates within the PERF-01 budget on %s",
    (_name, input) => {
      let result: unknown;
      const elapsed = measureMs(() => {
        result = findPreciseLocationText(input);
      });

      // The assertion is termination inside the budget, not the verdict.
      expect(result === null || typeof result === "object").toBe(true);
      expect(elapsed).toBeLessThan(PRECISE_LOCATION_SCAN_MAX_MS);
    },
  );

  it("stays bounded on a maximum-size document that does contain a coordinate", () => {
    const padding = "Полив і прополка. ".repeat(500);
    const input = `${padding}50.45010,30.52340 ${padding}`.slice(
      0,
      MAX_JOURNAL_PLAIN_TEXT_CHARS,
    );

    let found = false;
    const elapsed = measureMs(() => {
      found = containsPreciseLocationText(input);
    });

    expect(found).toBe(true);
    expect(elapsed).toBeLessThan(PRECISE_LOCATION_SCAN_MAX_MS);
  });

  it("keeps the whole adversarial corpus under budget in aggregate", () => {
    const elapsed = measureMs(() => {
      for (const [, input] of ADVERSARIAL_INPUTS) {
        findPreciseLocationText(input);
      }
    });

    expect(elapsed).toBeLessThan(
      PRECISE_LOCATION_SCAN_MAX_MS * ADVERSARIAL_INPUTS.length,
    );
  });
});
