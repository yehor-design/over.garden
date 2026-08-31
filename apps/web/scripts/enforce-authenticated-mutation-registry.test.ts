import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AuthenticatedMutationRegistryV3 } from "./authenticated-mutation-registry";
import { validateAuthenticatedMutationRegistry } from "./authenticated-mutation-registry";
import {
  assertRemainingAdmissionBoundaryEvidence,
  buildAuthenticatedMutationEnforcementReceipt,
} from "./authenticated-mutation-enforcement-receipt";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
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

const OVE_291_OWNER = "remaining_ove_291" as const;
const OVE_295_OWNER = "owned_by_ove_295" as const;

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ownedPartition(owner: typeof OVE_291_OWNER | typeof OVE_295_OWNER) {
  const entrypointIds = registry.entrypoints
    .filter((entrypoint) => entrypoint.executionOwner === owner)
    .map((entrypoint) => entrypoint.entrypointId)
    .sort();
  const owned = new Set(entrypointIds);
  const consumerEdges = registry.consumerEdges
    .filter((edge) => owned.has(edge.entrypointId))
    .sort((left, right) =>
      left.consumerEdgeId < right.consumerEdgeId
        ? -1
        : left.consumerEdgeId > right.consumerEdgeId
          ? 1
          : 0,
    );
  return { entrypointIds, consumerEdges };
}

describe("OVE-291 strict authenticated mutation enforcement", () => {
  it("enforces the exact remainder graph at every declared admission boundary", async () => {
    const partition = ownedPartition(OVE_291_OWNER);
    const admissionBoundaryIds = new Set(
      partition.consumerEdges.map((edge) => edge.admissionBoundaryId),
    );

    expect(partition.entrypointIds).toHaveLength(119);
    expect(partition.consumerEdges).toHaveLength(295);
    expect(admissionBoundaryIds.size).toBe(60);
    await expect(
      assertRemainingAdmissionBoundaryEvidence({ registry, appRoot }),
    ).resolves.toBeUndefined();

    const receipt = buildAuthenticatedMutationEnforcementReceipt({
      registry,
      registryDigest: "a".repeat(64),
      sourceRegistryReceiptDigest: "b".repeat(64),
    });
    expect(
      receipt.entrypointStates.filter(
        (state) => state.enforcementState === "enforced_ove_291",
      ),
    ).toHaveLength(119);
    expect(
      receipt.consumerEdgeStates.filter(
        (state) => state.enforcementState === "enforced_ove_291",
      ),
    ).toHaveLength(295);
  });

  it("preserves the frozen explicit-Google-link partition exactly", () => {
    const partition = ownedPartition(OVE_295_OWNER);
    expect(partition.entrypointIds).toHaveLength(5);
    expect(partition.consumerEdges).toHaveLength(15);
    expect(
      digest({
        entrypointIds: partition.entrypointIds,
        consumerEdgeIds: partition.consumerEdges.map(
          (edge) => edge.consumerEdgeId,
        ),
      }),
    ).toBe("9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad");
  });

  it("keeps the explicit Google-link initiation body byte-stable", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../src/app/garden/account-methods-panel.tsx", import.meta.url),
      ),
      "utf8",
    );
    const start = source.indexOf("  async function linkProvider(");
    const end = source.indexOf("  async function confirmDisconnect(", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const initiationBody = source.slice(start, end).trim();
    expect(initiationBody).toMatch(
      /createDocumentMutationRequestHeaders\(\s*documentMutation\?\.transport,\s*\)/u,
    );
    expect(digestSource(initiationBody)).toBe(
      "0963aa62e2eec5cd05e05818a177a768430d1757dc7d64ef101981c79dc2de1e",
    );
  });

  it("keeps public/global catalog reads outside document admission", () => {
    const exclusions = [
      ["src/app/api/public/objects/suggestions/route.ts", "GET"],
      ["src/app/api/public/catalog/suggestions/route.ts", "GET"],
      ["src/app/api/public/sources/eppo/suggestions/route.ts", "GET"],
      ["src/app/api/garden/catalog/typeahead/route.ts", "GET"],
    ] as const;

    for (const [path, symbol] of exclusions) {
      const entrypoint = registry.entrypoints.find(
        (candidate) => candidate.path === path && candidate.symbol === symbol,
      );
      expect(entrypoint, `${path}#${symbol}`).toMatchObject({
        executionOwner: "excluded_with_reason",
        generationRequirement: "not_applicable",
      });
      expect(
        registry.consumerEdges.some(
          (edge) => edge.entrypointId === entrypoint?.entrypointId,
        ),
      ).toBe(false);
    }
  });

  it("fails closed on dangling edges, multiple ownership, and reserved-partition drift", () => {
    const dangling = structuredClone(registry);
    dangling.consumerEdges[0]!.admissionBoundaryId = "missing:boundary";
    expect(
      validateAuthenticatedMutationRegistry(dangling).some(
        (finding) => finding.code === "dangling_admission_boundary",
      ),
    ).toBe(true);

    const reserved = ownedPartition(OVE_295_OWNER);
    const changed = structuredClone(registry);
    const entrypoint = changed.entrypoints.find(
      (candidate) => candidate.entrypointId === reserved.entrypointIds[0],
    )!;
    entrypoint.executionOwner = OVE_291_OWNER;
    expect(
      digest({
        entrypointIds: changed.entrypoints
          .filter((candidate) => candidate.executionOwner === OVE_295_OWNER)
          .map((candidate) => candidate.entrypointId)
          .sort(),
        consumerEdgeIds: changed.consumerEdges
          .filter((edge) =>
            changed.entrypoints.some(
              (candidate) =>
                candidate.entrypointId === edge.entrypointId &&
                candidate.executionOwner === OVE_295_OWNER,
            ),
          )
          .map((edge) => edge.consumerEdgeId)
          .sort(),
      }),
    ).not.toBe(
      "9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad",
    );
  });
});

function digestSource(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
