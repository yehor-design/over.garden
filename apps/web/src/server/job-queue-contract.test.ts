import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  formatJobQueuePayloadViolation,
  JOB_QUEUE_MANIFEST,
  JobQueuePayloadContractError,
  jobQueueManifestKey,
  payloadContractFor,
  validateJobQueuePayload,
} from "./job-queue-manifest";

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
    "matching:stable_registry_foundation_build",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "STABLE_REGISTRY_FOUNDATION_BUILD_KIND",
      testedBy: "services/matching/tests/test_worker.py",
    },
  ],
  [
    "media_lifecycle:media_staging_finalize",
    {
      consumer: "apps/web/src/server/media/media-lifecycle-consumer.ts",
      consumerToken: "MEDIA_STAGING_FINALIZE_KIND",
      testedBy: "apps/web/src/server/media/media-lifecycle-consumer.test.ts",
    },
  ],
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
    "matching:catalog_fuzzy_duplicate_qa_refresh",
    {
      consumer: "services/matching/app/worker.py",
      consumerToken: "CATALOG_FUZZY_DUPLICATE_QA_REFRESH_KIND",
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
  [
    "erasure:erasure_media_object_delete",
    {
      consumer: "apps/web/src/server/erasure-execution.ts",
      consumerToken: "ERASURE_MEDIA_DELETE_KIND",
      testedBy: "apps/web/src/server/erasure-execution.test.ts",
    },
  ],
  [
    "media_lifecycle:media_derivative_revoke",
    {
      consumer: "apps/web/src/server/media/media-lifecycle-consumer.ts",
      consumerToken: "MEDIA_DERIVATIVE_REVOKE_KIND",
      testedBy: "apps/web/src/server/media/media-lifecycle-consumer.test.ts",
    },
  ],
]);

