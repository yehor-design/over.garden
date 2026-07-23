/**
 * OVE-207 journal cover selection contract.
 * Cover identity is aggregate state; JournalDocumentV1 remains story-only.
 */

import {
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";

export const JOURNAL_MEDIA_USAGE_INLINE = "inline" as const;
export const JOURNAL_MEDIA_USAGE_COVER_ONLY = "cover_only" as const;

export type JournalMediaUsageRole =
  | typeof JOURNAL_MEDIA_USAGE_INLINE
  | typeof JOURNAL_MEDIA_USAGE_COVER_ONLY;

export type JournalCoverMode =
  | "automatic"
  | "explicit_inline"
  | "separate"
  | "none";

export type JournalCoverSource =
  | "automatic_inline"
  | "explicit_inline"
  | "separate"
  | "none";

export const OVE_207_BROWSER_SCENARIO_IDS = [
  "automatic-cover-fallback",
  "explicit-inline-cover-stable-after-reorder",
  "separate-cover-upload-in-flight-blocked",
  "separate-cover-upload-failure-preserves-prior",
  "keep-as-cover-after-inline-removal",
  "remove-everywhere-after-inline-removal",
  "ten-inline-plus-one-cover",
  "locale-transition-with-cover",
] as const;

export type Ove207BrowserScenarioId =
  (typeof OVE_207_BROWSER_SCENARIO_IDS)[number];

export const OVE_207_PRIMARY_BROWSER_SCENARIO_ID =
  "locale-transition-with-cover" as const satisfies Ove207BrowserScenarioId;

export const OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID =
  "owner-composer-cover-upload";

export interface JournalCoverCandidate {
  mediaAssetId: string;
  usageRole: JournalMediaUsageRole;
  status: "quarantined" | "processed" | "failed" | string;
  derivativeKey: string | null;
  originalDeletedAt: Date | string | null;
  altText?: string | null;
}

export interface ResolvedJournalCover {
  mediaAssetId: string | null;
  source: JournalCoverSource;
  mode: JournalCoverMode;
  derivativeKey: string | null;
  altText: string | null;
}

export function isEligibleProcessedCoverCandidate(
  candidate: JournalCoverCandidate | null | undefined,
): candidate is JournalCoverCandidate & {
  status: "processed";
  derivativeKey: string;
} {
  if (!candidate) return false;
  // Processing success is status + derivative. originalDeletedAt is post-process
  // cleanup and must not delay owner/public cover presentation.
  return (
    candidate.status === "processed" &&
    typeof candidate.derivativeKey === "string" &&
    candidate.derivativeKey.length > 0
  );
}

/**
 * Resolve the single effective cover for presentation and metadata.
 * Explicit cover wins when still a valid claimed processed asset; otherwise
 * fall back to the first valid processed inline image in document order.
 */
export function resolveEffectiveJournalCover(input: {
  document: JournalDocumentV1 | null | undefined;
  explicitCoverMediaAssetId: string | null | undefined;
  candidatesById: ReadonlyMap<string, JournalCoverCandidate>;
}): ResolvedJournalCover {
  const explicitId = input.explicitCoverMediaAssetId ?? null;
  if (explicitId) {
    const explicit = input.candidatesById.get(explicitId);
    if (isEligibleProcessedCoverCandidate(explicit)) {
      const mode: JournalCoverMode =
        explicit.usageRole === JOURNAL_MEDIA_USAGE_COVER_ONLY
          ? "separate"
          : "explicit_inline";
      return {
        mediaAssetId: explicit.mediaAssetId,
        source:
          mode === "separate" ? "separate" : "explicit_inline",
        mode,
        derivativeKey: explicit.derivativeKey,
        altText: explicit.altText ?? null,
      };
    }
  }

  const orderedInlineIds = input.document
    ? listJournalDocumentImageMediaIds(input.document)
    : [];
  for (const mediaAssetId of orderedInlineIds) {
    const candidate = input.candidatesById.get(mediaAssetId);
    if (
      !candidate ||
      candidate.usageRole !== JOURNAL_MEDIA_USAGE_INLINE ||
      !isEligibleProcessedCoverCandidate(candidate)
    ) {
      continue;
    }
    return {
      mediaAssetId: candidate.mediaAssetId,
      source: "automatic_inline",
      mode: "automatic",
      derivativeKey: candidate.derivativeKey,
      altText: candidate.altText ?? null,
    };
  }

  return {
    mediaAssetId: null,
    source: "none",
    mode: "none",
    derivativeKey: null,
    altText: null,
  };
}

export function inferCoverModeFromAggregate(input: {
  explicitCoverMediaAssetId: string | null | undefined;
  candidatesById: ReadonlyMap<string, JournalCoverCandidate>;
}): JournalCoverMode {
  const explicitId = input.explicitCoverMediaAssetId ?? null;
  if (!explicitId) return "automatic";
  const candidate = input.candidatesById.get(explicitId);
  if (!candidate) return "automatic";
  if (candidate.usageRole === JOURNAL_MEDIA_USAGE_COVER_ONLY) return "separate";
  return "explicit_inline";
}
