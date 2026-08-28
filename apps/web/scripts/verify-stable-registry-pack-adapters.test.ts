import { describe, expect, it } from "vitest";

import {
  PACK_ADAPTER_PARSE_DURATION_BUDGET_MS,
  runInjectedReadTimeout,
  runPackAdapterVerification,
} from "./verify-stable-registry-pack-adapters";

describe("OVE-327 pack adapter verifier", () => {
  it("validates all five converted source families with distinct digests", () => {
    const receipt = runPackAdapterVerification({ proveDeterminism: true });

    expect(receipt.status).toBe("pass");
    expect(receipt.terminalClass).toBe("validated");
    expect(receipt.adapterCount).toBe(5);
    // Five families must not collapse into one artifact identity.
    expect(receipt.distinctArtifactDigests).toBe(5);
    expect(receipt.adapters.map((entry) => entry.sourceFamily)).toEqual([
      "ua-state-register",
      "eu-common-catalogue",
      "eu-oj-eur-lex-common-catalogue",
      "vertebrate-breed-ontology",
      "grin-global",
    ]);
    for (const adapter of receipt.adapters) {
      expect(adapter.deterministicReplay).toBe(true);
      expect(adapter.artifactDigestPresent).toBe(true);
      expect(adapter.parserBoundClass).toBe("within_bound");
    }
  });

  it("stays inside the declared parse budget", () => {
    const receipt = runPackAdapterVerification({ proveDeterminism: false });
    expect(receipt.maxParseDurationMs).toBeLessThanOrEqual(
      PACK_ADAPTER_PARSE_DURATION_BUDGET_MS,
    );
    expect(receipt.parseDurationBudgetMs).toBe(60_000);
  });

  it("reports only bucketed aggregate evidence, never a source row", () => {
    const serialized = JSON.stringify(
      runPackAdapterVerification({ proveDeterminism: false }),
    );

    expect(serialized).not.toMatch(/Ботсадівський|Садово|Cincinnati/u);
    expect(serialized).not.toMatch(/rawPayload|latitude|longitude/iu);
    for (const adapter of runPackAdapterVerification({
      proveDeterminism: false,
    }).adapters) {
      expect(adapter.rowCountBucket).toMatch(
        /^(none|under_10|under_100|under_1000|under_100000|at_or_over_100000)$/u,
      );
    }
  });

  it("ends an unreadable source read with one bounded timed out receipt", async () => {
    const receipt = await runInjectedReadTimeout();

    expect(receipt.terminalClass).toBe("timed out");
    expect(receipt.adapters).toEqual([]);
    expect(receipt.maxParseDurationMs).toBeLessThanOrEqual(
      PACK_ADAPTER_PARSE_DURATION_BUDGET_MS,
    );
    expect(receipt.controls).toEqual({
      terminalSigintCancellationEnabled: true,
      adapterStatusCommandEnabled: true,
    });
  });
});
