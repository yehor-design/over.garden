import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  compareContractFindingVectors,
  type ContractStatusManifest,
  createContractConsistencyCheck,
  validateContractConsistencyRules,
} from "./check-linear-agent-task";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const fixtureRoot = path.join(
  repoRoot,
  "apps",
  "web",
  "scripts",
  "fixtures",
  "contract-consistency",
);

async function fixture(name: string) {
  return readFile(path.join(fixtureRoot, name), "utf8");
}

function manifest(
  contracts: ContractStatusManifest["contracts"],
): ContractStatusManifest {
  return {
    schema: "overgarden.contract-status-manifest.v1",
    capturedAt: "2026-08-22T19:30:00.000Z",
    maxAgeHours: 24,
    contracts,
  };
}

describe("OVE-344 contract consistency instrument", () => {
  it("accepts the tracked manifest schema and exact 24-hour bound", async () => {
    const tracked = JSON.parse(
      await readFile(
        path.join(repoRoot, "docs", "linear", "CONTRACT_STATUS_MANIFEST.json"),
        "utf8",
      ),
    ) as ContractStatusManifest;

    expect(tracked.schema).toBe("overgarden.contract-status-manifest.v1");
    expect(tracked.maxAgeHours).toBe(24);
    expect(Object.keys(tracked)).toEqual([
      "schema",
      "capturedAt",
      "maxAgeHours",
      "contracts",
    ]);
    expect(new Date(tracked.capturedAt).toISOString()).toBe(tracked.capturedAt);
    expect(Object.keys(tracked.contracts)).toEqual(
      Object.keys(tracked.contracts).toSorted((left, right) =>
        left.localeCompare(right, "en"),
      ),
    );
    expect(Object.keys(tracked.contracts).length).toBeGreaterThan(0);
    for (const [identifier, entry] of Object.entries(tracked.contracts)) {
      expect(identifier).toMatch(/^OVE-\d+$/);
      expect(entry.status.length).toBeGreaterThan(0);
      expect(entry.statusType.length).toBeGreaterThan(0);
      expect(Object.keys(entry)).toEqual(["status", "statusType"]);
    }
  });

  it("keeps replay and concurrent finding vectors deterministic", async () => {
    const source = await fixture("ove-337-current.md");
    const statusManifest = manifest({
      "OVE-335": { status: "Canceled", statusType: "canceled" },
    });
    const run = () =>
      validateContractConsistencyRules(source, {
        statusManifest,
        validationInstant: "2026-08-22T20:00:00.000Z",
        enforceStatusManifest: true,
      });

    expect(run()).toEqual(run());
    const [left, right] = await Promise.all([
      Promise.resolve().then(run),
      Promise.resolve().then(run),
    ]);
    expect(left).toEqual(right);
  });

  it("preserves a baseline vector and allows only closed-four additions in the extended sweep", () => {
    const baseline = [
      { code: "core_context", message: "pre-existing finding" },
    ];
    const validExtended = [
      ...baseline,
      {
        code: "scope_context_completeness",
        message: "new closed-set finding",
      },
    ];

    expect(compareContractFindingVectors(baseline, validExtended)).toEqual({
      valid: true,
      additions: [validExtended[1]],
      violations: [],
    });
    expect(
      compareContractFindingVectors(baseline, [
        { code: "owner_count_agreement", message: "new finding" },
      ]).valid,
    ).toBe(false);
    expect(
      compareContractFindingVectors(baseline, [
        ...baseline,
        { code: "unexpected_rule", message: "outside closed set" },
      ]).valid,
    ).toBe(false);
  });

  it("times out a delayed manifest read while status and cancellation controls remain usable", async () => {
    const source = await fixture("ove-337-current.md");
    const check = createContractConsistencyCheck(source, {
      loadStatusManifest: () =>
        new Promise<ContractStatusManifest>((resolve) => {
          setTimeout(
            () =>
              resolve(
                manifest({
                  "OVE-335": { status: "Backlog", statusType: "backlog" },
                }),
              ),
            50,
          );
        }),
      validationInstant: "2026-08-22T20:00:00.000Z",
      timeoutMs: 5,
    });

    expect(check.getStatus()).toBe("running");
    const receipt = await check.result;
    expect(receipt).toMatchObject({
      status: "timed_out",
      workingTreeMutated: false,
    });
    expect(check.getStatus()).toBe("timed_out");
    expect(check.cancel()).toBe(false);
  });

  it("cancels without accepting a late manifest completion", async () => {
    const source = await fixture("ove-337-current.md");
    let release: ((value: ContractStatusManifest) => void) | undefined;
    const check = createContractConsistencyCheck(source, {
      loadStatusManifest: () =>
        new Promise<ContractStatusManifest>((resolve) => {
          release = resolve;
        }),
      validationInstant: "2026-08-22T20:00:00.000Z",
      timeoutMs: 1_000,
    });

    expect(check.cancel()).toBe(true);
    const receipt = await check.result;
    expect(receipt).toMatchObject({
      status: "cancelled",
      workingTreeMutated: false,
    });
    release?.(
      manifest({
        "OVE-335": { status: "Done", statusType: "completed" },
      }),
    );
    await Promise.resolve();
    expect(check.getStatus()).toBe("cancelled");
    expect(await check.result).toEqual(receipt);
  });

  it("turns a manifest read crash into a recoverable stale-evidence receipt", async () => {
    const source = await fixture("ove-337-current.md");
    const check = createContractConsistencyCheck(source, {
      loadStatusManifest: () => {
        throw new Error("injected crash");
      },
      validationInstant: "2026-08-22T20:00:00.000Z",
    });

    const receipt = await check.result;
    expect(receipt).toMatchObject({
      status: "completed",
      workingTreeMutated: false,
    });
    expect(receipt.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "status_manifest_stale" }),
      ]),
    );
    expect(check.getStatus()).toBe("completed");
    expect(check.cancel()).toBe(false);
  });

  it("keeps the representative rule check inside PERF-01", async () => {
    const sources = await Promise.all([
      fixture("ove-332-current.md"),
      fixture("ove-337-current.md"),
      fixture("ove-339-current.md"),
    ]);
    const startedAt = performance.now();
    for (const source of sources) {
      validateContractConsistencyRules(source);
    }
    const durationMs = performance.now() - startedAt;

    expect(durationMs).toBeLessThanOrEqual(60_000);
  });
});
