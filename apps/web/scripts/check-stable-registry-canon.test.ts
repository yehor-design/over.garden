import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_STABLE_REGISTRY_CONSUMERS,
  STABLE_REGISTRY_OBSERVED_CORPUS_SCALE,
  evaluateStableRegistryCanon,
  formatStableRegistryCanonReceipt,
  parseStableRegistryCanonArguments,
  runStableRegistryCanonCheck,
} from "./check-stable-registry-canon";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

function alignedFixture(): Record<string, string> {
  return {
    "AGENTS.md": [
      "Stable Registry current authority: ADR-0016 and docs/STABLE_REGISTRY.md.",
      "Observed captures are OverGarden observations, never official EPPO releases.",
      "Captured, rights-cleared source-public, identity-resolved, release-approved, and product-eligible are separate states.",
    ].join("\n"),
    "docs/adr/ADR-0016-stable-registry-observed-capture.md": [
      "ADR-0016 is the current Stable Registry authority.",
      "Status: Accepted",
      "Supersedes only the OVE-253 official-manifest wait for future full-corpus work.",
      "Every EPPO ingestion is an OverGarden observed capture, never an official EPPO release.",
      "Published releases and OverGarden UUIDs are immutable and append-only.",
      "captured -> rights_cleared_source_public -> identity_resolved -> release_approved -> product_eligible",
    ].join("\n"),
    "docs/STABLE_REGISTRY.md": [
      "Current Stable Registry authority: ADR-0016.",
      "STABLE_REGISTRY_OBSERVED_CORPUS_SCALE = 129188",
      "captured -> rights_cleared_source_public -> identity_resolved -> release_approved -> product_eligible",
      "Exact occurrence coordinates, raw payloads, restricted fields, and secrets never enter product UI, public search, logs, evidence, or analytics.",
      "Corrections create a successor, alias, equivalence, split, or later edition; an active release and OverGarden UUID never mutate in place.",
    ].join("\n"),
    "docs/MIGRATION_ALLOCATION.md": [
      "Current Stable Registry authority: ADR-0016.",
      "0023 | OVE-254",
      "0024 | OVE-255",
      "0025 | OVE-256",
      "0026 | OVE-257",
      "0027 | OVE-258",
      "0028 | OVE-259",
      "0023-0028: Stable Registry children",
      "0029-0030: online-only retirement children",
      "0031-0034: MVP posture children",
    ].join("\n"),
    "docs/product-research/CATALOG_SOURCE_READINESS.md": [
      "Current Stable Registry authority: ADR-0016 and docs/STABLE_REGISTRY.md authorize truthful observed capture under rights gates.",
      "captured -> rights_cleared_source_public -> identity_resolved -> release_approved -> product_eligible",
      "Historical OVE-253 receipt: blocked_manifest recorded that no official versioned checksum manifest was available.",
    ].join("\n"),
    "docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json": JSON.stringify({
      fullImportReadiness: {
        stableRegistryCanon: {
          issue: "OVE-318",
          contractVersion: 1,
          authority: "ADR-0016",
          specification: "docs/STABLE_REGISTRY.md",
          observedCorpusScale: 129188,
          sourceCompleteness: "observed_capture",
          productCompleteness: "explicit_release_membership",
          captureAuthorizedBy: "OVE-254",
          releaseConstructionOwnedBy: "OVE-255",
          historicalReceipt: "OVE-253:blocked_manifest",
        },
        eppoFullCorpusContract: {
          issue: "OVE-253",
          evidenceClass: "historical_decision_receipt",
          terminalState: "blocked_manifest",
        },
      },
    }),
    "docs/product-research/SPECIES_BACKBONE_POLICY.md": [
      "Current Stable Registry authority: ADR-0016 and docs/STABLE_REGISTRY.md.",
      "CoL remains canonical scientific-name authority; WFO and GBIF corroborate; EPPO supplies code and name evidence.",
      "Historical OVE-253 receipt: the provider exposed no official versioned checksum manifest.",
    ].join("\n"),
    "docs/SDD_VERTICAL_SLICE_ROADMAP.md":
      "Current Stable Registry work follows ADR-0016 observed-capture releases and never treats source capture as product completeness.",
    "docs/SCAFFOLD_STATUS.md":
      "Current Stable Registry authority is ADR-0016; OVE-253 blocked_manifest remains historical evidence only.",
    "apps/web/src/server/catalog-source/eppo-source-contract.ts":
      "Historical OVE-253 decision receipt; not an acquisition or current release gate. ADR-0016 owns future captures.",
  };
}

