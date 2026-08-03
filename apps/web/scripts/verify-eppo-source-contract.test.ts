import { describe, expect, it } from "vitest";

import {
  parseEppoSourceContractCliArguments,
  runEppoSourceContractCli,
} from "./verify-eppo-source-contract";
import type { EppoSourceContractReceipt } from "../src/server/catalog-source/eppo-source-contract";

const BASELINE = "534e8d18ef402095ae1e77880e03749536066f6f";

function receipt(): EppoSourceContractReceipt {
  return {
    class: "contract_decision",
    baselineSha: BASELINE,
    decisionId: "a".repeat(64),
    terminalState: "blocked_manifest",
    sourceClasses: {
      taxon_list: "supported",
      taxon_overview: "supported",
      taxon_names: "supported",
      taxon_taxonomy: "supported",
    },
    releaseIdentity: "missing_official_versioned_checksum_manifest",
    closureMethod: "not_authorized_without_official_release_manifest",
    rightsEvidence:
      "official_open_licence_document_fetched_attribution_required",
    missingAuthority:
      "official versioned checksum manifest and full-corpus closure method",
    attempts: 6,
    concurrency: 1,
    durationMs: 1,
    cleanup: "completed",
  };
}

describe("EPPO source contract CLI", () => {
  it("admits only the bounded serial source-contract argument grammar", () => {
    expect(
      parseEppoSourceContractCliArguments([
        "--mode",
        "live-contract",
        "--timeout-ms",
        "21600000",
        "--max-attempts",
        "2",
        "--concurrency",
        "1",
      ]),
    ).toEqual({
      mode: "live-contract",
      timeoutMs: 21_600_000,
      maxAttempts: 2,
      concurrency: 1,
    });
    expect(() =>
      parseEppoSourceContractCliArguments([
        "--mode",
        "live-contract",
        "--host",
        "https://example.invalid",
      ]),
    ).toThrow("invalid_arguments");
    expect(() =>
      parseEppoSourceContractCliArguments([
        "--mode",
        "live-contract",
        "--concurrency",
        "2",
      ]),
    ).toThrow("invalid_arguments");
  });

  it("keeps fixture mode credential-free and explicitly non-authoritative", async () => {
    const result = await runEppoSourceContractCli(
      parseEppoSourceContractCliArguments(["--mode", "fixture"]),
      { baselineSha: () => BASELINE },
    );

    expect(result).toMatchObject({
      terminalState: "blocked_manifest",
      attempts: 0,
      missingAuthority: "fixture does not contact an official authority",
    });
  });

  it("prevents a second live decision from calling the provider while the first lock is held", async () => {
    let release: (() => void) | undefined;
    const first = runEppoSourceContractCli(
      parseEppoSourceContractCliArguments(["--mode", "live-contract"]),
      {
        baselineSha: () => BASELINE,
        credential: () => "eppo_fixture_cli_4cbe1603",
        inspect: async () =>
          new Promise<EppoSourceContractReceipt>((resolve) => {
            release = () => resolve(receipt());
          }),
      },
    );

    try {
      for (let attempt = 0; attempt < 20 && !release; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!release) throw new Error("first decision did not acquire its lock");
      const blocked = runEppoSourceContractCli(
        parseEppoSourceContractCliArguments(["--mode", "live-contract"]),
        {
          baselineSha: () => BASELINE,
          credential: () => "eppo_fixture_cli_4cbe1603",
          inspect: async () => {
            throw new Error("provider must not be called");
          },
        },
      );

      await expect(blocked).rejects.toMatchObject({
        code: "decision_already_running",
      });
    } finally {
      release?.();
      await first.catch(() => undefined);
    }
  });
});
