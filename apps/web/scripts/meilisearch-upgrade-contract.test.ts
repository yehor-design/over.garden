import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MEILISEARCH_PINNED_IMAGE_DIGEST,
  MEILISEARCH_PINNED_IMAGE_REF,
  MEILISEARCH_PINNED_TARGET_VERSION,
  MEILISEARCH_UPGRADE_STRATEGY,
} from "@/server/search/meilisearch-upgrade-contract";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, "../..");
const COMPOSE_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/production-worker/docker-compose.meilisearch.yml",
);
const UPGRADE_SCRIPT_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/production-worker/meilisearch-upgrade",
);
const LOCAL_COMPOSE_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/docker-compose.yml",
);
const CONTAINER_COMMON_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/container-common",
);
const CI_WORKFLOW_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml");

type Harness = {
  env: NodeJS.ProcessEnv;
  root: string;
  mutationLog: string;
};

async function writeExecutable(file: string, lines: string[]) {
  await writeFile(file, lines.join("\n") + "\n", "utf8");
  await chmod(file, 0o755);
}

async function createPreflightHarness(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): Promise<Harness> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ove228-meili-preflight-"));
  const bin = path.join(root, "bin");
  const productionRoot = path.join(root, "production");
  const dockerRoot = path.join(root, "docker");
  const mutationLog = path.join(root, "docker.log");
  await Promise.all([mkdir(bin), mkdir(productionRoot), mkdir(dockerRoot)]);
  await writeFile(
    path.join(root, "meminfo"),
    [
      "MemTotal:       2097152 kB",
      "MemAvailable:   1572864 kB",
      "SwapTotal:      1048576 kB",
      "SwapFree:       1048576 kB",
      "",
    ].join("\n"),
    "utf8",
  );
  await Promise.all([
    writeFile(
      path.join(productionRoot, "docker-compose.meilisearch.yml"),
      await readFile(COMPOSE_PATH, "utf8"),
      "utf8",
    ),
    ...[
      "docker-compose.yml",
      "meili-rebuild-from-postgres.py",
      "meili.env",
      "worker.env",
    ].map((name) => writeFile(path.join(productionRoot, name), "", "utf8")),
  ]);

  await writeExecutable(path.join(bin, "docker"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf \'%s\\n\' "$*" >> "$OVERGARDEN_TEST_DOCKER_LOG"',
    'case "$*" in',
    '  "compose version") exit 0 ;;',
    '  "network inspect overgarden_default") exit 0 ;;',
    '  "info --format {{.DockerRootDir}}") printf \'%s\\n\' "$OVERGARDEN_TEST_DOCKER_ROOT"; exit 0 ;;',
    '  *" ps -q meilisearch") printf \'%s\\n\' "legacy-container"; exit 0 ;;',
    '  "ps --format {{.Names}}") printf \'%s\\n\' "matching-api"; exit 0 ;;',
    '  "exec matching-api python -c "*)',
    '    if [[ "$' +
      '{OVERGARDEN_TEST_DOCKER_DELAY_MS:-0}" != "0" ]]; then sleep 0.35; fi',
    "    printf '%s\\n' \"$" + '{OVERGARDEN_TEST_SOURCE_VERSION:-1.15.2}"',
    "    exit 0",
    "    ;;",
    '  "volume inspect overgarden_meili_data") exit 0 ;;',
    "  *) exit 0 ;;",
    "esac",
  ]);
  await writeExecutable(path.join(bin, "df"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'",
    "printf 'stub 10000000 1 %s 1%% /\\n' \"$" +
      '{OVERGARDEN_TEST_DISK_KB:-6000000}"',
  ]);
  await writeExecutable(path.join(bin, "jq"), [
    "#!/usr/bin/env bash",
    "exit 0",
  ]);
  await writeExecutable(path.join(bin, "flock"), [
    "#!/usr/bin/env bash",
    "exit 0",
  ]);

  return {
    root,
    mutationLog,
    env: {
      ...process.env,
      PATH: bin + ":" + (process.env.PATH ?? ""),
      OVERGARDEN_MEILI_HERMETIC_TEST: "1",
      OVERGARDEN_MEILI_MEMINFO_PATH: path.join(root, "meminfo"),
      OVERGARDEN_PRODUCTION_ROOT: productionRoot,
      OVERGARDEN_TEST_DOCKER_LOG: mutationLog,
      OVERGARDEN_TEST_DOCKER_ROOT: dockerRoot,
      ...overrides,
    },
  };
}

