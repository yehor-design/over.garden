export const PUBLIC_VARIETY_INDEXABILITY_THRESHOLD = {
  minPublicEntryCount: 3,
  minAggregateBodyLength: 600,
} as const;

export type PublicVarietyIndexValue = "noindex" | "indexable";

export interface PublicVarietyIndexState {
  value: PublicVarietyIndexValue;
  isIndexable: boolean;
  reasons: PublicVarietyIndexReason[];
  threshold: typeof PUBLIC_VARIETY_INDEXABILITY_THRESHOLD;
}

export type PublicVarietyIndexReason =
  | "entry_count_below_threshold"
  | "body_length_below_threshold";

export interface PublicVarietyIndexInput {
  entryCount: number;
  aggregateBodyLength: number;
}

export function evaluatePublicVarietyIndexState(
  input: PublicVarietyIndexInput,
): PublicVarietyIndexState {
  const reasons: PublicVarietyIndexReason[] = [];

  if (
    input.entryCount <
    PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minPublicEntryCount
  ) {
    reasons.push("entry_count_below_threshold");
  }

  if (
    input.aggregateBodyLength <
    PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minAggregateBodyLength
  ) {
    reasons.push("body_length_below_threshold");
  }

  return {
    value: reasons.length === 0 ? "indexable" : "noindex",
    isIndexable: reasons.length === 0,
    reasons,
    threshold: PUBLIC_VARIETY_INDEXABILITY_THRESHOLD,
  };
}
