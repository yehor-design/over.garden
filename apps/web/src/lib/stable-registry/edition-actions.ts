/**
 * Shared, browser-safe edition vocabulary.
 *
 * The edition lane renders these labels while enforcement stays in the
 * server-only repository. Keep this module free of database and Node-only
 * dependencies so a Client Component can never pull the repository into its
 * browser bundle.
 */
export const EDITION_DECISION_ACTIONS = [
  "keep_current",
  "add_alias",
  "same_concept",
  "different_concept",
  "create_successor",
  "record_equivalence",
  "record_split",
  "defer",
  "block_rule",
] as const;

export type EditionDecisionAction = (typeof EDITION_DECISION_ACTIONS)[number];

export const EDITION_DIFF_CLASSES = [
  "unchanged",
  "addition",
  "alias",
  "correction",
  "supersession",
  "split",
  "rights_change",
] as const;

export type EditionDiffClass = (typeof EDITION_DIFF_CLASSES)[number];

export const EDITION_RELATION_KINDS = [
  "same_concept",
  "equivalent_to",
  "replaced_by",
  "split_into",
] as const;

export type EditionRelationKind = (typeof EDITION_RELATION_KINDS)[number];

export const EDITION_TRANSITIONS = ["activate", "rollback", "forward"] as const;

export type EditionTransition = (typeof EDITION_TRANSITIONS)[number];

/**
 * `unchanged` is the whole point of an edition: the owner reviews only what
 * moved. It is never an exception group and never needs a decision.
 */
export function isEditionReviewableDiffClass(value: EditionDiffClass): boolean {
  return value !== "unchanged";
}

/**
 * A group that can still block approval. `alias` and `addition` are additive
 * and safe to carry forward; the rest change or retire an existing identity, so
 * the owner must resolve them explicitly.
 */
export function isEditionBlockingDiffClass(value: EditionDiffClass): boolean {
  return (
    value === "correction" ||
    value === "supersession" ||
    value === "split" ||
    value === "rights_change"
  );
}

export interface EditionDiffGroupSummary {
  id: string;
  diffClass: EditionDiffClass;
  state: "open" | "decided" | "deferred" | "blocked";
  memberCount: number;
  /** Aggregate only: never an object id, an owner id, or journal content. */
  affectedObjectCount: number;
  expectedVersion: number;
}

export interface EditionActivationReceiptSummary {
  sequenceNumber: number;
  transition: EditionTransition;
  state: "prepared" | "applied" | "verified" | "rolled_back" | "failed";
  releaseId: string;
  priorReleaseId: string | null;
  affectedObjectCount: number;
  createdAt: Date | string;
}

export interface EditionSummary {
  id: string;
  state:
    | "draft"
    | "building"
    | "review_ready"
    | "approved"
    | "active"
    | "retired"
    | "failed"
    | "abandoned";
  priorReleaseId: string | null;
  previewDigest: string | null;
  version: number;
  createdAt: Date | string;
  approvedAt: Date | string | null;
  activatedAt: Date | string | null;
  unchangedCount: number;
  reviewableCount: number;
  blockingCount: number;
  totalAffectedObjectCount: number;
}

/**
 * A completed source capture the owner may compare the active release against.
 * Only the opaque id and its observed time; a capture's contents are source
 * evidence and never reach this operator surface.
 */
export interface EditionCaptureOption {
  captureId: string;
  observedEndedAt: string;
}

export interface EditionCenterReadModel {
  edition: EditionSummary | null;
  activeReleaseId: string | null;
  diffGroups: EditionDiffGroupSummary[];
  activationHistory: EditionActivationReceiptSummary[];
  availableCaptures: EditionCaptureOption[];
  writesEnabled: boolean;
}