function runPreflight(harness: Harness, command = "preflight") {
  return spawnSync("bash", [UPGRADE_SCRIPT_PATH, command], {
    env: harness.env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

async function dockerCalls(harness: Harness) {
  return readFile(harness.mutationLog, "utf8").catch(() => "");
}

function expectNoUpgradeMutation(calls: string) {
  expect(calls).not.toMatch(
    /\b(?:pull|up|stop|start|restart|rm|run|create|network connect|network disconnect|volume rm|cp)\b/,
  );
}

describe("OVE-198 Meilisearch upgrade production pin contract", () => {
  it("pins local, CI, and production to the same reviewed server version", async () => {
    const [compose, script, localCompose, containerCommon, ci] =
      await Promise.all([
        readFile(COMPOSE_PATH, "utf8"),
        readFile(UPGRADE_SCRIPT_PATH, "utf8"),
        readFile(LOCAL_COMPOSE_PATH, "utf8"),
        readFile(CONTAINER_COMMON_PATH, "utf8"),
        readFile(CI_WORKFLOW_PATH, "utf8"),
      ]);

    expect(compose).toContain(MEILISEARCH_PINNED_IMAGE_REF);
    expect(compose).toContain("overgarden-meili-data-v1481");
    expect(compose).toContain("dual_volume_postgres_rebuild");
    expect(compose).not.toMatch(/:latest/);

    expect(script).toContain(MEILISEARCH_PINNED_IMAGE_REF);
    expect(script).toContain(MEILISEARCH_PINNED_IMAGE_DIGEST);
    expect(script).toContain(MEILISEARCH_PINNED_TARGET_VERSION);
    expect(script).toContain(MEILISEARCH_UPGRADE_STRATEGY);
    expect(script).toContain("cmd_preflight");
    expect(script).toContain("cmd_snapshot");
    expect(script).toContain("cmd_provision");
    expect(script).toContain("cmd_rebuild");
    expect(script).toContain("cmd_cutover");
    expect(script).toContain("cmd_rollback");
    expect(script).toContain("cmd_forward");
    expect(script).toContain("meili-rebuild-from-postgres.py");
    expect(script).toContain("legacyVolumeDeletion");
    expect(script).toContain("forbidden_in_ove198");

    expect(localCompose).toContain(
      `getmeili/meilisearch:v${MEILISEARCH_PINNED_TARGET_VERSION}`,
    );
    expect(containerCommon).toContain(
      `getmeili/meilisearch:v${MEILISEARCH_PINNED_TARGET_VERSION}`,
    );
    expect(ci).toContain(
      `getmeili/meilisearch:v${MEILISEARCH_PINNED_TARGET_VERSION}`,
    );
  });
});

describe("OVE-228 executable Meilisearch preflight", () => {
  it("uses real capacity sources and reaches immutable preflight with zero mutation", async () => {
    const harness = await createPreflightHarness();
    try {
      const startedAt = performance.now();
      const result = runPreflight(harness);
      const duration = performance.now() - startedAt;
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "preflight ok state=upgrade_required active=1.15.2 target=1.48.1 strategy=dual_volume_postgres_rebuild",
      );
      expect(duration).toBeLessThanOrEqual(60_000);
      expectNoUpgradeMutation(await dockerCalls(harness));
      expect(result.stdout + result.stderr).not.toMatch(
        /(?:DATABASE_URL|MEILI_MASTER_KEY|MEILISEARCH_API_KEY|MATCHING_SERVICE_TOKEN)/,
      );
    } finally {
      await rm(harness.root, { recursive: true, force: true });
    }
  });

  it("accepts the verified active target with both rollback volumes retained", async () => {
    const harness = await createPreflightHarness({
      OVERGARDEN_TEST_SOURCE_VERSION: "1.48.1",
    });
    try {
      const result = runPreflight(harness);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "preflight ok state=already_target active=1.48.1 target=1.48.1 strategy=dual_volume_postgres_rebuild",
      );
      expectNoUpgradeMutation(await dockerCalls(harness));
    } finally {
      await rm(harness.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["insufficient disk", { OVERGARDEN_TEST_DISK_KB: "5242879" }],
    ["invalid test mode", { OVERGARDEN_MEILI_HERMETIC_TEST: "invalid" }],
    ["wrong source version", { OVERGARDEN_TEST_SOURCE_VERSION: "1.14.0" }],
  ])("refuses %s before any upgrade mutation", async (_caseName, overrides) => {
    const harness = await createPreflightHarness(overrides);
    try {
      const result = runPreflight(harness);
      expect(result.status).not.toBe(0);
      expectNoUpgradeMutation(await dockerCalls(harness));
    } finally {
      await rm(harness.root, { recursive: true, force: true });
    }
  });

  it("fails closed when the real memory source is absent", async () => {
    const harness = await createPreflightHarness({
      OVERGARDEN_MEILI_MEMINFO_PATH: "/definitely-not-present/ove228-meminfo",
    });
    try {
      const result = runPreflight(harness);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "production host memory capacity cannot be verified",
      );
      expectNoUpgradeMutation(await dockerCalls(harness));
    } finally {
      await rm(harness.root, { recursive: true, force: true });
    }
  });

  it("permits only read-only commands in hermetic mode", async () => {
    const harness = await createPreflightHarness();
    try {
      const result = runPreflight(harness, "cutover");
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "hermetic test mode permits only preflight, status, and help",
      );
      expect(await dockerCalls(harness)).toBe("");
    } finally {
      await rm(harness.root, { recursive: true, force: true });
    }
  });

  it("keeps help responsive while a second preflight is refused by the lock", async () => {
    const harness = await createPreflightHarness({
      OVERGARDEN_TEST_DOCKER_DELAY_MS: "350",
    });
    try {
      const first = spawn("bash", [UPGRADE_SCRIPT_PATH, "preflight"], {
        env: harness.env,
        stdio: "pipe",
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const second = runPreflight(harness);
      const help = runPreflight(harness, "help");
      const firstExit = await new Promise<number | null>((resolve) =>
        first.once("close", resolve),
      );
      expect(firstExit).toBe(0);
      expect(second.status).not.toBe(0);
      expect(second.stderr).toContain(
        "another meilisearch-upgrade command holds the lock",
      );
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("Usage: meilisearch-upgrade");
      expectNoUpgradeMutation(await dockerCalls(harness));
    } finally {
      await rm(harness.root, { recursive: true, force: true });
    }
  });
});
