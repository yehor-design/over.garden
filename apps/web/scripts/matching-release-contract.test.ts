import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { matchingSupportedKinds } from "@/server/job-queue-manifest";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, "../..");
const WORKFLOW_PATH = path.join(
  REPOSITORY_ROOT,
  ".github/workflows/matching-image.yml",
);
const COMPOSE_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/production-worker/docker-compose.release.yml",
);
const RELEASE_SCRIPT_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/production-worker/matching-release",
);
const MIGRATION_PATH = path.join(
  REPOSITORY_ROOT,
  "infra/production-worker/0002_matching_worker_heartbeats.sql",
);

const SQL_DIRECTORY = path.join(REPOSITORY_ROOT, "apps/web/sql");

/**
 * Derived, never restated.
 *
 * This file used to carry its own copy of the handler set and assert that the
 * workflow and the migration each contained those six strings. They did. The
 * queue manifest had already grown to nine, so the test passed while the
 * release workflow refused every image built from a correct `main` — seventy-six
 * consecutive failures between 2026-08-28 and 2026-09-04, each one exiting 1
 * with no output. A guard that restates the value it is guarding proves only
 * that two copies of a stale answer agree.
 */
const REQUIRED_HANDLERS = [...matchingSupportedKinds()].sort();

/** Every `supported_handlers = array[...]::text[]` list a SQL file declares. */
function heartbeatHandlerConstraints(sql: string): string[][] {
  return [
    ...sql.matchAll(/supported_handlers = array\[([^\]]*)\]::text\[\]/gu),
  ].map((match) =>
    [...match[1].matchAll(/'([a-z0-9_]+)'/gu)].map((handler) => handler[1]),
  );
}

