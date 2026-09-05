import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { renderContractArtifacts } from "../../scripts/build-job-queue-contract";
import {
  assertMatchingQueueConsistency,
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
    expect(JOB_QUEUE_MANIFEST_VERSION).toBe("ove255.job-queue.v4");
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
      JOB_QUEUE_MANIFEST.filter(
        (entry) => entry.coversStructuredJournalCover,
      ).map((entry) => jobQueueManifestKey(entry)),
    ).toEqual([
      "matching:journal_entry_index",
      "matching:journal_entry_unindex",
      "erasure:erasure_media_object_delete",
      "media_lifecycle:media_staging_finalize",
      "media_lifecycle:media_derivative_revoke",
    ]);
  });

  it("keeps every generated artifact identical to what the manifest builds", async () => {
    // This replaced a substring search of the hand-written Python mirror. That
    // search asked whether a handful of strings appeared, so it passed for a
    // week while the mirror was missing three kinds and the release gate
    // refused every image. Regenerating and comparing byte for byte cannot
    // agree about a file it has not fully read.
    const { files } = renderContractArtifacts();
    expect(files).toHaveLength(2);

    for (const file of files) {
      const onDisk = await readFile(file.path, "utf8");
      expect(onDisk, path.relative(repoRoot, file.path)).toBe(file.contents);
    }
  });

  it("declares one enforced CHECK constraint per kind, and no migration is missing it", async () => {
    // The manifest claims each payload contract is enforced by Postgres. Until
    // now nothing checked that claim: four kinds named a contract that no
    // constraint enforced.
    const sqlDirectory = path.join(repoRoot, "apps/web/sql");
    const sql = (
      await Promise.all(
        (await readdir(sqlDirectory))
          .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
          .map((name) => readFile(path.join(sqlDirectory, name), "utf8")),
      )
    ).join("\n");

    const unenforced = JOB_QUEUE_MANIFEST.filter(
      (entry) =>
        !sql.includes(`add constraint ${entry.payloadConstraint} check`),
    ).map((entry) => jobQueueManifestKey(entry));

    expect(unenforced).toEqual([]);
  });

  it("agrees with itself about what the matching queue is", () => {
    // `matchingSupportedKinds()` filtered on the consumer while the Python
    // mirror filtered on the queue name. They matched by luck.
    expect(() => assertMatchingQueueConsistency()).not.toThrow();
    expect(matchingSupportedKinds().sort()).toEqual(
      JOB_QUEUE_MANIFEST.filter((entry) => entry.queueName === "matching")
        .map((entry) => entry.kind)
        .sort(),
    );
  });
});
