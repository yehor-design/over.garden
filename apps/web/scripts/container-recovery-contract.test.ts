import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, "../..");
const RECOVERY_SCRIPT = path.join(
  REPOSITORY_ROOT,
  "infra/container-recover-minio",
);
const CONTAINER_UP_SCRIPT = path.join(REPOSITORY_ROOT, "infra/container-up");

const SOURCE_VOLUME = "ove189-source-minio";
const TARGET_VOLUME = "ove189-target-minio";
const DECOY_VOLUME = "ove189-decoy-minio";

type HarnessOptions = {
  copyFails?: boolean;
  detachFails?: boolean;
  volumes?: string[];
};

type RecoveryResult = {
  log: string;
  output: string;
  status: number | null;
};

type RecoveryHarness = {
  run: (...args: string[]) => Promise<RecoveryResult>;
  runContainerUp: (...args: string[]) => Promise<RecoveryResult>;
  runtimeStateDirectory: string;
  temporaryDirectory: string;
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createHarness(
  options: HarnessOptions = {},
): Promise<RecoveryHarness> {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "overgarden-minio-recovery-contract-"),
  );
  temporaryDirectories.push(temporaryDirectory);

  const binDirectory = path.join(temporaryDirectory, "bin");
  const runtimeStateDirectory = path.join(temporaryDirectory, "runtime-state");
  const fakeContainerStateDirectory = path.join(
    temporaryDirectory,
    "fake-container-state",
  );
  const invocationLog = path.join(temporaryDirectory, "container.log");
  const volumeFile = path.join(temporaryDirectory, "volumes");
  const envFile = path.join(temporaryDirectory, "infra.env");

  await Promise.all([
    mkdir(binDirectory, { recursive: true }),
    mkdir(fakeContainerStateDirectory, { recursive: true }),
    writeFile(invocationLog, "", "utf8"),
    writeFile(
      volumeFile,
      `${(options.volumes ?? [SOURCE_VOLUME, DECOY_VOLUME]).join("\n")}\n`,
      "utf8",
    ),
    writeFile(
      envFile,
      [
        "POSTGRES_DB=overgarden",
        "POSTGRES_USER=overgarden",
        "POSTGRES_PASSWORD=local-test-only",
        "MEILI_MASTER_KEY=local-test-key-at-least-16-bytes",
        "MINIO_ROOT_USER=local-test-user",
        "MINIO_ROOT_PASSWORD=local-test-password",
        "",
      ].join("\n"),
      "utf8",
    ),
  ]);

  const fakeContainer = path.join(binDirectory, "container");
  const fakeCurl = path.join(binDirectory, "curl");
  const fakeNetcat = path.join(binDirectory, "nc");

  await writeFile(
    fakeContainer,
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$*" >> "$FAKE_CONTAINER_LOG"
command="\${1:-}"
shift || true

case "$command" in
  system)
    [[ "\${1:-}" == "status" ]] && exit 0
    ;;
  list)
    exit 0
    ;;
  volume)
    subcommand="\${1:-}"
    shift || true
    case "$subcommand" in
      inspect)
        grep -Fxq -- "\${1:-}" "$FAKE_VOLUME_FILE"
        exit $?
        ;;
      list)
        printf 'NAME\\n'
        cat "$FAKE_VOLUME_FILE"
        exit 0
        ;;
      create)
        volume="\${1:-}"
        grep -Fxq -- "$volume" "$FAKE_VOLUME_FILE" || printf '%s\\n' "$volume" >> "$FAKE_VOLUME_FILE"
        exit 0
        ;;
      delete)
        exit 97
        ;;
    esac
    ;;
  inspect)
    name="\${1:-}"
    if [[ -f "$FAKE_CONTAINER_STATE_DIR/$name.running" ]]; then
      printf '{"state":"running"}\\n'
      exit 0
    fi
    exit 1
    ;;
  run)
    joined="$*"
    if [[ "$joined" == *"--detach"* ]]; then
      [[ "\${FAKE_DETACH_FAIL:-0}" != "1" ]] || exit 42
      name=""
      previous=""
      for argument in "$@"; do
        if [[ "$previous" == "--name" ]]; then name="$argument"; fi
        previous="$argument"
      done
      [[ -n "$name" ]]
      : > "$FAKE_CONTAINER_STATE_DIR/$name.running"
      printf 'fake-container-id\\n'
      exit 0
    fi
    if [[ "$joined" == *"target=/target"* ]]; then
      if [[ "\${FAKE_COPY_FAIL:-0}" == "1" ]]; then
        printf 'copy_class=partial\\n'
        exit 2
      fi
      printf 'copy_class=complete\\n'
      exit 0
    fi
    if [[ "$joined" == *"target=/source,readonly"* ]]; then
      printf '3 20 7 0 4\\n'
      exit 0
    fi
    exit 88
    ;;
  stop)
    name="\${1:-}"
    rm -f "$FAKE_CONTAINER_STATE_DIR/$name.running"
    exit 0
    ;;
  delete)
    name="\${1:-}"
    rm -f "$FAKE_CONTAINER_STATE_DIR/$name.running"
    exit 0
    ;;
