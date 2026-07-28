/** OVE-230 exact provider-bound disposable teardown with authenticated absence. */

import process from "node:process";

import {
  assertTeardownGate,
  DigitalOceanDatabaseProvider,
  isDisposableClusterName,
} from "../src/server/restore-readiness";
import { pollUntil } from "../src/server/restore-readiness/runtime";

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index < 0 ? null : (argv[index + 1] ?? null);
}

async function main() {
  const argv = process.argv.slice(2);
  const confirmDeleteClusterId = required(argv, "--confirm-delete-cluster-id");
  const disposableClusterId = required(argv, "--disposable-cluster-id");
  const productionClusterId = required(argv, "--production-cluster-id");
  const disposableClusterName = required(argv, "--disposable-cluster-name");
  const expectedEngine = required(argv, "--expected-engine");
  const expectedRegion = required(argv, "--expected-region");
  const execute = argv.includes("--execute");
  const gate = assertTeardownGate({
    confirmDeleteClusterId,
    disposableClusterId,
    productionClusterId,
    disposableClusterName,
  });
  if (!isDisposableClusterName(disposableClusterName)) {
    throw new Error("Refuse: disposable name gate failed.");
  }
  const provider = new DigitalOceanDatabaseProvider();
  const target = await provider.getCluster(gate.deleteClusterId);
  if (
    target.name !== disposableClusterName ||
    target.engine !== expectedEngine ||
    target.region !== expectedRegion ||
    target.id === productionClusterId
  ) {
    throw new Error("Refuse: fresh provider teardown identity drifted.");
  }
  if (!execute) {
    console.log(
      JSON.stringify({
        ok: true,
        issue: "OVE-230",
        evidenceClass: "provider_bound_teardown_plan",
        exactTarget: true,
        execute: false,
      }),
    );
    return;
  }
  await provider.delete(target.id);
  await pollUntil({
    read: async () =>
      (await provider.listClusters()).filter(
        (cluster) => cluster.id === target.id,
      ).length,
    done: (cardinality) => cardinality === 0,
    timeoutMs: 600_000,
    intervalMs: 5_000,
    timeoutClass: "provider absence poll timeout",
  });
  console.log(
    JSON.stringify({
      ok: true,
      issue: "OVE-230",
      evidenceClass: "provider_bound_teardown_absence",
      authenticatedAbsence: true,
      execute: true,
    }),
  );
}

function required(argv: string[], name: string) {
  const value = readFlag(argv, name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "restore drill teardown failed",
  );
  process.exitCode = 1;
});
