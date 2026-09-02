import { describe, expect, it } from "vitest";

import { measureCatalogTypeaheadDivergence } from "@/server/catalog-repository";
import type { CatalogSuggestion } from "@/server/catalog-repository";

import {
  assertNoForbiddenTrigramMarkers,
  assertSafeCatalogTrigramReceipt,
  CATALOG_TRIGRAM_MODES,
  CATALOG_TYPEAHEAD_QUERY_BUDGET_MS,
  continueWithUnknown,
  parseCatalogTrigramProofArgs,
  retrySearch,
  runTrigramTimeoutFixture,
  type CatalogTrigramProofReceipt,
} from "./prove-catalog-trigram-typeahead";

const SAFE_RECEIPT: CatalogTrigramProofReceipt = {
  schemaVersion: "ove355.catalogTrigramTypeahead.v1",
  mode: "verify",
  runClass: "database",
  status: "pass",
  terminalClass: "verified",
  sourceClass: "three_source",
  canonicalCount: 0,
  derivedCount: 2,
  trigramCount: 2,
  mergedCount: 2,
  duplicateIdentityCount: 0,
  canonicalOnlyCount: 0,
  derivedOnlyCount: 2,
  trigramOnlyCount: 0,
  trigramRecoveredDerivedOnlyCount: 2,
  unrecoveredDerivedOnlyCount: 0,
  maxQueryLatencyMs: 3,
  queryBudgetMs: CATALOG_TYPEAHEAD_QUERY_BUDGET_MS,
  degradedReasonClass: null,
  forbiddenMarkersAbsent: true,
  controls: { retrySearchEnabled: true, continueWithUnknownEnabled: true },
};

function suggestion(id: string): CatalogSuggestion {
  return { id } as CatalogSuggestion;
}

describe("catalog trigram proof arguments", () => {
  it("refuses a mode outside the closed set", () => {
    expect(() =>
      parseCatalogTrigramProofArgs(["--mode", "apply"]),
    ).toThrowError(/--mode must be one of/u);
    expect(() => parseCatalogTrigramProofArgs([])).toThrowError(
      /--mode must be one of/u,
    );
  });

  it("accepts every declared mode", () => {
    for (const mode of CATALOG_TRIGRAM_MODES) {
      expect(parseCatalogTrigramProofArgs(["--mode", mode]).mode).toBe(mode);
    }
  });
});

describe("trigram index scan timeout", () => {
  it("degrades without starving the sources that already answered", async () => {
    const receipt = await runTrigramTimeoutFixture({ mode: "verify" });

    expect(receipt.terminalClass).toBe("degraded");
    expect(receipt.trigramCount).toBe(0);
    expect(receipt.canonicalCount).toBeGreaterThan(0);
    expect(receipt.derivedCount).toBeGreaterThan(0);
    expect(receipt.degradedReasonClass).toBe("trigram_index_scan_timeout");
    expect(receipt.maxQueryLatencyMs).toBeLessThanOrEqual(
      CATALOG_TYPEAHEAD_QUERY_BUDGET_MS,
    );
  });

  it("keeps both wait-safe controls usable during the wait", () => {
    expect(retrySearch()).toBe(true);
    expect(continueWithUnknown()).toBe(true);
  });
});

describe("receipt safety", () => {
  it("rejects a receipt carrying query text", () => {
    expect(() =>
      assertNoForbiddenTrigramMarkers({ ...SAFE_RECEIPT, query: "помдор" }),
    ).toThrowError(/forbidden_marker/u);
    expect(() =>
      assertNoForbiddenTrigramMarkers({
        ...SAFE_RECEIPT,
        searchTerm: "помдор",
      }),
    ).toThrowError(/forbidden_marker/u);
  });

  it("rejects a receipt carrying an identifier, a name, or a coordinate", () => {
    const leaks = [
      { catalogItemId: "3f1c2a44-0000-4000-8000-0000000355aa" },
      { id: "3f1c2a44-0000-4000-8000-0000000355aa" },
      { displayName: "Solanum lycopersicum" },
      { canonicalName: "Solanum lycopersicum" },
      { ownerUserId: "owner" },
      { sessionId: "session" },
      { note: "48.379433, 31.165580" },
    ];
    for (const leak of leaks) {
      expect(() =>
        assertNoForbiddenTrigramMarkers({ ...SAFE_RECEIPT, ...leak }),
      ).toThrowError(/forbidden_marker/u);
    }
  });

  it("accepts a receipt of counts and classes", () => {
    expect(() => assertNoForbiddenTrigramMarkers(SAFE_RECEIPT)).not.toThrow();
    expect(assertSafeCatalogTrigramReceipt(SAFE_RECEIPT)).toBe(SAFE_RECEIPT);
  });

  it("refuses a merged result containing a duplicate identity", () => {
    expect(() =>
      assertSafeCatalogTrigramReceipt({
        ...SAFE_RECEIPT,
        duplicateIdentityCount: 1,
      }),
    ).toThrowError(/duplicate_identity/u);
  });

  it("refuses a receipt whose divergence accounting does not add up", () => {
    expect(() =>
      assertSafeCatalogTrigramReceipt({
        ...SAFE_RECEIPT,
        unrecoveredDerivedOnlyCount: 1,
      }),
    ).toThrowError(/divergence_accounting_mismatch/u);
  });

  it("refuses a receipt over the query budget", () => {
    expect(() =>
      assertSafeCatalogTrigramReceipt({
        ...SAFE_RECEIPT,
        maxQueryLatencyMs: CATALOG_TYPEAHEAD_QUERY_BUDGET_MS + 1,
      }),
    ).toThrowError(/query_budget_exceeded/u);
  });
});

describe("divergence measurement", () => {
  it("counts what only the derived index found and what trigram recovered", () => {
    const sample = measureCatalogTypeaheadDivergence({
      canonical: [suggestion("a")],
      derived: [suggestion("a"), suggestion("b"), suggestion("c")],
      approximate: [suggestion("b"), suggestion("d")],
      merged: [
        suggestion("a"),
        suggestion("b"),
        suggestion("c"),
        suggestion("d"),
      ],
    });

    expect(sample.sourceClass).toBe("three_source");
    expect(sample.derivedOnlyCount).toBe(2);
    // `b` was derived-only and trigram found it; `c` remains derived-only.
    expect(sample.trigramRecoveredDerivedOnlyCount).toBe(1);
    expect(sample.unrecoveredDerivedOnlyCount).toBe(1);
    expect(sample.trigramOnlyCount).toBe(1);
    expect(sample.canonicalOnlyCount).toBe(0);
  });

  it("reports two sources when the trigram source is disabled", () => {
    const sample = measureCatalogTypeaheadDivergence({
      canonical: [suggestion("a")],
      derived: [suggestion("a")],
      approximate: [],
      merged: [suggestion("a")],
    });

    expect(sample.sourceClass).toBe("two_source");
    expect(sample.trigramCount).toBe(0);
    expect(sample.unrecoveredDerivedOnlyCount).toBe(0);
  });
});
