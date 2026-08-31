/**
 * Shared, browser-safe extension-pack vocabulary.
 *
 * The Release Center extension lane renders these labels while enforcement
 * stays in the server-only repository. Keep this module free of database and
 * Node-only dependencies so a Client Component can never pull the repository
 * into its browser bundle.
 */
export const EXTENSION_PACK_DECISION_ACTIONS = [
  "bind_parent",
  "same_item",
  "different_item",
  "add_alias",
  "defer",
  "reject",
] as const;

export type ExtensionPackDecisionAction =
  (typeof EXTENSION_PACK_DECISION_ACTIONS)[number];

export const EXTENSION_PACK_ROW_CLASSES = [
  "clean",
  "needs_parent",
  "collision",
  "duplicate",
  "rights_blocked",
  "review_needed",
  "rejected",
  "product_eligible",
] as const;

export type ExtensionPackRowClass = (typeof EXTENSION_PACK_ROW_CLASSES)[number];

export const EXTENSION_PACK_USER_NAME_STATES = [
  "provisional",
  "grouped",
  "alias_approved",
  "new_item_approved",
  "deferred",
  "rejected",
] as const;

export type ExtensionPackUserNameState =
  (typeof EXTENSION_PACK_USER_NAME_STATES)[number];

export type ExtensionPackState =
  | "draft"
  | "parsing"
  | "classified"
  | "review_ready"
  | "approved"
  | "active"
  | "retired"
  | "failed"
  | "abandoned";

/**
 * `clean` is the only class an owner approves in one batch. Everything else is
 * an exception group that needs a decision, which is what keeps the founder's
 * workload proportional to exceptions rather than to corpus size.
 */
export const EXTENSION_PACK_BATCH_APPROVABLE_CLASSES = ["clean"] as const;

export function isExtensionPackExceptionClass(
  value: ExtensionPackRowClass,
): boolean {
  return (
    value !== "clean" && value !== "product_eligible" && value !== "rejected"
  );
}

export interface ExtensionPackSummary {
  id: string;
  sourceSlug: string;
  declaredSourceVersion: string;
  packKind: "plant_variety" | "breed";
  sourceRights:
    | "use"
    | "use_with_conditions"
    | "internal_validation_only"
    | "declared_in_source";
  state: ExtensionPackState;
  artifactDigest: string;
  previewDigest: string | null;
  releaseId: string | null;
  version: number;
  createdAt: Date | string;
  approvedAt: Date | string | null;
  activatedAt: Date | string | null;
  rowCount: number;
  cleanRowCount: number;
  productEligibleRowCount: number;
  exceptionRowCount: number;
}

export interface ExtensionPackExceptionGroupSummary {
  rowClass: ExtensionPackRowClass;
  rowCount: number;
  /** Aggregate only: a group never carries a denomination or a source row id. */
  parentBoundCount: number;
  expectedVersion: number;
}

export interface ExtensionPackUserNameGroupSummary {
  state: ExtensionPackUserNameState;
  nameCount: number;
  expectedVersion: number;
}

export interface ExtensionPackCenterReadModel {
  packs: ExtensionPackSummary[];
  selectedPack: ExtensionPackSummary | null;
  exceptionGroups: ExtensionPackExceptionGroupSummary[];
  userNameGroups: ExtensionPackUserNameGroupSummary[];
  writesEnabled: boolean;
}
