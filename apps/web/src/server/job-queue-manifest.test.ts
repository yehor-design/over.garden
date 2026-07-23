import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  JOB_QUEUE_MANIFEST,
  JOB_QUEUE_MANIFEST_VERSION,
  jobQueueManifestKey,
  matchingSupportedKinds,
} from "./job-queue-manifest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

describe("job queue manifest", () => {
  it("covers every matching, erasure, and media-lifecycle producer kind with attempt bounds", () => {
    expect(JOB_QUEUE_MANIFEST_VERSION).toBe("ove195.job-queue.v1");
    expect(matchingSupportedKinds()).toEqual([
      "catalog_alias_suggestions_refresh",
      "catalog_fuzzy_duplicate_qa_refresh",
      "catalog_match_suggestions_refresh",
      "catalog_typeahead_reindex",
      "journal_entry_index",
      "journal_entry_unindex",
    ]);
    for (const entry of JOB_QUEUE_MANIFEST) {
      expect(entry.maxAttempts).toBeGreaterThanOrEqual(1);
      expect(entry.maxAttempts).toBeLessThanOrEqual(32);
    }
    expect(
      JOB_QUEUE_MANIFEST.filter((entry) => entry.coversStructuredJournalCover).map(
        (entry) => jobQueueManifestKey(entry),
      ),
    ).toEqual([
      "matching:journal_entry_index",
      "matching:journal_entry_unindex",
      "erasure:erasure_media_object_delete",
      "media_lifecycle:media_derivative_revoke",
      "media_lifecycle:media_quarantine_expire",
    ]);
  });

  it("stays aligned with the Python matching manifest mirror", () => {
    const python = readFileSync(
      path.join(
        repoRoot,
        "services/matching/app/job_queue_manifest.py",
      ),
      "utf8",
    );
    expect(python).toContain(
      `JOB_QUEUE_MANIFEST_VERSION: Final = "${JOB_QUEUE_MANIFEST_VERSION}"`,
    );
    expect(python).toContain("MATCHING_DEFAULT_MAX_ATTEMPTS: Final = 8");
    expect(python).toContain("erasure_media_object_delete");
    expect(python).toContain("web-erasure-execution");
    expect(python).toContain("media_derivative_revoke");
    expect(python).toContain("media_quarantine_expire");
    expect(python).toContain("web-media-lifecycle");
    expect(python).toContain("matching-python-worker");
    expect(python).toContain("JOURNAL_ENTRY_INDEX_KIND");
    expect(python).toContain("JOURNAL_ENTRY_UNINDEX_KIND");
    expect(python).toContain("coversStructuredJournalCover\": True");
  });
});