esac

exit 96
`,
    "utf8",
  );
  await writeFile(
    fakeCurl,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_CONTAINER_LOG"
exit 0
`,
    "utf8",
  );
  await writeFile(fakeNetcat, "#!/usr/bin/env bash\nexit 1\n", "utf8");
  await Promise.all([
    chmod(fakeContainer, 0o755),
    chmod(fakeCurl, 0o755),
    chmod(fakeNetcat, 0o755),
  ]);

  return {
    runtimeStateDirectory,
    temporaryDirectory,
    async run(...args: string[]) {
      return runScript(RECOVERY_SCRIPT, args);
    },
    async runContainerUp(...args: string[]) {
      return runScript(CONTAINER_UP_SCRIPT, args);
    },
  };

  async function runScript(script: string, args: string[]) {
    const result = spawnSync("bash", [script, ...args], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_CONTAINER_LOG: invocationLog,
        FAKE_CONTAINER_STATE_DIR: fakeContainerStateDirectory,
        FAKE_COPY_FAIL: options.copyFails ? "1" : "0",
        FAKE_DETACH_FAIL: options.detachFails ? "1" : "0",
        FAKE_VOLUME_FILE: volumeFile,
        OVERGARDEN_INFRA_ENV_FILE: envFile,
        OVERGARDEN_INFRA_STATE_DIR: runtimeStateDirectory,
        OVERGARDEN_MINIO_VOLUME: SOURCE_VOLUME,
        PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      },
      timeout: 10_000,
    });

    return {
      log: await readFile(invocationLog, "utf8"),
      output: `${result.stdout}${result.stderr}`,
      status: result.status,
    };
  }
}

