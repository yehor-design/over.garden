/**
 * OVE-201 disposable cluster teardown (exact-ID confirmation only).
 * Never deletes production. Never logs credentials.
 */

import { spawnSync } from "node:child_process";
import process from "node:process";

import { isDisposableClusterName } from "../src/server/restore-readiness/contract";
import { assertTeardownGate } from "../src/server/restore-readiness/gates";

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function main() {
  const argv = process.argv.slice(2);
  const confirmDeleteClusterId = readFlag(argv, "--confirm-delete-cluster-id");
  const disposableClusterId = readFlag(argv, "--disposable-cluster-id");
  const productionClusterId = readFlag(argv, "--production-cluster-id");
  const disposableClusterName = readFlag(argv, "--disposable-cluster-name");
  const execute = argv.includes("--execute");

  if (
    !confirmDeleteClusterId ||
    !disposableClusterId ||
    !productionClusterId ||
    !disposableClusterName
  ) {
    throw new Error(
      "Required: --confirm-delete-cluster-id --disposable-cluster-id --production-cluster-id --disposable-cluster-name [--execute]",
    );
  }

  const gate = assertTeardownGate({
    confirmDeleteClusterId,
    disposableClusterId,
    productionClusterId,
    disposableClusterName,
  });

  if (!isDisposableClusterName(disposableClusterName)) {
    throw new Error("Refuse: disposable name gate failed.");
  }

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-201",
          evidenceClass: "managed-restore-teardown-dry-run",
          wouldDeleteClusterIdClass: "uuid_confirmed_disposable",
          disposableClusterNameClass: disposableClusterName,
          execute: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = spawnSync(
    "doctl",
    ["databases", "delete", gate.deleteClusterId, "--force"],
    { encoding: "utf8" },
  );

  const deleted =
    result.status === 0 &&
    !/error|refus|denied/i.test(`${result.stdout}\n${result.stderr}`);

  console.log(
    JSON.stringify(
      {
        ok: deleted,
        issue: "OVE-201",
        evidenceClass: "managed-restore-teardown",
        deleteExitCode: result.status,
        disposableClusterNameClass: disposableClusterName,
        deleted,
        execute: true,
      },
      null,
      2,
    ),
  );

  if (!deleted) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(
    error instanceof Error ? error.message : "restore drill teardown failed",
  );
  process.exitCode = 1;
}
