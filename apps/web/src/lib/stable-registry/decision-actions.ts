/**
 * Shared, browser-safe Registry decision vocabulary.
 *
 * The operator UI may render these labels, while enforcement remains in the
 * server-only release repository. Keep this contract free of DB and Node-only
 * dependencies so a Client Component can never pull the repository into its
 * browser bundle.
 */
export const REGISTRY_DECISION_ACTIONS = [
  "same_concept",
  "different_concept",
  "add_alias",
  "keep_current",
  "create_successor",
  "defer",
  "block_rule",
] as const;

export type RegistryDecisionAction = (typeof REGISTRY_DECISION_ACTIONS)[number];

export const FOUNDATION_EXCEPTION_REASONS = [
  "accepted_name_conflict",
  "rank_conflict",
  "ambiguous_identity",
  "merge_candidate",
  "split_candidate",
  "rights_ambiguity",
  "unsupported_field",
  "authority_corroboration_required",
  "source_only_or_ineligible",
] as const;

export type FoundationExceptionReason =
  (typeof FOUNDATION_EXCEPTION_REASONS)[number];

export type StableRegistryReleaseState =
  | "draft"
  | "building"
  | "review_ready"
  | "approved"
  | "active"
  | "retired"
  | "failed"
  | "abandoned";

/** Browser-safe aggregate shape rendered by the operator Client Component. */
export interface StableRegistryReleaseSummary {
  id: string;
  state: StableRegistryReleaseState;
  captureId: string;
  policyVersion: string;
  buildDigest: string;
  previewDigest: string | null;
  version: number;
  createdAt: Date | string;
  reviewReadyAt: Date | string | null;
  approvedAt: Date | string | null;
  activatedAt: Date | string | null;
  memberCount: number;
  eligibleMemberCount: number;
  openGroupCount: number;
  blockingGroupCount: number;
}

export interface StableRegistryExceptionGroupSummary {
  id: string;
  reasonClass: FoundationExceptionReason;
  state: "open" | "decided" | "deferred" | "blocked";
  memberCount: number;
  expectedVersion: number;
}

export interface StableRegistryReleaseCenterReadModel {
  latestRelease: StableRegistryReleaseSummary | null;
  exceptionGroups: StableRegistryExceptionGroupSummary[];
  completedCaptureCount: number;
  writesEnabled: boolean;
}