describe("check-stable-registry-canon", () => {
  it("accepts one truthful observed-capture authority and reports a deterministic redacted digest", () => {
    const files = alignedFixture();
    const baselineSha = "a".repeat(40);
    const first = evaluateStableRegistryCanon(files, { baselineSha });
    const second = evaluateStableRegistryCanon(files, { baselineSha });

    expect(first.digest).toBe(second.digest);
    expect(first.violations).toEqual(second.violations);
    expect(first).toMatchObject({
      status: "aligned",
      baselineSha,
      observedCorpusScale: STABLE_REGISTRY_OBSERVED_CORPUS_SCALE,
      checkedConsumers: REQUIRED_STABLE_REGISTRY_CONSUMERS.length,
      violations: [],
    });
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(
      /coordinate|credential|raw payload|source content/i,
    );
  });

  it("rejects stale consumer gating and a duplicate supersession owner", () => {
    const files = alignedFixture();
    files["docs/SDD_VERTICAL_SLICE_ROADMAP.md"] +=
      "\nFuture capture requires an official versioned checksum manifest.";
    files["docs/SCAFFOLD_STATUS.md"] +=
      "\nCurrent authority: ADR-0099 owns Stable Registry releases.";

    const receipt = evaluateStableRegistryCanon(files);

    expect(receipt.status).toBe("canon_drift");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "stale_official_manifest_gate" }),
        expect.objectContaining({ code: "duplicate_decision_owner" }),
      ]),
    );
  });

  it("rejects raw-to-product projection, mutable identity, and weakened location redaction", () => {
    const files = alignedFixture();
    files["docs/STABLE_REGISTRY.md"] = [
      files["docs/STABLE_REGISTRY.md"],
      "Raw source records go directly to the picker.",
      "An active release may rewrite an existing OverGarden UUID in place.",
      "Exact occurrence coordinates may be included in public search evidence.",
    ].join("\n");

    const receipt = evaluateStableRegistryCanon(files);

    expect(receipt.status).toBe("canon_drift");
    expect(receipt.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining([
        "raw_to_product_projection",
        "mutable_product_identity",
        "unsafe_location_projection",
      ]),
    );
  });

  it("rejects a missing authority marker or closed admission state", () => {
    const files = alignedFixture();
    files["docs/MIGRATION_ALLOCATION.md"] = files[
      "docs/MIGRATION_ALLOCATION.md"
    ].replace("ADR-0016", "an unspecified decision");
    files["docs/STABLE_REGISTRY.md"] = files["docs/STABLE_REGISTRY.md"].replace(
      "rights_cleared_source_public",
      "",
    );

    const receipt = evaluateStableRegistryCanon(files);

    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_authority_marker" }),
        expect.objectContaining({ code: "missing_admission_state" }),
      ]),
    );
  });

  it("rejects manifest semantics or migration reservations that drift", () => {
    const files = alignedFixture();
    const manifest = JSON.parse(
      files["docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json"],
    );
    manifest.fullImportReadiness.stableRegistryCanon.observedCorpusScale = 42;
    manifest.fullImportReadiness.eppoFullCorpusContract.evidenceClass =
      "current_gate";
    files["docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json"] =
      JSON.stringify(manifest);
    files["docs/MIGRATION_ALLOCATION.md"] = files[
      "docs/MIGRATION_ALLOCATION.md"
    ].replace("0023 | OVE-254", "0023 | OVE-999");

    const receipt = evaluateStableRegistryCanon(files);

    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "stable_registry_manifest_drift" }),
        expect.objectContaining({ code: "historical_receipt_class_drift" }),
        expect.objectContaining({ code: "migration_allocation_drift" }),
      ]),
    );
  });

  it("fails on a missing or unknown consumer and returns a bounded timed-out receipt", () => {
    const files = alignedFixture();
    delete files["docs/SCAFFOLD_STATUS.md"];
    files["docs/UNDECLARED_STABLE_REGISTRY_AUTHORITY.md"] =
      "Current Stable Registry authority: ADR-0099.";

    const drift = evaluateStableRegistryCanon(files);
    const timedOut = evaluateStableRegistryCanon(alignedFixture(), {
      deadlineMs: 1,
      now: (() => {
        let call = 0;
        return () => (call++ === 0 ? 0 : 2);
      })(),
    });

    expect(drift.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_consumer" }),
        expect.objectContaining({ code: "unknown_authority_consumer" }),
      ]),
    );
    expect(timedOut).toMatchObject({
      status: "timed_out",
      violations: [{ code: "consumer_read_timeout" }],
    });
  });

  it("rejects late evidence after cancellation", () => {
    const controller = new AbortController();
    controller.abort();

    const receipt = evaluateStableRegistryCanon(alignedFixture(), {
      signal: controller.signal,
    });

    expect(receipt).toMatchObject({
      status: "cancelled",
      checkedConsumers: 0,
      violations: [{ code: "scan_cancelled" }],
    });
  });

  it("accepts the pnpm argument separator before timeout injection", () => {
    expect(
      parseStableRegistryCanonArguments(["--", "--inject-consumer-timeout"]),
    ).toEqual({ injectConsumerTimeout: true });
  });

  it("checks the checked-in canon through the real repository reader", () => {
    const receipt = runStableRegistryCanonCheck({
      repositoryRoot: REPOSITORY_ROOT,
    });
    const formatted = JSON.parse(formatStableRegistryCanonReceipt(receipt));

    expect(receipt.status).toBe("aligned");
    expect(receipt.checkedConsumers).toBe(
      REQUIRED_STABLE_REGISTRY_CONSUMERS.length,
    );
    expect(receipt.durationMs).toBeLessThanOrEqual(30_000);
    expect(receipt.baselineSha).toMatch(/^[a-f0-9]{40}$/);
    expect(formatted).toEqual(receipt);
    expect(JSON.stringify(formatted)).not.toMatch(
      /coordinate|credential|raw payload|source content/i,
    );
  });
});