describe("container-recover-minio contract", () => {
  it("rejects non-exact identifiers before querying or mutating the runtime", async () => {
    const harness = await createHarness();

    const result = await harness.run("--plan", "--source", "unsafe/source");

    expect(result.status).toBe(1);
    expect(result.output).toContain("must be one exact container identifier");
    expect(result.log).toBe("");
  });

  it("reports an ambiguous plan without creating, deleting, or activating a volume", async () => {
    const harness = await createHarness({
      volumes: [SOURCE_VOLUME, "candidate-one-minio", "candidate-two-minio"],
    });

    const result = await harness.run("--plan", "--source", SOURCE_VOLUME);

    expect(result.status).toBe(2);
    expect(result.output).toContain("target_resolution=ambiguous");
    expect(result.output).toContain("source_mutation=none");
    expect(result.output).toContain("source_retirement=not-authorized");
    expect(result.log).toContain(
      `type=volume,source=${SOURCE_VOLUME},target=/source,readonly`,
    );
    expect(result.log).not.toMatch(/volume (create|delete)/);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-volume"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("emits a bounded non-mutating plan when no other MinIO candidate exists", async () => {
    const harness = await createHarness({ volumes: [SOURCE_VOLUME] });

    const result = await harness.run("--plan", "--source", SOURCE_VOLUME);

    expect(result.status).toBe(0);
    expect(result.output).toContain("mode=plan");
    expect(result.output).toContain("source_inventory_class=complete");
    expect(result.output).toContain("target_candidate_count=0");
    expect(result.output).toContain("target_resolution=not-specified");
    expect(result.output).toContain("source_mutation=none");
    expect(result.output).toContain("source_retirement=not-authorized");
    expect(result.log).toContain(
      `type=volume,source=${SOURCE_VOLUME},target=/source,readonly`,
    );
    expect(result.log).not.toMatch(/volume (create|delete)/);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-volume"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("requires the exact source-and-target confirmation before preflight or writes", async () => {
    const harness = await createHarness();

    const result = await harness.run(
      "--execute",
      "--source",
      SOURCE_VOLUME,
      "--target",
      TARGET_VOLUME,
      "--confirm",
      "yes",
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("Confirmation mismatch");
    expect(result.log.trim()).toBe("system status");
    expect(result.log).not.toMatch(/volume (create|delete)/);
  });

  it("refuses to reactivate a preserved recovery source before any runtime mutation", async () => {
    const harness = await createHarness();
    await mkdir(harness.runtimeStateDirectory, { recursive: true });
    await writeFile(
      path.join(harness.runtimeStateDirectory, "minio-preserved-source"),
      `${SOURCE_VOLUME}\n`,
      "utf8",
    );

    const result = await harness.runContainerUp("--recreate");

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Refusing to activate preserved MinIO recovery source",
    );
    expect(result.output).toContain("No containers or volumes were changed");
    expect(result.log).toBe("");
  });

  it("refuses to recover into an existing target instead of overwriting it", async () => {
    const harness = await createHarness({
      volumes: [SOURCE_VOLUME, TARGET_VOLUME, DECOY_VOLUME],
    });
    const confirmation = `PRESERVE ${SOURCE_VOLUME} AND RECOVER INTO ${TARGET_VOLUME}`;

    const result = await harness.run(
      "--execute",
      "--source",
      SOURCE_VOLUME,
      "--target",
      TARGET_VOLUME,
      "--confirm",
      confirmation,
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("target_state=present");
    expect(result.output).toContain("target_resolution=unsafe-existing");
    expect(result.output).toContain(
      "Recovery preflight did not pass; no target volume was created",
    );
    expect(result.log).not.toMatch(/volume (create|delete)/);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-volume"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("refuses a conflicting preserved-source record before creating a target", async () => {
    const harness = await createHarness();
    await mkdir(harness.runtimeStateDirectory, { recursive: true });
    await writeFile(
      path.join(harness.runtimeStateDirectory, "minio-preserved-source"),
      "different-preserved-minio-source\n",
      "utf8",
    );
    const confirmation = `PRESERVE ${SOURCE_VOLUME} AND RECOVER INTO ${TARGET_VOLUME}`;

    const result = await harness.run(
      "--execute",
      "--source",
      SOURCE_VOLUME,
      "--target",
      TARGET_VOLUME,
      "--confirm",
      confirmation,
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("preserved_source_record=conflict");
    expect(result.output).toContain(
      "Recovery preflight did not pass; no target volume was created",
    );
    expect(result.log).not.toMatch(/volume (create|delete)/);
  });

  it("keeps the source read-only and records activation only after a complete verified recovery", async () => {
    const harness = await createHarness();
    const confirmation = `PRESERVE ${SOURCE_VOLUME} AND RECOVER INTO ${TARGET_VOLUME}`;

    const result = await harness.run(
      "--execute",
      "--source",
      SOURCE_VOLUME,
      "--target",
      TARGET_VOLUME,
      "--confirm",
      confirmation,
    );

    expect(result.status).toBe(0);
    expect(result.output).toContain("copy_class=complete");
    expect(result.output).toContain("inventory_comparison=match");
    expect(result.output).toContain("target_minio_readiness=ready");
    expect(result.output).toContain("source_preserved=yes");
    expect(result.log).toContain(`volume create ${TARGET_VOLUME}`);
    expect(result.log).toContain(
      `type=volume,source=${SOURCE_VOLUME},target=/source,readonly`,
    );
    expect(result.log).not.toContain(
      `type=volume,source=${SOURCE_VOLUME},target=/source `,
    );
    expect(result.log).not.toMatch(/volume delete/);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-volume"),
        "utf8",
      ),
    ).resolves.toBe(`${TARGET_VOLUME}\n`);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-preserved-source"),
        "utf8",
      ),
    ).resolves.toBe(`${SOURCE_VOLUME}\n`);
  });

  it("leaves the new target preserved but does not activate it when readiness fails", async () => {
    const harness = await createHarness({ detachFails: true });
    const confirmation = `PRESERVE ${SOURCE_VOLUME} AND RECOVER INTO ${TARGET_VOLUME}`;

    const result = await harness.run(
      "--execute",
      "--source",
      SOURCE_VOLUME,
      "--target",
      TARGET_VOLUME,
      "--confirm",
      confirmation,
    );

    expect(result.status).not.toBe(0);
    expect(result.log).toContain(`volume create ${TARGET_VOLUME}`);
    expect(result.log).not.toMatch(/volume delete/);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-volume"),
        "utf8",
      ),
    ).rejects.toThrow();
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-preserved-source"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("reports a bounded copy failure while preserving source and failed target", async () => {
    const harness = await createHarness({ copyFails: true });
    const confirmation = `PRESERVE ${SOURCE_VOLUME} AND RECOVER INTO ${TARGET_VOLUME}`;

    const result = await harness.run(
      "--execute",
      "--source",
      SOURCE_VOLUME,
      "--target",
      TARGET_VOLUME,
      "--confirm",
      confirmation,
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("copy_class=partial");
    expect(result.output).toContain(
      "Source and failed target remain preserved for investigation",
    );
    expect(result.log).toContain(`volume create ${TARGET_VOLUME}`);
    expect(result.log).not.toMatch(/volume delete/);
    await expect(
      readFile(
        path.join(harness.runtimeStateDirectory, "minio-volume"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("contains no destructive volume operation and orders activation after readiness", async () => {
    const source = await readFile(RECOVERY_SCRIPT, "utf8");

    expect(source).not.toMatch(/container\s+volume\s+(delete|rm)\b/);
    expect(source).toContain(
      '--mount "type=volume,source=$source,target=/source,readonly"',
    );
    expect(source).toContain('--exclude="./.minio.sys"');
    expect(source).toContain('--exclude="./lost+found"');
    expect(
      source.indexOf("verify_target_readiness\nrecord_activation"),
    ).toBeGreaterThan(0);
  });
});


describe("composed self-hosted stack contract", () => {
  const stackScript = path.join(REPOSITORY_ROOT, "infra/overgarden-stack");
  const stackCompose = path.join(
    REPOSITORY_ROOT,
    "infra/docker-compose.stack.yml",
  );

  async function readStack(file: string) {
    return readFile(file, "utf8");
  }

  it("parses as a shell script and refuses an unknown subcommand", () => {
    const syntax = spawnSync("bash", ["-n", stackScript], { encoding: "utf8" });
    expect(syntax.status).toBe(0);

    const unknown = spawnSync("bash", [stackScript, "obliterate"], {
      encoding: "utf8",
    });
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toMatch(/unknown subcommand/u);
  });

  it("prints its closed subcommand set instead of doing anything on no argument", () => {
    const bare = spawnSync("bash", [stackScript], { encoding: "utf8" });
    expect(bare.status).toBe(1);
    for (const subcommand of ["up", "down", "status", "backup", "restore", "verify"]) {
      expect(bare.stdout).toContain(subcommand);
    }
  });

  it("refuses a restore digest that is not a digest", async () => {
    // Anything reaching `psql` from here would be interpolated into a database
    // name, so the shape is checked before a connection is opened.
    for (const argument of ["not-a-digest", "'; drop database overgarden; --", "abc"]) {
      const refused = spawnSync("bash", [stackScript, "restore", argument], {
        encoding: "utf8",
      });
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toMatch(/64 hex characters|usage/u);
    }
  });

  it("keeps the worker off the pooler, because transaction pooling has no session", async () => {
    // `LISTEN`/`NOTIFY` needs a session that outlives a transaction. A worker
    // routed through the pooler would stop waking and its bounded fallback poll
    // would quietly cover for it.
    const compose = await readStack(stackCompose);
    expect(compose).toContain("POOL_MODE: transaction");
    expect(compose).toMatch(/DIRECT_URL:[\s\S]*@postgres:5432/u);
    expect(compose).not.toMatch(/DIRECT_URL:[\s\S]*@pgbouncer/u);
  });

  it("serves Postgres over TLS and verifies it from the pooler", async () => {
    const compose = await readStack(stackCompose);
    expect(compose).toContain("ssl=on");
    expect(compose).toContain("SERVER_TLS_SSLMODE: verify-full");
  });

  it("publishes exactly one service to the host", async () => {
    // Postgres, the pooler, the search index, and the worker are reachable on
    // the internal network alone. Only the proxy has a public port.
    const compose = await readStack(stackCompose);
    expect((compose.match(/^\s{4}ports:/gmu) ?? []).length).toBe(1);
  });
});
