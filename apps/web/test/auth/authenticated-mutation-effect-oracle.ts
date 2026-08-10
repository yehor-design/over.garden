import {
  validateAuthenticatedMutationRegistry,
  type AuthenticatedMutationEffectFamily,
  type AuthenticatedMutationRegistryV2,
} from "../../scripts/authenticated-mutation-registry";

export interface AuthenticatedMutationEffectAttempt {
  attemptId: string;
  entrypointId: string;
  admission: "accepted" | "rejected";
  enabledConsumerEdgeIds: readonly string[];
}

export interface AuthenticatedMutationBoundaryReceipt {
  effectBoundaryId: string;
  sequence: number;
  effectFamilies: AuthenticatedMutationEffectFamily[];
}

export interface AuthenticatedMutationEffectAttemptReceipt {
  attemptId: string;
  entrypointId: string;
  admission: "accepted" | "rejected";
  boundaryReceipts: AuthenticatedMutationBoundaryReceipt[];
}

export interface AuthenticatedMutationEffectOracleSnapshot {
  acceptedAttempts: number;
  rejectedAttempts: number;
  boundaryReceiptCount: number;
}

export function createAuthenticatedMutationEffectOracle(
  registry: AuthenticatedMutationRegistryV2,
) {
  const findings = validateAuthenticatedMutationRegistry(registry);
  if (findings.length > 0) {
    throw new Error(`Invalid registry: ${findings[0]!.code}.`);
  }

  const entrypoints = new Set(
    registry.entrypoints.map((entrypoint) => entrypoint.entrypointId),
  );
  const effects = new Map(
    registry.effectBoundaries.map((effect) => [effect.effectBoundaryId, effect]),
  );
  const edges = new Map(
    registry.consumerEdges.map((edge) => [edge.consumerEdgeId, edge]),
  );
  const consumedAttemptIds = new Set<string>();
  const state: AuthenticatedMutationEffectOracleSnapshot = {
    acceptedAttempts: 0,
    rejectedAttempts: 0,
    boundaryReceiptCount: 0,
  };

  return {
    attempt(
      input: AuthenticatedMutationEffectAttempt,
    ): AuthenticatedMutationEffectAttemptReceipt {
      if (!input.attemptId.trim() || consumedAttemptIds.has(input.attemptId)) {
        throw new Error("Attempt ID must be unique and non-empty.");
      }
      if (!entrypoints.has(input.entrypointId)) {
        throw new Error("Unknown entrypoint.");
      }
      consumedAttemptIds.add(input.attemptId);

      if (input.admission === "rejected") {
        state.rejectedAttempts += 1;
        return {
          attemptId: input.attemptId,
          entrypointId: input.entrypointId,
          admission: input.admission,
          boundaryReceipts: [],
        };
      }

      const enabled = new Set(input.enabledConsumerEdgeIds);
      for (const edgeId of enabled) {
        const edge = edges.get(edgeId);
        if (!edge || edge.entrypointId !== input.entrypointId) {
          throw new Error("Enabled edge is outside the selected entrypoint.");
        }
      }

      const selectedEdges = registry.consumerEdges.filter(
        (edge) =>
          edge.entrypointId === input.entrypointId &&
          (edge.executionMode === "required" || enabled.has(edge.consumerEdgeId)),
      );
      const selectedEdgeIds = new Set(
        selectedEdges.map((edge) => edge.consumerEdgeId),
      );
      for (const edge of selectedEdges) {
        const missingPredecessor = edge.predecessorEdgeIds.find(
          (predecessorId) => !selectedEdgeIds.has(predecessorId),
        );
        if (missingPredecessor) {
          throw new Error(
            `Enabled edge ${edge.consumerEdgeId} requires predecessor ${missingPredecessor}.`,
          );
        }
      }
      const orderedEdges = topologicalOrder(selectedEdges);
      const emittedBoundaries = new Set<string>();
      const boundaryReceipts: AuthenticatedMutationBoundaryReceipt[] = [];
      for (const edge of orderedEdges) {
        if (emittedBoundaries.has(edge.effectBoundaryId)) continue;
        emittedBoundaries.add(edge.effectBoundaryId);
        const effect = effects.get(edge.effectBoundaryId);
        if (!effect) throw new Error("Unknown effect boundary.");
        boundaryReceipts.push({
          effectBoundaryId: edge.effectBoundaryId,
          sequence: boundaryReceipts.length + 1,
          effectFamilies: [...new Set(effect.effectFamilies)].sort(byteCompare),
        });
      }

      state.acceptedAttempts += 1;
      state.boundaryReceiptCount += boundaryReceipts.length;
      return {
        attemptId: input.attemptId,
        entrypointId: input.entrypointId,
        admission: input.admission,
        boundaryReceipts,
      };
    },

    snapshot(): AuthenticatedMutationEffectOracleSnapshot {
      return { ...state };
    },
  };
}

function topologicalOrder(
  edges: AuthenticatedMutationRegistryV2["consumerEdges"],
) {
  const byId = new Map(edges.map((edge) => [edge.consumerEdgeId, edge]));
  const remaining = new Set(byId.keys());
  const admitted = new Set<string>();
  const ordered: (typeof edges)[number][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((edgeId) => byId.get(edgeId)!)
      .filter((edge) =>
        edge.predecessorEdgeIds.every(
          (predecessorId) => admitted.has(predecessorId),
        ),
      )
      .sort((left, right) => byteCompare(left.consumerEdgeId, right.consumerEdgeId));
    if (ready.length === 0) throw new Error("Consumer-edge pipeline is cyclic.");
    for (const edge of ready) {
      remaining.delete(edge.consumerEdgeId);
      admitted.add(edge.consumerEdgeId);
      ordered.push(edge);
    }
  }
  return ordered;
}

function byteCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
