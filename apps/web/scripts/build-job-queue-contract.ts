/**
 * Builds every downstream copy of the job queue contract from the one place
 * that declares it.
 *
 * The contract used to live in four hand-written copies: this manifest, a
 * Python mirror kept in step by a test that searched it for a handful of
 * substrings, the release workflow, and the production release script. On
 * 2026-08-28 the manifest grew `stable_registry_foundation_build` and the
 * copies did not, so the matching image release refused seventy-six correct
 * builds in a row while every test stayed green.
 *
 * Now the manifest is the builder. `pnpm queue:contract:build` writes the JSON
 * contract and the Python module; `pnpm queue:contract:check` regenerates them
 * in memory and fails when what is on disk differs — the same shape as
 * `db:types` and `db:types:check`, which is why `job_queue_contract.py` carries
 * the same "do not edit" header as `src/db/generated.ts`.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertMatchingQueueConsistency,
  JOB_QUEUE_MANIFEST,
  JOB_QUEUE_MANIFEST_VERSION,
  MATCHING_DEFAULT_MAX_ATTEMPTS,
  MATCHING_QUEUE_NAME,
  TERMINAL_ERROR_CODES,
  jobQueueManifestKey,
  matchingSupportedKinds,
  type JobQueueManifestEntry,
} from "../src/server/job-queue-manifest";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, "../..");

export const JOB_QUEUE_CONTRACT_SCHEMA = "overgarden.jobQueueContract.v1";

export const CONTRACT_JSON_PATH = path.join(
  REPOSITORY_ROOT,
  "contracts/job-queue/job-queue.contract.v1.json",
);
export const CONTRACT_PYTHON_PATH = path.join(
  REPOSITORY_ROOT,
  "services/matching/app/job_queue_contract.py",
);

/** `stable_registry_foundation_build` -> `STABLE_REGISTRY_FOUNDATION_BUILD_KIND`. */
export function pythonKindConstant(kind: string): string {
  return `${kind.toUpperCase()}_KIND`;
}

export function buildContractDocument() {
  assertMatchingQueueConsistency();
  const entries = [...JOB_QUEUE_MANIFEST].map((entry) => ({
    queueName: entry.queueName,
    kind: entry.kind,
    consumer: entry.consumer,
    maxAttempts: entry.maxAttempts,
    privacyClass: entry.privacyClass,
    coversStructuredJournalCover: entry.coversStructuredJournalCover,
    payloadContract: {
      requiredKeys: [...entry.payloadContract.requiredKeys],
      optionalKeys: [...entry.payloadContract.optionalKeys],
      uuidKeys: [...entry.payloadContract.uuidKeys],
    },
    payloadConstraint: entry.payloadConstraint,
    notes: entry.notes,
  }));

  assertEveryKindIsDeclaredOnce(entries);

  return {
    schema: JOB_QUEUE_CONTRACT_SCHEMA,
    manifestVersion: JOB_QUEUE_MANIFEST_VERSION,
    matchingQueueName: MATCHING_QUEUE_NAME,
    matchingDefaultMaxAttempts: MATCHING_DEFAULT_MAX_ATTEMPTS,
    terminalErrorCodes: [...TERMINAL_ERROR_CODES],
    supportedMatchingKinds: [...matchingSupportedKinds()].sort(),
    entries,
  };
}

