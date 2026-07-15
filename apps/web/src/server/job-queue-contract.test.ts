import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface JobProducer {
  source: string;
  queueName: string;
  kind: string;
}

const srcRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = path.resolve(srcRoot, "../../..");
const consumedJobContracts = new Map<
  string,
  { consumer: string; consumerToken: string; testedBy: string }
>([
  [
    "matching:catalog_alias_suggestions_refresh",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND",
      testedBy: "services/matching/tests/test_worker.py",
    },
  ],
  [
    "matching:catalog_match_suggestions_refresh",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "CATALOG_MATCH_SUGGESTIONS_REFRESH_KIND",
      testedBy: "services/matching/tests/test_worker.py",
    },
  ],
  [
    "matching:catalog_typeahead_reindex",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "CATALOG_TYPEAHEAD_REINDEX_KIND",
      testedBy: "services/matching/tests/test_worker.py",
    },
  ],
  [
    "matching:journal_entry_index",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "JOURNAL_ENTRY_INDEX_KIND",
      testedBy: "services/matching/tests/test_worker.py",
    },
  ],
  [
    "matching:journal_entry_unindex",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "JOURNAL_ENTRY_UNINDEX_KIND",
      testedBy: "services/matching/tests/test_worker.py",
    },
  ],
]);

describe("job queue producer/consumer contract", () => {
  it("keeps every app-enqueued job kind tied to a tested consumer", () => {
    const producers = findAppJobProducers();
    const unsupported = producers.filter(
      (producer) =>
        !consumedJobContracts.has(`${producer.queueName}:${producer.kind}`),
    );

    expect(unsupported).toEqual([]);
    expect(producers).toEqual([
      {
        source: "app/api/skeleton/journal/route.ts",
        queueName: "matching",
        kind: "journal_entry_index",
      },
      {
        source: "app/garden/objects/[objectId]/actions.ts",
        queueName: "matching",
        kind: "journal_entry_index",
      },
      {
        source: "app/garden/objects/[objectId]/actions.ts",
        queueName: "matching",
        kind: "journal_entry_unindex",
      },
      {
        source: "app/skeleton/actions.ts",
        queueName: "matching",
        kind: "journal_entry_index",
      },
      {
        source: "server/catalog-alias-curation-repository.ts",
        queueName: "matching",
        kind: "catalog_alias_suggestions_refresh",
      },
      {
        source: "server/catalog-repository.ts",
        queueName: "matching",
        kind: "catalog_match_suggestions_refresh",
      },
      {
        source: "server/catalog-repository.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/bg-official-variety-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/breed-seed-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source:
          "server/catalog-source/eu-official-journal-common-catalogue-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/genebank-long-tail-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/sample-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/sample-refresh.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/species-backbone-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/catalog-source/ua-state-register-import.ts",
        queueName: "matching",
        kind: "catalog_typeahead_reindex",
      },
      {
        source: "server/erasure-execution.ts",
        queueName: "matching",
        kind: "journal_entry_unindex",
      },
    ]);
  });

  it("keeps each supported job kind present in the worker and worker tests", () => {
    for (const [contractKey, contract] of consumedJobContracts) {
      const kind = contractKey.split(":")[1];
      const consumerPath = path.join(repoRoot, contract.consumer);
      const testPath = path.join(repoRoot, contract.testedBy);

      expect(existsSync(consumerPath), contract.consumer).toBe(true);
      expect(existsSync(testPath), contract.testedBy).toBe(true);
      expect(readFileSync(consumerPath, "utf8")).toContain(
        contract.consumerToken,
      );
      expect(readFileSync(testPath, "utf8")).toContain(kind);
    }
  });
});

function findAppJobProducers(): JobProducer[] {
  return sourceFiles(srcRoot)
    .flatMap((sourcePath) =>
      extractJobProducers(
        relativeSourcePath(sourcePath),
        readFileSync(sourcePath, "utf8"),
      ),
    )
    .sort((a, b) =>
      [a.source, a.queueName, a.kind]
        .join(":")
        .localeCompare([b.source, b.queueName, b.kind].join(":")),
    );
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
    if (relativeSourcePath(fullPath) === "db/generated.ts") return [];
    if (relativeSourcePath(fullPath) === "server/queue.ts") return [];
    return [fullPath];
  });
}

function relativeSourcePath(sourcePath: string) {
  return path.relative(srcRoot, sourcePath).split(path.sep).join("/");
}

function extractJobProducers(source: string, contents: string): JobProducer[] {
  if (
    !contents.includes("enqueueJob(") &&
    !contents.includes('insertInto("job_queue")') &&
    !contents.includes("insertInto('job_queue')")
  ) {
    return [];
  }

  const constants = stringConstants(contents);
  return [
    ...extractEnqueueJobCallProducers(source, contents, constants),
    ...extractKyselyJobQueueProducers(source, contents, constants),
  ];
}

function extractEnqueueJobCallProducers(
  source: string,
  contents: string,
  constants: Map<string, string>,
): JobProducer[] {
  const producers: JobProducer[] = [];
  const calls = /enqueueJob\(\s*([^,\n]+),\s*\{([\s\S]*?)\}\s*,/g;

  for (const match of contents.matchAll(calls)) {
    const queueName = resolveValue(match[1], constants);
    const kind = resolveValue(
      match[2].match(/kind:\s*([^,\n}]+)/)?.[1],
      constants,
    );
    if (queueName && kind) producers.push({ source, queueName, kind });
  }

  return producers;
}

function extractKyselyJobQueueProducers(
  source: string,
  contents: string,
  constants: Map<string, string>,
): JobProducer[] {
  const producers: JobProducer[] = [];
  const inserts = /insertInto\(["']job_queue["']\)/g;

  for (const match of contents.matchAll(inserts)) {
    const insertIndex = match.index ?? 0;
    const following = contents.slice(insertIndex, insertIndex + 900);
    const preceding = contents.slice(
      Math.max(0, insertIndex - 700),
      insertIndex,
    );
    const queueName = resolveValue(
      following.match(/queue_name:\s*([^,\n}]+)/)?.[1],
      constants,
    );
    const payloadKindMatches = [
      ...preceding.matchAll(
        /const\s+payload\s*=\s*\{[\s\S]*?kind:\s*([^,\n}]+)/g,
      ),
    ];
    const kind = resolveValue(payloadKindMatches.at(-1)?.[1], constants);

    if (queueName && kind) producers.push({ source, queueName, kind });
  }

  return producers;
}

function stringConstants(contents: string) {
  const constants = new Map<string, string>();
  const constantMatches = /const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"/g;

  for (const match of contents.matchAll(constantMatches)) {
    constants.set(match[1], match[2]);
  }

  return constants;
}

function resolveValue(
  value: string | undefined,
  constants: Map<string, string>,
) {
  const trimmed = value?.trim().replace(/;$/, "");
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return constants.get(trimmed) ?? null;
}
