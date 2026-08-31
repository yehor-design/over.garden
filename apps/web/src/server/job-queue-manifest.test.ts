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
    expect(JOB_QUEUE_MANIFEST_VERSION).toBe("ove255.job-queue.v4");
    expect(matchingSupportedKinds()).toEqual([
      "stable_registry_foundation_build",
      "stable_registry_extension_pack_build",
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

  it("stays aligned with the Python matching manifest mirror", () => {
    const python = readFileSync(
      path.join(repoRoot, "services/matching/app/job_queue_manifest.py"),
      "utf8",
    );
    expect(python).toContain(
      `JOB_QUEUE_MANIFEST_VERSION: Final = "${JOB_QUEUE_MANIFEST_VERSION}"`,
    );
    expect(python).toContain("MATCHING_DEFAULT_MAX_ATTEMPTS: Final = 8");
    expect(python).toContain("erasure_media_object_delete");
    expect(python).toContain("web-erasure-execution");
    expect(python).toContain("media_derivative_revoke");
    expect(python).toContain("media_staging_finalize");
    expect(python).toContain("web-media-lifecycle");
    expect(python).toContain("matching-python-worker");
    expect(python).toContain("JOURNAL_ENTRY_INDEX_KIND");
    expect(python).toContain("JOURNAL_ENTRY_UNINDEX_KIND");
    expect(python).toContain('coversStructuredJournalCover": True');
  });

  it("mirrors every per-kind payload contract in the Python manifest", () => {
    const python = readFileSync(
      path.join(repoRoot, "services/matching/app/job_queue_manifest.py"),
      "utf8",
    );
    const mirrored = parsePythonPayloadContracts(python);

    expect([...mirrored.keys()].sort()).toEqual(
      JOB_QUEUE_MANIFEST.map((entry) => jobQueueManifestKey(entry)).sort(),
    );

    for (const entry of JOB_QUEUE_MANIFEST) {
      const key = jobQueueManifestKey(entry);
      expect(mirrored.get(key), key).toEqual({
        requiredKeys: [...entry.payloadContract.requiredKeys],
        optionalKeys: [...entry.payloadContract.optionalKeys],
        uuidKeys: [...entry.payloadContract.uuidKeys],
      });
    }
  });
});

/**
 * Parses JOB_QUEUE_PAYLOAD_CONTRACTS out of the Python mirror. Parsing rather
 * than substring-matching keeps the drift check independent of ruff formatting
 * while still failing closed when either side declares a different key set.
 */
function parsePythonPayloadContracts(python: string) {
  const block =
    /JOB_QUEUE_PAYLOAD_CONTRACTS:\s*Final\s*=\s*\{([\s\S]*?)\n\}/.exec(python);
  expect(block, "JOB_QUEUE_PAYLOAD_CONTRACTS is missing").not.toBeNull();

  const entries = new Map<
    string,
    { requiredKeys: string[]; optionalKeys: string[]; uuidKeys: string[] }
  >();
  const entryPattern =
    /"([^"]+)":\s*\{\s*"requiredKeys":\s*\[([^\]]*)\],\s*"optionalKeys":\s*\[([^\]]*)\],\s*"uuidKeys":\s*\[([^\]]*)\],?\s*\}/g;

  for (const match of block![1].matchAll(entryPattern)) {
    entries.set(match[1], {
      requiredKeys: pythonStringList(match[2]),
      optionalKeys: pythonStringList(match[3]),
      uuidKeys: pythonStringList(match[4]),
    });
  }

  return entries;
}

function pythonStringList(source: string): string[] {
  return [...source.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}