function assertEveryKindIsDeclaredOnce(
  entries: ReturnType<typeof buildContractDocument>["entries"],
): void {
  const keys = entries.map((entry) =>
    jobQueueManifestKey(entry as unknown as JobQueueManifestEntry),
  );
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Job queue manifest declares ${duplicates[0]} twice.`);
  }
  const constraints = entries.map((entry) => entry.payloadConstraint);
  const clashing = constraints.filter(
    (name, index) => constraints.indexOf(name) !== index,
  );
  if (clashing.length > 0) {
    throw new Error(`Two kinds share the CHECK constraint ${clashing[0]}.`);
  }
  for (const name of constraints) {
    if (!/^job_queue_[a-z0-9_]+_payload_check$/u.test(name)) {
      throw new Error(
        `Payload constraint ${name} is not conventionally named.`,
      );
    }
    if (name.length > 63) {
      throw new Error(`Payload constraint ${name} exceeds the Postgres limit.`);
    }
  }
}

function renderJson(
  document: ReturnType<typeof buildContractDocument>,
): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function pythonString(value: string): string {
  return JSON.stringify(value);
}

function pythonTuple(values: readonly string[], indent: string): string {
  if (values.length === 0) return "()";
  const body = values
    .map((value) => `${indent}    ${pythonString(value)},`)
    .join("\n");
  return `(\n${body}\n${indent})`;
}

function renderPython(
  document: ReturnType<typeof buildContractDocument>,
): string {
  const kindConstants = document.entries
    .map(
      (entry) =>
        `${pythonKindConstant(entry.kind)}: Final = ${pythonString(entry.kind)}`,
    )
    .join("\n");

  const renderEntry = (
    entry: (typeof document.entries)[number],
    indent: string,
  ) =>
    [
      `${indent}{`,
      `${indent}    "queueName": ${pythonString(entry.queueName)},`,
      `${indent}    "kind": ${pythonKindConstant(entry.kind)},`,
      `${indent}    "consumer": ${pythonString(entry.consumer)},`,
      `${indent}    "maxAttempts": ${entry.maxAttempts},`,
      `${indent}    "privacyClass": ${pythonString(entry.privacyClass)},`,
      `${indent}    "coversStructuredJournalCover": ${
        entry.coversStructuredJournalCover ? "True" : "False"
      },`,
      `${indent}    "payloadConstraint": ${pythonString(entry.payloadConstraint)},`,
      `${indent}},`,
    ].join("\n");

  const matchingEntries = document.entries.filter(
    (entry) => entry.queueName === document.matchingQueueName,
  );
  const webOwnedEntries = document.entries.filter(
    (entry) => entry.queueName !== document.matchingQueueName,
  );

  const payloadContracts = document.entries
    .map((entry) =>
      [
        `    "${entry.queueName}:${entry.kind}": {`,
        `        "requiredKeys": [${entry.payloadContract.requiredKeys.map(pythonString).join(", ")}],`,
        `        "optionalKeys": [${entry.payloadContract.optionalKeys.map(pythonString).join(", ")}],`,
        `        "uuidKeys": [${entry.payloadContract.uuidKeys.map(pythonString).join(", ")}],`,
        `    },`,
      ].join("\n"),
    )
    .join("\n");

  return `"""Generated from apps/web/src/server/job-queue-manifest.ts. Do not edit.

Regenerate with \`pnpm queue:contract:build\` from apps/web; \`pnpm
queue:contract:check\` fails when this file and the manifest disagree. Editing
it by hand recreates the drift that refused seventy-six correct matching image
releases between 2026-08-28 and 2026-09-04.
"""

from __future__ import annotations

from typing import Final

JOB_QUEUE_CONTRACT_SCHEMA: Final = ${pythonString(document.schema)}
JOB_QUEUE_MANIFEST_VERSION: Final = ${pythonString(document.manifestVersion)}
MATCHING_QUEUE_NAME: Final = ${pythonString(document.matchingQueueName)}
MATCHING_DEFAULT_MAX_ATTEMPTS: Final = ${document.matchingDefaultMaxAttempts}
TERMINAL_ERROR_CODES: Final = ${pythonTuple(document.terminalErrorCodes, "")}

${kindConstants}

MATCHING_MANIFEST_ENTRIES: Final = (
${matchingEntries.map((entry) => renderEntry(entry, "    ")).join("\n")}
)

WEB_OWNED_MANIFEST_ENTRIES: Final = (
${webOwnedEntries.map((entry) => renderEntry(entry, "    ")).join("\n")}
)

JOB_QUEUE_MANIFEST: Final = MATCHING_MANIFEST_ENTRIES + WEB_OWNED_MANIFEST_ENTRIES

JOB_QUEUE_PAYLOAD_CONTRACTS: Final = {
${payloadContracts}
}

SUPPORTED_JOB_KINDS: Final = ${pythonTuple(document.supportedMatchingKinds, "")}

REQUIRED_JOB_QUEUE_PAYLOAD_CONSTRAINTS: Final = ${pythonTuple(
    [...document.entries.map((entry) => entry.payloadConstraint)].sort(),
    "",
  )}
`;
}

export function renderContractArtifacts() {
  const document = buildContractDocument();
  return {
    document,
    files: [
      { path: CONTRACT_JSON_PATH, contents: renderJson(document) },
      { path: CONTRACT_PYTHON_PATH, contents: renderPython(document) },
    ],
  };
}

async function main() {
  const check = process.argv.includes("--check");
  const { files } = renderContractArtifacts();
  const stale: string[] = [];

  for (const file of files) {
    if (check) {
      const current = await readFile(file.path, "utf8").catch(() => null);
      if (current !== file.contents) {
        stale.push(path.relative(REPOSITORY_ROOT, file.path));
      }
      continue;
    }
    await mkdir(path.dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents, "utf8");
  }

  if (check && stale.length > 0) {
    console.error(
      `The job queue contract is stale in ${stale.length} file(s):\n${stale
        .map((name) => `  ${name}`)
        .join("\n")}\nRun \`pnpm queue:contract:build\` and commit the result.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    check
      ? "job queue contract: generated artifacts match the manifest"
      : `job queue contract: wrote ${files.length} generated artifacts`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