describe("job queue producer/consumer contract", () => {
  it("keeps the shared OVE-195 manifest aligned with tested consumers", () => {
    for (const entry of JOB_QUEUE_MANIFEST) {
      expect(consumedJobContracts.has(jobQueueManifestKey(entry))).toBe(true);
      expect(entry.maxAttempts).toBeGreaterThanOrEqual(1);
    }
    expect([...consumedJobContracts.keys()].sort()).toEqual(
      [...JOB_QUEUE_MANIFEST.map((entry) => jobQueueManifestKey(entry))].sort(),
    );
  });

  it("keeps every app-enqueued job kind tied to a tested consumer", () => {
    const producers = findAppJobProducers();
    const unsupported = producers.filter(
      (producer) =>
        !consumedJobContracts.has(`${producer.queueName}:${producer.kind}`),
    );

    expect(unsupported).toEqual([]);
    expect(producers).toEqual([
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
        source: "server/catalog-source/entity-resolution-qa-repository.ts",
        queueName: "matching",
        kind: "catalog_fuzzy_duplicate_qa_refresh",
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
        queueName: "erasure",
        kind: "erasure_media_object_delete",
      },
      {
        source: "server/media/media-lifecycle-enqueue.ts",
        queueName: "media_lifecycle",
        kind: "media_derivative_revoke",
      },
      {
        source: "server/media/media-lifecycle-enqueue.ts",
        queueName: "media_lifecycle",
        kind: "media_staging_finalize",
      },
      {
        source: "server/search/public-journal-parity.ts",
        queueName: "matching",
        kind: "journal_entry_index",
      },
      {
        source: "server/search/public-journal-parity.ts",
        queueName: "matching",
        kind: "journal_entry_unindex",
      },
      {
        source: "server/stable-registry/release-repository.ts",
        queueName: "matching",
        kind: "stable_registry_foundation_build",
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

const ENTRY_ID = "9f9a1f0c-0f1a-4a2b-8c3d-4e5f60718293";
const OWNER_ID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";

function journalPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "journal_entry_index",
    journalEntryId: ENTRY_ID,
    userId: OWNER_ID,
    ...overrides,
  };
}

describe("OVE-234 queue payload cannot carry precise location", () => {
  it("refuses free text alongside the declared identifiers-only shape", () => {
    // A coordinate can only reach the queue through an undeclared key or a
    // non-uuid value; both are already contract violations, and neither the
    // violation nor this assertion echoes the rejected text.
    for (const payload of [
      journalPayload({ note: "50.45010,30.52340" }),
      journalPayload({ userId: "50.45010,30.52340" }),
    ]) {
      const violation = validateJobQueuePayload("matching", payload);
      expect(violation).not.toBeNull();
      expect(JSON.stringify(violation)).not.toContain("50.45010");
    }
  });

  it("declares no free-text payload key on any kind", () => {
    // Free-text keys are the only way user prose — and therefore a
    // coordinate — could reach a queue row or a Python consumer.
    const FREE_TEXT_KEY = /(note|text|body|title|label|comment|query|message)/i;

    for (const entry of JOB_QUEUE_MANIFEST) {
      const declared = [
        ...entry.payloadContract.requiredKeys,
        ...entry.payloadContract.optionalKeys,
      ].filter((key) => key !== "kind");

      for (const key of declared) {
        expect(
          FREE_TEXT_KEY.test(key),
          `${jobQueueManifestKey(entry)}:${key}`,
        ).toBe(false);
      }
    }
  });
});

describe("OVE-225 payload contract", () => {
  it("declares a machine-checkable contract for every manifest kind", () => {
    for (const entry of JOB_QUEUE_MANIFEST) {
      const contract = entry.payloadContract;
      expect(contract.requiredKeys, jobQueueManifestKey(entry)).toContain(
        "kind",
      );
      expect(new Set(contract.requiredKeys).size).toBe(
        contract.requiredKeys.length,
      );
      const declared = new Set([
        ...contract.requiredKeys,
        ...contract.optionalKeys,
      ]);
      for (const uuidKey of contract.uuidKeys) {
        expect(declared.has(uuidKey), uuidKey).toBe(true);
      }
      for (const optional of contract.optionalKeys) {
        expect(contract.requiredKeys).not.toContain(optional);
      }
    }
  });

  it("accepts the exact declared shape for both journal kinds", () => {
    expect(validateJobQueuePayload("matching", journalPayload())).toBeNull();
    expect(
      validateJobQueuePayload(
        "matching",
        journalPayload({ kind: "journal_entry_unindex" }),
      ),
    ).toBeNull();
  });

  it("refuses an extra key without echoing its name or value", () => {
    for (const extra of [
      { title: "private journal title" },
      { body: "private journal body" },
      { email: "someone@example.com" },
      { mediaUrl: "https://media.example/quarantine/original.jpg" },
      { latitude: "50.4501" },
    ]) {
      const violation = validateJobQueuePayload(
        "matching",
        journalPayload(extra),
      );
      expect(violation?.ruleClass).toBe("unexpected_key");
      expect(violation?.key).toBeNull();

      const message = formatJobQueuePayloadViolation(violation!);
      for (const [key, value] of Object.entries(extra)) {
        expect(message).not.toContain(key);
        expect(message).not.toContain(value);
      }
      expect(message).toContain("unexpected_key");
    }
  });

  it("refuses a missing key, a wrong type, a blank value, and a non-UUID id", () => {
    const missing = journalPayload();
    delete (missing as Record<string, unknown>).userId;
    expect(validateJobQueuePayload("matching", missing)).toMatchObject({
      ruleClass: "missing_required_key",
      key: "userId",
    });

    expect(
      validateJobQueuePayload("matching", journalPayload({ userId: 42 })),
    ).toMatchObject({ ruleClass: "non_string_value", key: "userId" });

    expect(
      validateJobQueuePayload("matching", journalPayload({ userId: "  " })),
    ).toMatchObject({ ruleClass: "non_string_value", key: "userId" });

    expect(
      validateJobQueuePayload(
        "matching",
        journalPayload({ journalEntryId: "entry-id" }),
      ),
    ).toMatchObject({ ruleClass: "non_uuid_value", key: "journalEntryId" });
  });

  it("refuses a non-object payload and an undeclared kind without echoing it", () => {
    for (const payload of [null, "kind", 7, [journalPayload()]]) {
      expect(validateJobQueuePayload("matching", payload)?.ruleClass).toBe(
        "payload_not_object",
      );
    }

    const violation = validateJobQueuePayload("matching", {
      kind: "journal_entry_index_but_not_really",
      secret: "do-not-leak",
    });
    expect(violation?.ruleClass).toBe("unknown_kind");
    expect(violation?.kind).toBeNull();
    expect(formatJobQueuePayloadViolation(violation!)).not.toContain(
      "do-not-leak",
    );
  });

  it("scopes a contract to its own queue name", () => {
    expect(
      payloadContractFor("matching", "media_derivative_revoke"),
    ).toBeNull();
    expect(
      validateJobQueuePayload("erasure", journalPayload())?.ruleClass,
    ).toBe("unknown_kind");
  });

  it("honours declared optional keys", () => {
    const revoke = {
      kind: "media_derivative_revoke",
      mediaAssetId: ENTRY_ID,
      bucket: "public",
      objectKey: "derivatives/a.jpg",
      reason: "archived",
    };
    expect(validateJobQueuePayload("media_lifecycle", revoke)).toBeNull();
    expect(
      validateJobQueuePayload("media_lifecycle", {
        ...revoke,
        journalEntryId: ENTRY_ID,
      }),
    ).toBeNull();
    expect(
      validateJobQueuePayload("media_lifecycle", {
        ...revoke,
        journalEntryId: "not-a-uuid",
      })?.ruleClass,
    ).toBe("non_uuid_value");
  });

  it("carries the rule class on the producer error without a payload value", () => {
    const violation = validateJobQueuePayload(
      "matching",
      journalPayload({ body: "private journal body" }),
    );
    const error = new JobQueuePayloadContractError(violation!);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("JobQueuePayloadContractError");
    expect(error.violation.ruleClass).toBe("unexpected_key");
    expect(error.message).not.toContain("private journal body");
    expect(error.message).toContain("matching:journal_entry_index");
  });

  it("keeps the storage constraints aligned with the manifest, added not valid", () => {
    const migration = readFileSync(
      path.join(
        repoRoot,
        "apps/web/sql/0010_ove225_job_queue_payload_contract.sql",
      ),
      "utf8",
    );

    for (const kind of ["journal_entry_index", "journal_entry_unindex"]) {
      const constraint = `job_queue_${kind}_payload_check`;
      expect(migration).toContain(`add constraint ${constraint} check (`);
      // job_queue retains done/failed/dead rows, so history must not block it.
      expect(
        new RegExp(`add constraint ${constraint}[\\s\\S]*?\\) not valid;`).test(
          migration,
        ),
        constraint,
      ).toBe(true);

      const contract = payloadContractFor("matching", kind);
      const keyArray = `array[${contract!.requiredKeys
        .map((key) => `'${key}'`)
        .join(", ")}]::text[]`;
      expect(migration).toContain(`payload ?& ${keyArray}`);
      expect(migration).toContain(`payload - ${keyArray} = '{}'::jsonb`);
      for (const uuidKey of contract!.uuidKeys) {
        expect(migration).toContain(`payload->>'${uuidKey}' ~*`);
      }
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
