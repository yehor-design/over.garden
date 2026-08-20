import { createHash } from "node:crypto";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MVP_POSTURE_CANON_DEADLINE_MS,
  MVP_POSTURE_CANON_VERSION,
  evaluateMvpPostureCanon,
  formatMvpPostureCanonReceipt,
  parseMvpPostureCanonArguments,
  runMvpPostureCanonCheck,
  type MvpPostureClassificationManifest,
} from "./check-mvp-posture-canon";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

function digest(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function fixtureManifest(): MvpPostureClassificationManifest {
  const historical =
    "Implementation status (2026-07-01): private quarantine was required.";
  return {
    version: MVP_POSTURE_CANON_VERSION,
    evidenceBaselineSha: "7".repeat(40),
    evidenceV1: {
      command:
        "git grep -nEi 'fail.?closed|closed refusal|quarantine|original deletion|actual.?byte|noindex|robots|admin panel|another-user|negative proof' -- .",
      matchingTrackedFiles: 5,
    },
    activeAuthorityPaths: ["AGENTS.md"],
    historicalPaths: ["docs/adr/ADR-0014.md"],
    historicalPrefixes: ["docs/receipts/"],
    historicalDigests: {
      "docs/adr/ADR-0014.md": digest(historical),
    },
    productResearchPrefix: "docs/product-research/",
    runtimeRules: [
      {
        pathPrefix: "apps/web/src/server/media/",
        owner: "OVE-333",
        reason: "OVE-333 owns the media runtime transition.",
      },
    ],
    activeUnrelatedRules: [
      {
        path: "docs/ROBOTS_STANDARD.md",
        reason: "Robots is an unrelated protocol name in this fixture.",
      },
    ],
    ownerStates: {
      "OVE-330": "Backlog",
      "OVE-331": "Backlog",
      "OVE-332": "Backlog",
      "OVE-333": "Backlog",
      "OVE-334": "Backlog",
      "OVE-335": "Backlog",
      "OVE-336": "Backlog",
      "OVE-337": "Backlog",
      "OVE-338": "Backlog",
      "OVE-339": "Backlog",
    },
  };
}

function alignedFixture(): Record<string, string> {
  return {
    "AGENTS.md": [
      "# Current MVP posture",
      "",
      "ADR-0018 is the sole authority; quarantine-first and blanket noindex instructions are superseded.",
    ].join("\n"),
    "docs/adr/ADR-0014.md":
      "Implementation status (2026-07-01): private quarantine was required.",
    "docs/product-research/TRUST.md":
      "Research record: another-user access destroys trust.",
    "apps/web/src/server/media/legacy.ts":
      "export const quarantineBucket = 'runtime pending child';",
    "docs/ROBOTS_STANDARD.md": "Robots Exclusion Protocol notes.",
  };
}

describe("check-mvp-posture-canon", () => {
  it("classifies all six states and emits a deterministic redacted receipt", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    files["docs/unclassified.md"] = "Keep the admin panel separate.";

    const first = evaluateMvpPostureCanon(files, { manifest });
    const second = evaluateMvpPostureCanon(files, { manifest });

    expect(first).toMatchObject({
      version: MVP_POSTURE_CANON_VERSION,
      status: "posture_drift",
      counts: {
        active_forbidden: 1,
        active_required_guardrail: 1,
        historical_provenance: 1,
        product_research: 1,
        active_unrelated: 1,
        runtime_pending_child: 1,
      },
    });
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unclassified_active_match",
          path: "docs/unclassified.md",
        }),
      ]),
    );
    expect(JSON.stringify(first)).not.toContain("runtime pending child");
    expect(JSON.stringify(first)).not.toContain("destroys trust");
  });

  it("rejects an active retired-posture instruction", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    files["AGENTS.md"] =
      "Always require a closed refusal, private quarantine, and blanket noindex.";

    const receipt = evaluateMvpPostureCanon(files, { manifest });

    expect(receipt.status).toBe("posture_drift");
    expect(receipt.counts.active_forbidden).toBe(1);
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "active_posture_contradiction" }),
      ]),
    );
  });

  it("fails when immutable historical evidence is rewritten", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    files["docs/adr/ADR-0014.md"] += " Mutated after completion.";

    const receipt = evaluateMvpPostureCanon(files, { manifest });

    expect(receipt.status).toBe("posture_drift");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "historical_receipt_rewritten",
          path: "docs/adr/ADR-0014.md",
        }),
      ]),
    );
  });

  it("rejects duplicate rules, two current owners, and a terminal runtime owner", () => {
    const manifest = fixtureManifest();
    manifest.runtimeRules.push({ ...manifest.runtimeRules[0] });
    manifest.ownerStates["OVE-333"] = "Done";
    manifest.activeAuthorityPaths.push("docs/SECOND_AUTHORITY.md");
    const files = alignedFixture();
    files["docs/SECOND_AUTHORITY.md"] =
      "ADR-0018 is the sole current posture authority; noindex-first is superseded.";

    const receipt = evaluateMvpPostureCanon(files, { manifest });

    expect(receipt.status).toBe("posture_drift");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_manifest_rule" }),
        expect.objectContaining({ code: "multiple_active_posture_owners" }),
        expect.objectContaining({
          code: "terminal_runtime_owner",
          owner: "OVE-333",
        }),
      ]),
    );
  });

  it("rejects a changing tree, timeout, and cancellation without late evidence", () => {
    const manifest = fixtureManifest();
    const files = alignedFixture();
    const changing = evaluateMvpPostureCanon(files, {
      manifest,
      stableTree: false,
    });
    const timedOut = evaluateMvpPostureCanon(files, {
      manifest,
      deadlineMs: 1,
      now: (() => {
        let call = 0;
        return () => (call++ === 0 ? 0 : 2);
      })(),
    });
    const controller = new AbortController();
    controller.abort();
    const cancelled = evaluateMvpPostureCanon(files, {
      manifest,
      signal: controller.signal,
    });

    expect(changing.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "changing_proof_baseline" }),
      ]),
    );
    expect(timedOut).toMatchObject({
      status: "timed_out",
      violations: [{ code: "tracked_file_read_timeout" }],
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      violations: [{ code: "scan_cancelled" }],
    });
  });

  it("parses the CLI proof contract and rejects unknown arguments", () => {
    expect(
      parseMvpPostureCanonArguments([
        "--",
        "--baseline",
        "a".repeat(40),
        "--prove-determinism",
        "--inject-read-timeout",
      ]),
    ).toEqual({
      baselineSha: "a".repeat(40),
      proveDeterminism: true,
      injectReadTimeout: true,
    });
    expect(() => parseMvpPostureCanonArguments(["--unknown"])).toThrow(
      "unknown_argument",
    );
  });

  it("checks the checked-in repository within the thirty-second contract", () => {
    const receipt = runMvpPostureCanonCheck({
      repositoryRoot: REPOSITORY_ROOT,
      allowDirty: true,
    });
    const formatted = JSON.parse(formatMvpPostureCanonReceipt(receipt));

    expect(receipt.status).toBe("aligned");
    expect(receipt.durationMs).toBeLessThanOrEqual(
      MVP_POSTURE_CANON_DEADLINE_MS,
    );
    expect(receipt.baselineSha).toMatch(/^[a-f0-9]{40}$/);
    expect(formatted).toMatchObject({
      version: MVP_POSTURE_CANON_VERSION,
      status: "aligned",
      digest: receipt.digest,
      counts: receipt.counts,
    });
    expect(formatted).not.toHaveProperty("entries");
  });
});
