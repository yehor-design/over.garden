import {
  evaluatePublicSurfaceIndexability,
  PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD,
  type PublicSurfaceIndexReason,
  type PublicSurfaceIndexState,
  type PublicSurfaceIndexValue,
} from "./public-surface-indexing-policy";

export const PUBLIC_VARIETY_INDEXABILITY_THRESHOLD =
  PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD;

export type PublicVarietyIndexValue = PublicSurfaceIndexValue;

export type PublicVarietyIndexState = PublicSurfaceIndexState;

export type PublicVarietyIndexReason =
  | Extract<
      PublicSurfaceIndexReason,
      "entry_count_below_threshold" | "body_length_below_threshold"
    >;

export interface PublicVarietyIndexInput {
  entryCount: number;
  aggregateBodyLength: number;
}

export function evaluatePublicVarietyIndexState(
  input: PublicVarietyIndexInput,
): PublicVarietyIndexState {
  return evaluatePublicSurfaceIndexability({
    kind: "variety_aggregation",
    entryCount: input.entryCount,
    aggregateBodyLength: input.aggregateBodyLength,
  });
}