describe("OVE-190 immutable matching release contract", () => {
  it("tests the frozen source before publishing a unique exact-SHA image", async () => {
    const workflow = await readFile(WORKFLOW_PATH, "utf8");
    const compile = workflow.indexOf("Compile every Python module");
    const lint = workflow.indexOf("Lint frozen matching source");
    const test = workflow.indexOf("Test frozen matching source");
    const publish = workflow.indexOf("Build and publish exact immutable image");

    expect(compile).toBeGreaterThan(0);
    expect(lint).toBeGreaterThan(compile);
    expect(test).toBeGreaterThan(lint);
    expect(publish).toBeGreaterThan(test);
    expect(workflow).toContain("python -m pip install uv==0.11.24");
    expect(workflow).toContain("uv run --frozen ruff check .");
    expect(workflow).toContain("uv run --frozen pytest -q");
    expect(workflow).toContain("packages: write");
    expect(workflow).toContain(
      "image_tag=sha-$REQUESTED_SHA-run-${RELEASE_RUN//./-}",
    );
    expect(workflow).toContain("REGISTRY_DIGEST");
    expect(workflow).toContain('docker pull "$digest_ref"');
    expect(workflow).not.toMatch(/(?:^|\s)(?:tag|tags:)[^\n]*latest/im);
  });

  it("seals the exact runtime identity and complete handler set", async () => {
    const workflow = await readFile(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("python -m app.runtime capabilities");
    expect(workflow).toContain(".release.commitSha == $sha");
    expect(workflow).toContain(".release.imageDigest == $digest");
    expect(workflow).toContain(".release.schemaCompatibilityClass == $schema");
    expect(workflow).toContain('.queue.name == "matching"');
    // The handler set is read from the commit being released and compared to
    // what the built container answers, then sealed into release.json so the
    // production host can hold the running container to it without a list of
    // its own.
    expect(workflow).toContain(
      "from app.job_handlers import SUPPORTED_JOB_KINDS",
    );
    expect(workflow).toContain('assert_equal "queue.supportedHandlers"');
    expect(workflow).toContain("--argjson supportedHandlers");
    expect(workflow).toContain("supportedHandlers: $supportedHandlers");
    expect(workflow).toContain("release.json");
    expect(workflow).toContain("matching-capabilities.json");
    expect(workflow).toContain("archive_sha256");
    expect(workflow).toContain("archiveConfigDigest");
    expect(workflow).toContain("actions/upload-artifact");
  });

  it("names no handler in the release path, so the set cannot go stale there", async () => {
    const restatements = await Promise.all(
      [WORKFLOW_PATH, RELEASE_SCRIPT_PATH].map(async (file) => {
        const contents = await readFile(file, "utf8");
        return {
          file: path.relative(REPOSITORY_ROOT, file),
          named: REQUIRED_HANDLERS.filter((handler) =>
            contents.includes(`"${handler}"`),
          ),
        };
      }),
    );

    // Falsify this by pasting one handler name back into either file.
    expect(restatements).toEqual([
      { file: ".github/workflows/matching-image.yml", named: [] },
      { file: "infra/production-worker/matching-release", named: [] },
    ]);
  });

  it("keeps the heartbeat constraint in step with the queue manifest", async () => {
    // The constraint pins `supported_handlers` to an exact array, so a manifest
    // that grows without a migration makes every heartbeat fail with 23514 —
    // and since OVE-357 the heartbeat row is the only liveness signal there is.
    // The newest migration that states the constraint has to state today's set.
    const sqlFiles = (await readdir(SQL_DIRECTORY))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort((left, right) => left.localeCompare(right, "en"));
    const stated: { file: string; handlers: string[][] }[] = [];
    for (const name of sqlFiles) {
      const handlers = heartbeatHandlerConstraints(
        await readFile(path.join(SQL_DIRECTORY, name), "utf8"),
      );
      if (handlers.length > 0) stated.push({ file: name, handlers });
    }

    expect(stated.length).toBeGreaterThan(0);
    const newest = stated[stated.length - 1];
    for (const declared of newest.handlers) {
      expect([declared.join(","), newest.file]).toEqual([
        REQUIRED_HANDLERS.join(","),
        newest.file,
      ]);
    }

    // The production worker host bootstraps the table from its own excerpt.
    const hostMigration = heartbeatHandlerConstraints(
      await readFile(MIGRATION_PATH, "utf8"),
    );
    expect(hostMigration.length).toBeGreaterThan(0);
    for (const declared of hostMigration) {
      expect(declared).toEqual([...REQUIRED_HANDLERS]);
    }
  });

  it("uses one no-latest image for the worker with dependency readiness", async () => {
    const compose = await readFile(COMPOSE_PATH, "utf8");

    expect(compose).toContain("x-matching-release: &matching-release");
    // One service, not two: OVE-357 retired `matching-api`, whose three
    // endpoints reported on the service itself. The immutable-release anchor is
    // unchanged; there is simply one consumer of it now.
    expect(compose.match(/<<: \*matching-release/g)).toHaveLength(1);
    expect(compose).not.toMatch(/^\s{2}matching-api:/mu);
    expect(compose).toContain("pull_policy: never");
    expect(compose).toContain("OVERGARDEN_MATCHING_COMMIT_SHA");
    expect(compose).toContain("OVERGARDEN_MATCHING_IMAGE_DIGEST");
    expect(compose).toContain("OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY");
    expect(
      compose.match(/python\n\s+- -m\n\s+- app\.runtime\n\s+- ready/g),
    ).toHaveLength(1);
    expect(compose).not.toMatch(/^\s*build:/m);
    expect(compose).not.toMatch(/latest/i);
  });

  it("keeps the production schema change additive, exact, and data-free", async () => {
    const migration = await readFile(MIGRATION_PATH, "utf8");
    const executableSql = migration
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    expect(migration).toContain(
      "create table if not exists matching_worker_heartbeats",
    );
    for (const constraint of [
      "matching_worker_heartbeats_commit_sha_check",
      "matching_worker_heartbeats_image_digest_check",
      "matching_worker_heartbeats_schema_compatibility_check",
      "matching_worker_heartbeats_queue_name_check",
      "matching_worker_heartbeats_supported_handlers_check",
    ]) {
      expect(migration).toContain(constraint);
    }
    for (const handler of REQUIRED_HANDLERS) {
      expect(migration).toContain(`'${handler}'`);
    }
    expect(migration).toContain(
      "apps/web/sql/0050_matching_handler_set_catch_up.sql",
    );
    expect(executableSql).not.toMatch(
      /\b(drop|delete|truncate)\b\s+(table|from)/i,
    );
    expect(executableSql).not.toMatch(
      /\b(hostname|payload|user_id|email|location|last_error)\b/i,
    );
  });

  it("fails closed around install, preflight, activation, rollback, and forward", async () => {
    const releaseScript = await readFile(RELEASE_SCRIPT_PATH, "utf8");
    const preflight = releaseScript.indexOf(
      'preflight_candidate "$candidate_env"',
    );
    const activate = releaseScript.indexOf('mv "$candidate_env" "$ACTIVE_ENV"');
    const pointerUpdate = releaseScript.indexOf(
      'copy_pointer "$target_manifest" "$CURRENT_POINTER"',
    );
    const archiveIdentityCheck = releaseScript.indexOf(
      'verify_archive_config_digest "$incoming_dir"',
    );
    const imageLoad = releaseScript.indexOf("docker load >/dev/null");

    expect(preflight).toBeGreaterThan(0);
    expect(activate).toBeGreaterThan(preflight);
    expect(pointerUpdate).toBeGreaterThan(activate);
    expect(archiveIdentityCheck).toBeGreaterThan(0);
    expect(imageLoad).toBeGreaterThan(archiveIdentityCheck);
    expect(releaseScript).toContain("flock -n 9");
    expect(releaseScript).toContain("sha256sum");
    expect(releaseScript).toContain("zstd --test");
    expect(releaseScript).toContain("verify_archive_config_digest");
    expect(releaseScript).toContain("require_release_host_capacity");
    expect(releaseScript).toContain("MIN_RELEASE_VIRTUAL_MEMORY_KB=2621440");
    expect(releaseScript).toContain(
      "MIN_RELEASE_AVAILABLE_VIRTUAL_MEMORY_KB=1048576",
    );
    expect(releaseScript).toContain("MIN_RELEASE_AVAILABLE_DISK_KB=5242880");
    expect(releaseScript).toContain("run_bounded_low_priority");
    expect(releaseScript).toContain("run_bounded_low_priority sha256sum --");
    expect(releaseScript).toContain("--signal=TERM");
    expect(releaseScript).toContain("--kill-after=");
    expect(releaseScript).toContain("ionice -c 2 -n 7");
    expect(releaseScript).toContain("nice -n 10");
    expect(releaseScript).toContain("MemAvailable:");
    expect(releaseScript).toContain("SwapFree:");
    expect(releaseScript).toContain("{{.DockerRootDir}}");
    expect(releaseScript).toContain(
      'activate_manifest "$PREVIOUS_POINTER" recovery',
    );
    expect(releaseScript).toContain(
      'activate_manifest "$target_manifest" normal',
    );
    const statusBody = releaseScript.slice(
      releaseScript.indexOf("status_release()"),
      releaseScript.indexOf("usage()"),
    );
    expect(statusBody).not.toContain("require_release_host_capacity");
    expect(statusBody).not.toContain("require_install_runtime");
    expect(releaseScript).toContain("loadedImageId");
    expect(releaseScript).not.toContain(".image.localImageId");
    expect(releaseScript).toContain("verify_loaded_image");
    expect(releaseScript).toContain("python -m app.runtime preflight");
    expect(releaseScript).toContain("python -m app.runtime ready");
    // The expected handler set comes from the artifact being verified.
    expect(releaseScript).toContain(".queue.supportedHandlers // empty");
    expect(releaseScript).toContain("--argjson handlers");
    // OVE-357 retired `matching-api`, and the release compose file has defined
    // one service ever since. Every command this script sent to that file still
    // named the retired one, so preflight, activation, and readiness each asked
    // Compose for a service it does not have. Only the emergency restore path,
    // which drives the untouched pre-OVE-190 host Compose file, may name it.
    const staleServiceUse = releaseScript
      .split("\n")
      .filter(
        (line) =>
          line.includes("matching-api") &&
          !line.includes("legacy_compose") &&
          !line.trimStart().startsWith("#"),
      );
    expect(staleServiceUse).toEqual([]);
    expect(releaseScript).toContain("--no-deps");
    expect(releaseScript).toContain("rollback accepts no arguments");
    expect(releaseScript).toContain("forward accepts no arguments");
    expect(releaseScript).toContain("$PREVIOUS_POINTER");
    expect(releaseScript).toContain("$FORWARD_POINTER");
    expect(releaseScript).not.toContain("set -x");
    expect(releaseScript).not.toMatch(/\b(printenv|env)\s*>/);
    expect(releaseScript).not.toMatch(/docker\s+compose[^\n]*\s+down\b/);
    expect(releaseScript).not.toMatch(/docker\s+(?:image\s+)?(?:rm|rmi)\b/);
    expect(releaseScript).not.toMatch(/latest/i);
  });
});
