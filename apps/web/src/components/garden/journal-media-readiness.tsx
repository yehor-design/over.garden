"use client";

import type { StructuredJournalComposerLabels } from "@/components/garden/structured-journal-composer";
import type { JournalImageUiState } from "@/components/garden/lexical-journal/journal-lexical-image-node";
import { cn } from "@/lib/utils";

export interface JournalMediaReadinessSummary {
  total: number;
  ready: number;
  preparing: number;
  /** Positions (1-based, reading order) of the photographs that failed. */
  failedPositions: number[];
  /** The failed photographs' media asset ids, in the same order. */
  failedMediaAssetIds: string[];
  /** Whether any photograph was staged in this session rather than published. */
  staged: boolean;
}

/**
 * Every photograph an entry will publish, at once (`OVE-487` criterion 2):
 * how many are ready, how many Publish will wait for, and which ones must be
 * retried or removed first. A photograph with no state yet is still being
 * prepared.
 */
export function summarizeJournalMediaReadiness(
  mediaAssetIds: readonly string[],
  states: ReadonlyMap<string, Pick<JournalImageUiState, "status" | "source">>,
): JournalMediaReadinessSummary {
  const summary: JournalMediaReadinessSummary = {
    total: mediaAssetIds.length,
    ready: 0,
    preparing: 0,
    failedPositions: [],
    failedMediaAssetIds: [],
    staged: false,
  };
  mediaAssetIds.forEach((mediaAssetId, index) => {
    const state = states.get(mediaAssetId);
    if (state?.source !== "existing") summary.staged = true;
    if (state?.status === "ready") summary.ready += 1;
    else if (state?.status === "failed") {
      summary.failedPositions.push(index + 1);
      summary.failedMediaAssetIds.push(mediaAssetId);
    } else summary.preparing += 1;
  });
  return summary;
}

/** The line itself; says nothing when an entry has no photograph to wait for. */
export function journalMediaReadinessText(
  summary: JournalMediaReadinessSummary,
  labels: Pick<StructuredJournalComposerLabels, "readiness" | "imageName">,
): string | null {
  if (summary.total === 0) return null;
  if (summary.failedPositions.length > 0) {
    const photos = summary.failedPositions
      .map((position) =>
        labels.imageName.replaceAll("{index}", String(position)),
      )
      .join(", ");
    return labels.readiness.failed.replaceAll("{photos}", photos);
  }
  if (summary.preparing > 0) {
    return labels.readiness.preparing
      .replaceAll("{ready}", String(summary.ready))
      .replaceAll("{total}", String(summary.total));
  }
  // Every photograph of an entry being edited is already published; there is
  // nothing to be ready for.
  if (!summary.staged) return null;
  return labels.readiness.ready.replaceAll("{total}", String(summary.total));
}

export function JournalMediaReadiness({
  summary,
  labels,
  className,
}: {
  summary: JournalMediaReadinessSummary;
  labels: Pick<StructuredJournalComposerLabels, "readiness" | "imageName">;
  className?: string;
}) {
  const text = journalMediaReadinessText(summary, labels);
  const failed = summary.failedPositions.length > 0;
  return (
    <p
      role="status"
      aria-live="polite"
      data-journal-media-readiness={
        text === null
          ? "none"
          : failed
            ? "failed"
            : summary.preparing > 0
              ? "preparing"
              : "ready"
      }
      className={cn(
        "text-body-sm",
        failed ? "text-danger-text" : "text-text-muted",
        text === null && "sr-only",
        className,
      )}
    >
      {text}
    </p>
  );
}
