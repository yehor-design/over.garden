import "server-only";

import type { JournalCoverSource } from "@/lib/garden/journal-cover-contract";
import {
  blockCountBucket,
  journalDocumentHasFormatting,
  journalDocumentImageCount,
  photoCountBucket,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  recordAnalyticsEventSafely,
  type AnalyticsEventProperties,
} from "@/server/analytics-events";
import type { RequestScope } from "@/server/request-scope";

export interface ComposerLearningSignalInput {
  journalEntryId: string;
  plantObjectId?: string | null;
  spaceId?: string | null;
  document: JournalDocumentV1;
  coverSource: JournalCoverSource;
  priorCoverSource?: JournalCoverSource | null;
  priorBlockOrderHash?: string | null;
  nextBlockOrderHash: string;
  mutationOutcome?: AnalyticsEventProperties["mutation_outcome"];
  latencyBucket?: AnalyticsEventProperties["latency_bucket"];
}

/**
 * Emit bounded cover/reorder learning events only after a successful canonical
 * aggregate mutation. Replays and unchanged cover/order must not inflate counts.
 */
export async function recordComposerLearningSignalsSafely(
  scope: RequestScope,
  input: ComposerLearningSignalInput,
): Promise<void> {
  const shared: AnalyticsEventProperties = {
    photo_count_bucket: photoCountBucket(
      journalDocumentImageCount(input.document),
    ),
    block_count_bucket: blockCountBucket(input.document.blocks.length),
    has_formatting: journalDocumentHasFormatting(input.document),
    schema_version: "v1",
    mutation_outcome: input.mutationOutcome ?? "succeeded",
    latency_bucket: input.latencyBucket,
    cover_source: input.coverSource,
  };

  const coverChanged =
    input.priorCoverSource != null &&
    input.priorCoverSource !== input.coverSource;
  if (coverChanged || input.priorCoverSource == null) {
    // Measure cover only when prior is known and changed, or first observed write
    // after mutation with an explicit cover resolution.
    if (coverChanged) {
      await recordAnalyticsEventSafely(scope, {
        eventName: "journal_cover_changed",
        journalEntryId: input.journalEntryId,
        plantObjectId: input.plantObjectId,
        spaceId: input.spaceId,
        properties: shared,
      });
    }
  }

  if (
    input.priorBlockOrderHash != null &&
    input.priorBlockOrderHash !== input.nextBlockOrderHash
  ) {
    await recordAnalyticsEventSafely(scope, {
      eventName: "journal_blocks_reordered",
      journalEntryId: input.journalEntryId,
      plantObjectId: input.plantObjectId,
      spaceId: input.spaceId,
      properties: shared,
    });
  }
}

export function blockOrderHashFromDocument(
  document: JournalDocumentV1,
): string {
  return document.blocks.map((block) => block.id).join("|");
}
