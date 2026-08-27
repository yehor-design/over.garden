import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AuthenticatedMutationRegistryV3 } from "./authenticated-mutation-registry";
import {
  assertBaselineHighRiskTopology,
  assertHighRiskAdmissionBoundaryEvidence,
  buildAuthenticatedMutationDeploymentReceiptArtifact,
  buildAuthenticatedMutationEnforcementReceipt,
  canonicalizeAuthenticatedMutationEnforcementReceipt,
} from "./authenticated-mutation-enforcement-receipt";

const registry = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../contracts/auth/authenticated-mutation-registry.v3.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as AuthenticatedMutationRegistryV3;
const REGISTRY_DIGEST = "a".repeat(64);
const SOURCE_RECEIPT_DIGEST = "b".repeat(64);

describe("authenticated mutation enforcement receipt", () => {
  it("builds deterministic canonical states without assigning effect ownership", () => {
    const first = buildAuthenticatedMutationEnforcementReceipt({
      registry,
      registryDigest: REGISTRY_DIGEST,
      sourceRegistryReceiptDigest: SOURCE_RECEIPT_DIGEST,
    });
    const second = buildAuthenticatedMutationEnforcementReceipt({
      registry,
      registryDigest: REGISTRY_DIGEST,
      sourceRegistryReceiptDigest: SOURCE_RECEIPT_DIGEST,
    });

    expect(canonicalizeAuthenticatedMutationEnforcementReceipt(first)).toBe(
      canonicalizeAuthenticatedMutationEnforcementReceipt(second),
    );
    expect(first.entrypointStates).toHaveLength(registry.entrypoints.length);
    expect(
      first.entrypointStates.filter(
        (state) => state.enforcementState === "enforced_ove_290",
      ),
    ).toHaveLength(8);
    expect(
      first.consumerEdgeStates.filter(
        (state) => state.enforcementState === "enforced_ove_290",
      ),
    ).toHaveLength(72);
    expect(JSON.stringify(first)).not.toMatch(/effectBoundaryId/);
  });

  it("binds both final registry digests byte-for-byte", () => {
    const receipt = buildAuthenticatedMutationEnforcementReceipt({
      registry,
      registryDigest: REGISTRY_DIGEST,
      sourceRegistryReceiptDigest: SOURCE_RECEIPT_DIGEST,
    });

    expect(receipt.registryDigest).toBe(REGISTRY_DIGEST);
    expect(receipt.sourceRegistryReceiptDigest).toBe(SOURCE_RECEIPT_DIGEST);
    expect(() =>
      buildAuthenticatedMutationEnforcementReceipt({
        registry,
        registryDigest: "not-a-digest",
        sourceRegistryReceiptDigest: SOURCE_RECEIPT_DIGEST,
      }),
    ).toThrow("canonical registry digest");
  });

  it("generates a bounded deployment receipt without graph payloads", () => {
    const enforcementReceipt = buildAuthenticatedMutationEnforcementReceipt({
      registry,
      registryDigest: REGISTRY_DIGEST,
      sourceRegistryReceiptDigest: SOURCE_RECEIPT_DIGEST,
    });
    const receipt = buildAuthenticatedMutationDeploymentReceiptArtifact({
      registry,
      enforcementReceipt,
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt).toMatchObject({
      schemaVersion: "overgarden.authenticated-mutation-deployment-receipt.v1",
      registry: {
        digest: REGISTRY_DIGEST,
        sourceReceiptDigest: SOURCE_RECEIPT_DIGEST,
        entrypointCount: registry.entrypoints.length,
        consumerEdgeCount: registry.consumerEdges.length,
      },
      enforcement: {
        receiptDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        ove291EntrypointCount: 103,
        ove291ConsumerEdgeCount: 271,
      },
      explicitGoogleLink: {
        ownershipDigest:
          "9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad",
        entrypointCount: 5,
        consumerEdgeCount: 15,
      },
    });
    expect(serialized).not.toContain(
      "overgarden.authenticated-mutation-registry.v3",
    );
    expect(serialized).not.toMatch(/entrypointId|consumerEdgeId|\.tsx?/);
  });

  it("fails closed if a baseline entrypoint or edge binding drifts", () => {
    const missingEntrypoint = structuredClone(registry);
    const highRiskId = missingEntrypoint.entrypoints.find(
      (entrypoint) => entrypoint.executionOwner === "high_risk_ove_290",
    )!.entrypointId;
    missingEntrypoint.entrypoints = missingEntrypoint.entrypoints.filter(
      (entrypoint) => entrypoint.entrypointId !== highRiskId,
    );
    expect(() => assertBaselineHighRiskTopology(missingEntrypoint)).toThrow(
      "high-risk entrypoint count drifted",
    );

    const changedEdge = structuredClone(registry);
    const highRiskIds = new Set(
      changedEdge.entrypoints
        .filter(
          (entrypoint) => entrypoint.executionOwner === "high_risk_ove_290",
        )
        .map((entrypoint) => entrypoint.entrypointId),
    );
    const edge = changedEdge.consumerEdges.find((candidate) =>
      highRiskIds.has(candidate.entrypointId),
    )!;
    edge.admissionBoundaryId = "drifted:admission-boundary";
    expect(() => assertBaselineHighRiskTopology(changedEdge)).toThrow(
      "edge/admission/effect binding set drifted",
    );
  });

  it("reads all 6 live high-risk admission bodies and proves their task-owned guards", async () => {
    await expect(
      assertHighRiskAdmissionBoundaryEvidence({
        registry,
        appRoot: fileURLToPath(new URL("../", import.meta.url)),
      }),
    ).resolves.toBeUndefined();
  });
});
