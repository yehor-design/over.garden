import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { open, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EPPO_SOURCE_CONTRACT_CONCURRENCY,
  EPPO_SOURCE_CONTRACT_MAX_ATTEMPTS,
  EPPO_SOURCE_CONTRACT_TIMEOUT_MAX_MS,
  eppoSourceContractFailureCode,
  inspectEppoSourceContract,
  type EppoSourceContractOptions,
  type EppoSourceContractReceipt,
} from "../src/server/catalog-source/eppo-source-contract";
import { resolveEppoCredential } from "../src/server/catalog-source/eppo-credentials";

const LOCK_PATH = path.join(
  os.tmpdir(),
  "overgarden-eppo-source-contract.lock",
);

export type EppoSourceContractCliArguments = EppoSourceContractOptions & {
  mode: "fixture" | "live-contract";
};

class EppoSourceContractCliError extends Error {
  constructor(
    readonly code:
      | "invalid_arguments"
      | "baseline_unavailable"
      | "decision_already_running",
  ) {
    super(`EPPO source contract CLI failed: ${code}`);
    this.name = "EppoSourceContractCliError";
  }
}

function cliFail(code: EppoSourceContractCliError["code"]): never {
  throw new EppoSourceContractCliError(code);
}

function parsePositiveInteger(value: string | undefined): number {
  if (!value || !/^\d+$/u.test(value)) cliFail("invalid_arguments");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    cliFail("invalid_arguments");
  }
  return parsed;
}

/** Strict parser intentionally rejects flags that could expand source scope. */
export function parseEppoSourceContractCliArguments(
  supplied: string[],
): EppoSourceContractCliArguments {
  const args = supplied[0] === "--" ? supplied.slice(1) : supplied;
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !["--mode", "--timeout-ms", "--max-attempts", "--concurrency"].includes(
        name ?? "",
      ) ||
      values.has(name ?? "") ||
      value?.startsWith("--")
    ) {
      cliFail("invalid_arguments");
    }
    values.set(name!, value!);
  }

  const mode = values.get("--mode") ?? "fixture";
  if (mode !== "fixture" && mode !== "live-contract") {
    cliFail("invalid_arguments");
  }
  const timeoutMs = parsePositiveInteger(
    values.get("--timeout-ms") ?? String(EPPO_SOURCE_CONTRACT_TIMEOUT_MAX_MS),
  );
  const maxAttempts = parsePositiveInteger(
    values.get("--max-attempts") ?? String(EPPO_SOURCE_CONTRACT_MAX_ATTEMPTS),
  );
  const concurrency = parsePositiveInteger(
    values.get("--concurrency") ?? String(EPPO_SOURCE_CONTRACT_CONCURRENCY),
  );

  if (
    timeoutMs > EPPO_SOURCE_CONTRACT_TIMEOUT_MAX_MS ||
    maxAttempts > EPPO_SOURCE_CONTRACT_MAX_ATTEMPTS ||
    concurrency !== EPPO_SOURCE_CONTRACT_CONCURRENCY
  ) {
    cliFail("invalid_arguments");
  }

  return { mode, timeoutMs, maxAttempts, concurrency };
}

export function currentBaselineSha(
  run = (command: string, args: string[]) =>
    execFileSync(command, args, { encoding: "utf8" }),
): string {
  const value = run("git", ["merge-base", "HEAD", "origin/main"]).trim();
  if (!/^[a-f0-9]{40}$/u.test(value)) cliFail("baseline_unavailable");
  return value;
}

async function withDecisionLock<T>(work: () => Promise<T>): Promise<T> {
  const lockToken = randomUUID();
  let handle;
  try {
    // A stale lock deliberately fails closed. Automatically unlinking it races
    // with a new process acquiring the lock and could permit two provider runs.
    // An operator may remove it only after confirming no verifier is running.
    handle = await open(LOCK_PATH, "wx");
    await handle.writeFile(lockToken, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      cliFail("decision_already_running");
    }
    throw error;
  }

  try {
    return await work();
  } finally {
    await handle.close();
    try {
      if ((await readFile(LOCK_PATH, "utf8")) === lockToken) {
        await unlink(LOCK_PATH);
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function fixtureReceipt(baselineSha: string): EppoSourceContractReceipt {
  const terminalState = "blocked_manifest" as const;
  return {
    class: "contract_decision",
    baselineSha,
    decisionId: createHash("sha256")
      .update(`fixture:${baselineSha}:${terminalState}`, "utf8")
      .digest("hex"),
    terminalState,
    sourceClasses: {
      taxon_list: "not_checked",
      taxon_overview: "not_checked",
      taxon_names: "not_checked",
      taxon_taxonomy: "not_checked",
    },
    releaseIdentity: "missing_official_versioned_checksum_manifest",
    closureMethod: "not_authorized_without_official_release_manifest",
    rightsEvidence: "unavailable",
    missingAuthority: "fixture does not contact an official authority",
    attempts: 0,
    concurrency: 1,
    durationMs: 0,
    cleanup: "completed",
  };
}

export async function runEppoSourceContractCli(
  args: EppoSourceContractCliArguments,
  dependencies: {
    baselineSha?: () => string;
    inspect?: (
      credential: string,
      options: EppoSourceContractOptions,
      dependencies: { baselineSha: string; signal: AbortSignal },
    ) => Promise<EppoSourceContractReceipt>;
    credential?: () => string;
  } = {},
): Promise<EppoSourceContractReceipt> {
  const baselineSha = (dependencies.baselineSha ?? currentBaselineSha)();
  if (args.mode === "fixture") return fixtureReceipt(baselineSha);

  const cancellation = new AbortController();
  const onInterrupt = () => cancellation.abort();
  process.once("SIGINT", onInterrupt);
  try {
    return await withDecisionLock(() =>
      (dependencies.inspect ?? inspectEppoSourceContract)(
        (dependencies.credential ?? resolveEppoCredential)(),
        args,
        { baselineSha, signal: cancellation.signal },
      ),
    );
  } finally {
    process.removeListener("SIGINT", onInterrupt);
  }
}

async function runCli() {
  const result = await runEppoSourceContractCli(
    parseEppoSourceContractCliArguments(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli().catch((error: unknown) => {
    const code =
      error instanceof EppoSourceContractCliError
        ? error.code
        : eppoSourceContractFailureCode(error);
    process.stderr.write(`eppo_source_contract=failed code=${code}\n`);
    process.exitCode = 1;
  });
}
