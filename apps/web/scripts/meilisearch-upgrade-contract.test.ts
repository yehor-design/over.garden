import { readFile } from "node:fs/promises";
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
const CI_WORKFLOW_PATH = path.join(
  REPOSITORY_ROOT,
  ".github/workflows/ci.yml",
);

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

    expect(localCompose).toContain(`getmeili/meilisearch:v${MEILISEARCH_PINNED_TARGET_VERSION}`);
    expect(containerCommon).toContain(
      `getmeili/meilisearch:v${MEILISEARCH_PINNED_TARGET_VERSION}`,
    );
    expect(ci).toContain(`getmeili/meilisearch:v${MEILISEARCH_PINNED_TARGET_VERSION}`);
  });
});
