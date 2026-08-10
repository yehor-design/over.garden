import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_MUTATION_SOURCE_POLICY,
  type AuthenticatedMutationRegistryV3,
} from "../../scripts/authenticated-mutation-registry";
import { createAuthenticatedMutationEffectOracle } from "./authenticated-mutation-effect-oracle";

const REGISTRY: AuthenticatedMutationRegistryV3 = {
  schemaVersion: "overgarden.authenticated-mutation-registry.v3",
  toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
  sourcePolicy: AUTHENTICATED_MUTATION_SOURCE_POLICY,
  prerequisiteReceipts: [
    {
      issueId: "OVE-296",
      receiptDigest:
        "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
    },
  ],
  sourceNodes: [
    {
      sourceNodeId: "source:entry-photo",
      path: "src/app/photo.ts",
      symbol: "submitPhoto",
      nodeKind: "server_action",
      semanticVariant: "default",
      resolutionState: "resolved",
      evidencePaths: ["src/app/photo.ts"],
    },
    {
      sourceNodeId: "source:entry-archive",
      path: "src/app/archive.ts",
      symbol: "archive",
      nodeKind: "route_handler",
      semanticVariant: "default",
      resolutionState: "resolved",
      evidencePaths: ["src/app/archive.ts"],
    },
    {
      sourceNodeId: "source:effect-canonical-and-outbox",
      path: "src/server/repository.ts",
      symbol: "commit",
      nodeKind: "effect_owner",
      semanticVariant: "canonical-and-outbox",
      resolutionState: "resolved",
      evidencePaths: ["src/server/repository.ts"],
    },
    {
      sourceNodeId: "source:effect-quarantine-put",
      path: "src/lib/storage.ts",
      symbol: "putQuarantine",
      nodeKind: "effect_owner",
      semanticVariant: "quarantine-put",
      resolutionState: "resolved",
      evidencePaths: ["src/lib/storage.ts"],
    },
    {
      sourceNodeId: "source:effect-analytics",
      path: "src/server/analytics-events.ts",
      symbol: "record",
      nodeKind: "effect_owner",
      semanticVariant: "analytics",
      resolutionState: "resolved",
      evidencePaths: ["src/server/analytics-events.ts"],
    },
  ],
  entrypoints: [
    {
      entrypointId: "entry:photo",
      path: "src/app/photo.ts",
      symbol: "submitPhoto",
      variant: "default",
      transport: "server_action",
      authority: "authenticated_user",
      classification: "effectful",
      executionOwner: "high_risk_ove_290",
      generationRequirement: "required_before_first_effect",
      exclusionReason: null,
      evidencePaths: ["src/app/photo.ts"],
    },
    {
      entrypointId: "entry:archive",
      path: "src/app/archive.ts",
      symbol: "archive",
      variant: "default",
      transport: "route_handler",
      authority: "authenticated_user",
      classification: "effectful",
      executionOwner: "remaining_ove_291",
      generationRequirement: "required_before_first_effect",
      exclusionReason: null,
      evidencePaths: ["src/app/archive.ts"],
    },
  ],
  effectBoundaries: [
    {
      effectBoundaryId: "effect:canonical-and-outbox",
      ownerPath: "src/server/repository.ts",
      ownerSymbol: "commit",
      commitLabel: "canonical-and-outbox",
      atomicity: "database_transaction",
      effectFamilies: ["canonical_row", "transactional_outbox"],
      idempotencyOwner: "src/server/repository.ts#commit",
      evidencePaths: ["src/server/repository.ts"],
    },
    {
      effectBoundaryId: "effect:quarantine-put",
      ownerPath: "src/lib/storage.ts",
      ownerSymbol: "putQuarantine",
      commitLabel: "quarantine-put",
      atomicity: "provider_operation",
      effectFamilies: ["quarantine_object", "external_call"],
      idempotencyOwner: "src/lib/storage.ts#putQuarantine",
      evidencePaths: ["src/lib/storage.ts"],
    },
    {
      effectBoundaryId: "effect:analytics",
      ownerPath: "src/server/analytics-events.ts",
      ownerSymbol: "record",
      commitLabel: "analytics",
      atomicity: "single_best_effort_attempt",
      effectFamilies: ["analytics_event"],
      idempotencyOwner: "src/server/analytics-events.ts#record",
      evidencePaths: ["src/server/analytics-events.ts"],
    },
  ],
  consumerEdges: [
    {
      consumerEdgeId: "edge:photo:canonical:first",
      entrypointId: "entry:photo",
      effectBoundaryId: "effect:canonical-and-outbox",
      pipelineId: "pipeline:photo",
      branchId: "branch:photo:always",
      branchConditionClass: "always",
      predecessorEdgeIds: [],
      admissionBoundaryId: "entry:photo",
      executionMode: "required",
      evidencePaths: ["src/app/photo.ts"],
    },
    {
      consumerEdgeId: "edge:photo:canonical:shared-consumer",
      entrypointId: "entry:photo",
      effectBoundaryId: "effect:canonical-and-outbox",
      pipelineId: "pipeline:photo",
      branchId: "branch:photo:shared:always",
      branchConditionClass: "always",
      predecessorEdgeIds: [],
      admissionBoundaryId: "entry:photo",
      executionMode: "required",
      evidencePaths: ["src/app/photo.ts"],
    },
    {
      consumerEdgeId: "edge:photo:quarantine",
      entrypointId: "entry:photo",
      effectBoundaryId: "effect:quarantine-put",
      pipelineId: "pipeline:photo",
      branchId: "branch:photo:quarantine:success",
      branchConditionClass: "success",
      predecessorEdgeIds: ["edge:photo:canonical:first"],
      admissionBoundaryId: "entry:photo",
      executionMode: "conditional",
      evidencePaths: ["src/app/photo.ts"],
    },
    {
      consumerEdgeId: "edge:photo:analytics",
      entrypointId: "entry:photo",
      effectBoundaryId: "effect:analytics",
      pipelineId: "pipeline:photo",
      branchId: "branch:photo:analytics:success",
      branchConditionClass: "success",
      predecessorEdgeIds: ["edge:photo:canonical:first"],
      admissionBoundaryId: "entry:photo",
      executionMode: "best_effort_after_commit",
      evidencePaths: ["src/app/photo.ts"],
    },
    {
      consumerEdgeId: "edge:archive:canonical",
      entrypointId: "entry:archive",
      effectBoundaryId: "effect:canonical-and-outbox",
      pipelineId: "pipeline:archive",
      branchId: "branch:archive:always",
      branchConditionClass: "always",
      predecessorEdgeIds: [],
      admissionBoundaryId: "entry:archive",
      executionMode: "required",
      evidencePaths: ["src/app/archive.ts"],
    },
  ],
};

