import { createHash } from "node:crypto";

import {
  FOUNDATION_EXCEPTION_REASONS,
  type FoundationExceptionReason,
} from "@/lib/stable-registry/decision-actions";

export { FOUNDATION_EXCEPTION_REASONS };
export type { FoundationExceptionReason };

/**
 * OVE-255's deterministic, source-safe Foundation classification policy.
 *
 * This module deliberately receives only already-classified facts. It never
 * accepts a source payload, source name, coordinates, or user data, so it can
 * be used by the worker, UI fixture, and smoke proof without widening the
 * source-layer boundary established by OVE-254.
 */
export const FOUNDATION_POLICY_VERSION = "ove255.foundation.v1" as const;

export type FoundationEligibility =
  | "auto_ready"
  | "needs_review"
  | "source_only"
  | "blocked"
  | "product_eligible";

export interface FoundationRecordFacts {
  rightsCleared: boolean;
  objectKind: "plant" | "animal" | "unknown";
  hasRequiredHierarchy: boolean;
  hasDeterministicAuthorityMapping: boolean;
  conflictReason?: FoundationExceptionReason;
}

export interface FoundationClassification {
  eligibility: FoundationEligibility;
  exceptionReason: FoundationExceptionReason | null;
}

export interface FoundationPlan {
  policyVersion: typeof FOUNDATION_POLICY_VERSION;
  classifications: FoundationClassification[];
  counts: Record<FoundationEligibility, number>;
  exceptionGroups: Array<{
    reason: FoundationExceptionReason;
    count: number;
    groupKey: string;
  }>;
}

export function classifyFoundationRecord(
  facts: FoundationRecordFacts,
): FoundationClassification {
  if (!facts.rightsCleared) {
    return {
      eligibility: "source_only",
      exceptionReason: "source_only_or_ineligible",
    };
  }

  if (facts.objectKind === "unknown" || !facts.hasRequiredHierarchy) {
    return {
      eligibility: "source_only",
      exceptionReason: "source_only_or_ineligible",
    };
  }

  if (facts.conflictReason) {
    return {
      eligibility: "needs_review",
      exceptionReason: facts.conflictReason,
    };
  }

  if (!facts.hasDeterministicAuthorityMapping) {
    return {
      eligibility: "needs_review",
      exceptionReason: "authority_corroboration_required",
    };
  }

  return { eligibility: "auto_ready", exceptionReason: null };
}

export function buildFoundationPlan(input: {
  captureManifestSha256: string;
  records: readonly FoundationRecordFacts[];
}): FoundationPlan {
  assertSha256(input.captureManifestSha256, "capture manifest");

  const classifications = input.records.map(classifyFoundationRecord);
  const counts: Record<FoundationEligibility, number> = {
    auto_ready: 0,
    needs_review: 0,
    source_only: 0,
    blocked: 0,
    product_eligible: 0,
  };
  const groups = new Map<FoundationExceptionReason, number>();

  for (const classification of classifications) {
    counts[classification.eligibility] += 1;
    if (classification.exceptionReason) {
      groups.set(
        classification.exceptionReason,
        (groups.get(classification.exceptionReason) ?? 0) + 1,
      );
    }
  }

  const exceptionGroups = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([reason, count]) => ({
      reason,
      count,
      groupKey: digestCanonical({
        policyVersion: FOUNDATION_POLICY_VERSION,
        captureManifestSha256: input.captureManifestSha256,
        reason,
      }),
    }));

  return {
    policyVersion: FOUNDATION_POLICY_VERSION,
    classifications,
    counts,
    exceptionGroups,
  };
}

export function foundationBuildDigest(input: {
  captureId: string;
  captureManifestSha256: string;
  policyVersion?: string;
}): string {
  assertSha256(input.captureManifestSha256, "capture manifest");
  return digestCanonical({
    captureId: input.captureId,
    captureManifestSha256: input.captureManifestSha256,
    policyVersion: input.policyVersion ?? FOUNDATION_POLICY_VERSION,
  });
}

export function foundationPreviewDigest(input: {
  releaseId: string;
  buildDigest: string;
  membershipDigest: string;
  decisionDigest: string;
}): string {
  assertSha256(input.buildDigest, "build");
  assertSha256(input.membershipDigest, "membership");
  assertSha256(input.decisionDigest, "decision");
  return digestCanonical(input);
}

export function stableRegistryDigest(value: unknown): string {
  return digestCanonical(value);
}

function digestCanonical(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function assertSha256(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`Invalid ${label} digest.`);
  }
}
