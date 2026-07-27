import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRECISE_LOCATION_POLICY_VERSION,
  PreciseLocationTextError,
  assertNoPreciseLocationText,
  assertNoPreciseLocationTextInValues,
  containsPreciseLocationText,
  findPreciseLocationText,
  isPreciseLocationTextError,
  normalizePreciseLocationScanText,
  type PreciseLocationTextKind,
} from "@/lib/privacy/precise-location-text";

interface CorpusSample {
  id: string;
  text: string;
  kind?: PreciseLocationTextKind;
}

const CORPUS_PATH = path.join(
  process.cwd(),
  "../../contracts/privacy/precise-location-text-corpus.json",
);

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as {
  policyVersion: string;
  rejected: CorpusSample[];
  accepted: CorpusSample[];
};

describe("precise location text corpus", () => {
  it("pins the shared contract to the current policy version", () => {
    expect(corpus.policyVersion).toBe(PRECISE_LOCATION_POLICY_VERSION);
    expect(corpus.rejected.length).toBeGreaterThanOrEqual(20);
    expect(corpus.accepted.length).toBeGreaterThanOrEqual(20);
  });

  it.each(corpus.rejected.map((sample) => [sample.id, sample] as const))(
    "rejects %s",
    (_id, sample) => {
      const found = findPreciseLocationText(sample.text);
      expect(found).not.toBeNull();
      expect(found?.kind).toBe(sample.kind);
      expect(found?.policyVersion).toBe(PRECISE_LOCATION_POLICY_VERSION);
    },
  );

  it.each(corpus.accepted.map((sample) => [sample.id, sample] as const))(
    "accepts %s",
    (_id, sample) => {
      expect(findPreciseLocationText(sample.text)).toBeNull();
    },
  );
});

describe("normalizePreciseLocationScanText", () => {
  it("folds unicode variants onto the ascii forms", () => {
    expect(normalizePreciseLocationScanText("５０．４５")).toBe("50.45");
    expect(normalizePreciseLocationScanText("50º27′0.4″")).toBe("50°27'0.4\"");
    expect(normalizePreciseLocationScanText("−33.8")).toBe("-33.8");
    expect(normalizePreciseLocationScanText("50.45​,​30.52")).toBe(
      "50.45,30.52",
    );
  });

  it("ignores non-string and empty input", () => {
    expect(normalizePreciseLocationScanText(null)).toBe("");
    expect(normalizePreciseLocationScanText(42)).toBe("");
    expect(findPreciseLocationText(undefined)).toBeNull();
  });

  it("stays bounded on very large input", () => {
    const padding = "а".repeat(500_000);
    expect(containsPreciseLocationText(`${padding} 50.45010,30.52340`)).toBe(
      false,
    );
    expect(containsPreciseLocationText(`50.45010,30.52340 ${padding}`)).toBe(
      true,
    );
  });
});

describe("assertNoPreciseLocationText", () => {
  it("throws a typed error that never echoes the value", () => {
    let caught: unknown;
    try {
      assertNoPreciseLocationText("50.45010,30.52340", "comment");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PreciseLocationTextError);
    expect(isPreciseLocationTextError(caught)).toBe(true);
    const error = caught as PreciseLocationTextError;
    expect(error.code).toBe("precise_location_text");
    expect(error.surface).toBe("comment");
    expect(error.kind).toBe("decimal_pair");
    expect(error.message).not.toContain("50.45010");
    expect(error.message).not.toContain("30.52340");
    expect(error.stack ?? "").not.toContain("50.45010");
  });

  it("passes safe values through", () => {
    expect(() =>
      assertNoPreciseLocationText("Полив о 7:45, 25.5 °C", "journal_body"),
    ).not.toThrow();
  });

  it("scans every value in a collection", () => {
    expect(() =>
      assertNoPreciseLocationTextInValues(
        ["safe", "also safe", "geo:50.45010,30.52340"],
        "journal_document",
      ),
    ).toThrow(PreciseLocationTextError);
  });
});
