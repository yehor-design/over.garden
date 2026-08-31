import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

const REQUIRED_HANDLERS = [
  "catalog_alias_suggestions_refresh",
  "catalog_fuzzy_duplicate_qa_refresh",
  "catalog_match_suggestions_refresh",
  "catalog_typeahead_reindex",
  "journal_entry_index",
  "journal_entry_unindex",
] as const;

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
    for (const handler of REQUIRED_HANDLERS) {
      expect(workflow).toContain(`\"${handler}\"`);
    }
    expect(workflow).toContain("release.json");
    expect(workflow).toContain("matching-capabilities.json");
    expect(workflow).toContain("archive_sha256");
    expect(workflow).toContain("archiveConfigDigest");
    expect(workflow).toContain("actions/upload-artifact");
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