describe("authenticated mutation effect oracle", () => {
  it("records one ordered receipt per true boundary even when several consumers share it", () => {
    const oracle = createAuthenticatedMutationEffectOracle(REGISTRY);

    expect(
      oracle.attempt({
        attemptId: "attempt-photo-1",
        entrypointId: "entry:photo",
        admission: "accepted",
        enabledConsumerEdgeIds: [
          "edge:photo:quarantine",
          "edge:photo:analytics",
        ],
      }),
    ).toEqual({
      attemptId: "attempt-photo-1",
      entrypointId: "entry:photo",
      admission: "accepted",
      boundaryReceipts: [
        {
          effectBoundaryId: "effect:canonical-and-outbox",
          sequence: 1,
          effectFamilies: ["canonical_row", "transactional_outbox"],
        },
        {
          effectBoundaryId: "effect:analytics",
          sequence: 2,
          effectFamilies: ["analytics_event"],
        },
        {
          effectBoundaryId: "effect:quarantine-put",
          sequence: 3,
          effectFamilies: ["external_call", "quarantine_object"],
        },
      ],
    });
  });

  it("records no reachable effect for a rejected admission and keeps counters instance-local", () => {
    const first = createAuthenticatedMutationEffectOracle(REGISTRY);
    const second = createAuthenticatedMutationEffectOracle(REGISTRY);

    expect(
      first.attempt({
        attemptId: "attempt-rejected",
        entrypointId: "entry:archive",
        admission: "rejected",
        enabledConsumerEdgeIds: [],
      }).boundaryReceipts,
    ).toEqual([]);
    first.attempt({
      attemptId: "attempt-accepted",
      entrypointId: "entry:archive",
      admission: "accepted",
      enabledConsumerEdgeIds: [],
    });

    expect(first.snapshot()).toEqual({
      acceptedAttempts: 1,
      rejectedAttempts: 1,
      boundaryReceiptCount: 1,
    });
    expect(second.snapshot()).toEqual({
      acceptedAttempts: 0,
      rejectedAttempts: 0,
      boundaryReceiptCount: 0,
    });
  });

  it("rejects replayed attempt IDs, unknown entrypoints, and impossible conditional predecessor execution", () => {
    const oracle = createAuthenticatedMutationEffectOracle(REGISTRY);
    const accepted = {
      attemptId: "same-attempt",
      entrypointId: "entry:photo",
      admission: "accepted" as const,
      enabledConsumerEdgeIds: ["edge:photo:quarantine"],
    };

    oracle.attempt(accepted);
    expect(() => oracle.attempt(accepted)).toThrow(/attempt/i);
    expect(() =>
      oracle.attempt({
        attemptId: "unknown-entrypoint",
        entrypointId: "entry:missing",
        admission: "accepted",
        enabledConsumerEdgeIds: [],
      }),
    ).toThrow(/entrypoint/i);
    expect(() =>
      oracle.attempt({
        attemptId: "unknown-edge",
        entrypointId: "entry:photo",
        admission: "accepted",
        enabledConsumerEdgeIds: ["edge:missing"],
      }),
    ).toThrow(/edge/i);

    const registryWithConditionalChain: AuthenticatedMutationRegistryV3 = {
      ...REGISTRY,
      consumerEdges: [
        ...REGISTRY.consumerEdges,
        {
          consumerEdgeId: "edge:photo:after-quarantine",
          entrypointId: "entry:photo",
          effectBoundaryId: "effect:analytics",
          pipelineId: "pipeline:photo",
          branchId: "branch:photo:after-quarantine:success",
          branchConditionClass: "success",
          predecessorEdgeIds: ["edge:photo:quarantine"],
          admissionBoundaryId: "entry:photo",
          executionMode: "conditional",
          evidencePaths: ["src/app/photo.ts"],
        },
      ],
    };
    const chainedOracle = createAuthenticatedMutationEffectOracle(
      registryWithConditionalChain,
    );
    expect(() =>
      chainedOracle.attempt({
        attemptId: "missing-conditional-predecessor",
        entrypointId: "entry:photo",
        admission: "accepted",
        enabledConsumerEdgeIds: ["edge:photo:after-quarantine"],
      }),
    ).toThrow(/predecessor/i);
  });

  it("emits receipts for every closed effect family without merging distinct commit boundaries", () => {
    const extraEffects = [
      {
        id: "public-projection",
        family: "public_projection",
        atomicity: "single_best_effort_attempt",
      },
      {
        id: "public-derivative",
        family: "public_derivative",
        atomicity: "provider_operation",
      },
      {
        id: "auth-account",
        family: "auth_account",
        atomicity: "auth_adapter_commit",
      },
      {
        id: "auth-session",
        family: "auth_session",
        atomicity: "auth_adapter_commit",
      },
      {
        id: "browser-cookie",
        family: "browser_cookie",
        atomicity: "cookie_commit",
      },
      {
        id: "browser-storage",
        family: "browser_storage",
        atomicity: "browser_storage_transaction",
      },
    ] as const;
    const registry: AuthenticatedMutationRegistryV3 = {
      ...REGISTRY,
      sourceNodes: [
        ...REGISTRY.sourceNodes,
        ...extraEffects.map((spec) => ({
          sourceNodeId: `source:effect-${spec.id}`,
          path: `src/server/effect-${spec.id}.ts`,
          symbol: `commit_${spec.id.replaceAll("-", "_")}`,
          nodeKind: "effect_owner" as const,
          semanticVariant: spec.id,
          resolutionState: "resolved" as const,
          evidencePaths: [`src/server/effect-${spec.id}.ts`],
        })),
      ],
      effectBoundaries: [
        ...REGISTRY.effectBoundaries,
        ...extraEffects.map((spec) => ({
          effectBoundaryId: `effect:${spec.id}`,
          ownerPath: `src/server/effect-${spec.id}.ts`,
          ownerSymbol: `commit_${spec.id.replaceAll("-", "_")}`,
          commitLabel: spec.id,
          atomicity: spec.atomicity,
          effectFamilies: [spec.family],
          idempotencyOwner: `src/server/effect-${spec.id}.ts#commit_${spec.id.replaceAll("-", "_")}`,
          evidencePaths: [`src/server/effect-${spec.id}.ts`],
        })),
      ],
      consumerEdges: [
        ...REGISTRY.consumerEdges,
        ...extraEffects.map((spec) => ({
          consumerEdgeId: `edge:photo:${spec.id}`,
          entrypointId: "entry:photo",
          effectBoundaryId: `effect:${spec.id}`,
          pipelineId: "pipeline:photo",
          branchId: `branch:photo:${spec.id}:success`,
          branchConditionClass: "success" as const,
          predecessorEdgeIds: ["edge:photo:canonical:first"],
          admissionBoundaryId: "entry:photo",
          executionMode: "conditional" as const,
          evidencePaths: [
            "src/app/photo.ts",
            `src/server/effect-${spec.id}.ts`,
          ],
        })),
      ],
    };
    const oracle = createAuthenticatedMutationEffectOracle(registry);
    const receipt = oracle.attempt({
      attemptId: "attempt-all-effect-families",
      entrypointId: "entry:photo",
      admission: "accepted",
      enabledConsumerEdgeIds: [
        "edge:photo:analytics",
        "edge:photo:quarantine",
        ...extraEffects.map((spec) => `edge:photo:${spec.id}`),
      ],
    });

    expect(
      [...new Set(receipt.boundaryReceipts.flatMap((item) => item.effectFamilies))].sort(),
    ).toEqual([
      "analytics_event",
      "auth_account",
      "auth_session",
      "browser_cookie",
      "browser_storage",
      "canonical_row",
      "external_call",
      "public_derivative",
      "public_projection",
      "quarantine_object",
      "transactional_outbox",
    ]);
    expect(receipt.boundaryReceipts).toHaveLength(9);
  });
});
