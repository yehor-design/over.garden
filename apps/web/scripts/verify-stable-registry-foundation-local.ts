import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { sql } from "kysely";

import { db } from "../src/db";
import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { buildRekeyStableRegistryActorsForErasureQuery } from "../src/server/erasure-execution";
import { scopedToUser } from "../src/server/request-scope";
import {
  activateFoundationRelease,
  approveFoundationPreview,
  createFoundationDraft,
  decideFoundationExceptionGroup,
  readStableRegistryReleaseCenter,
} from "../src/server/stable-registry/release-repository";
import { ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID } from "../src/server/system-actors";

const DISPOSABLE_DATABASE_PREFIX = "/overgarden_ove255_";
const SHA256 = "a".repeat(64);
const TOOL_REVISION = "b".repeat(40);
const OPERATOR_ID = "00000000-0000-4000-8000-000000000255";

async function main() {
  assertArguments();
  // Every sibling proof script loads the local file itself. Without this the
  // command in this issue's runbook fails on its own loopback assertion before
  // it reaches a database, because nothing else populates the process env.
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);
  assertDisposableDatabase();

  const sourceSnapshotId = randomUUID();
  const captureId = randomUUID();
  await insertCompletedFixtureCapture({ sourceSnapshotId, captureId });

  const scope = scopedToUser(OPERATOR_ID, "ove255-disposable-proof");
  const malformed = await createFoundationDraft(scope, {
    captureId: "not-a-release-capture-id",
    writesEnabled: true,
  });
  if (malformed.outcome !== "not_found") {
    throw new Error("Malformed opaque capture input was not bounded safely.");
  }
  const drafts = await Promise.all(
    Array.from({ length: 2 }, () =>
      createFoundationDraft(scope, {
        captureId,
        writesEnabled: true,
      }),
    ),
  );
  const draft = drafts.find((result) => !result.replayed);
  if (
    !draft ||
    draft.outcome !== "accepted" ||
    !draft.release ||
    draft.release.state !== "draft" ||
    drafts.some(
      (result) =>
        result.outcome !== "accepted" ||
        result.release?.id !== draft.release?.id,
    )
  ) {
    throw new Error(
      "Foundation build race did not converge to one draft receipt.",
    );
  }

  runFoundationWorkerQueue();
  const review = await readStableRegistryReleaseCenter({ writesEnabled: true });
  if (!review.latestRelease || review.latestRelease.state !== "review_ready") {
    throw new Error(
      "Foundation worker did not produce a review-ready release.",
    );
  }
  if (review.exceptionGroups.length !== 2) {
    throw new Error(
      "Foundation worker did not preserve both bounded exception groups.",
    );
  }

  for (const group of review.exceptionGroups) {
    const decision = await decideFoundationExceptionGroup(scope, {
      releaseId: review.latestRelease.id,
      groupId: group.id,
      expectedVersion: group.expectedVersion,
      action: "defer",
      writesEnabled: true,
    });
    if (decision.outcome !== "accepted") {
      throw new Error("Foundation exception group decision did not complete.");
    }
  }

  const preview = await approveFoundationPreview(scope, {
    releaseId: review.latestRelease.id,
    writesEnabled: true,
  });
  if (preview.outcome !== "accepted" || !preview.release?.previewDigest) {
    throw new Error(
      "Foundation preview was not approved after resolving groups.",
    );
  }
  await assertApprovedPreviewImmutable(
    preview.release.id,
    preview.release.previewDigest,
  );

  const activations = await Promise.all(
    Array.from({ length: 2 }, () =>
      activateFoundationRelease(scope, {
        releaseId: preview.release!.id,
        previewDigest: preview.release!.previewDigest!,
        writesEnabled: true,
      }),
    ),
  );
  if (activations.some((result) => result.outcome !== "accepted")) {
    throw new Error(
      "Foundation activation race did not converge to a bounded receipt.",
    );
  }

  const receipt = await readSafeReceipt();
  if (
    receipt.activeReleaseCount !== 1 ||
    receipt.activationCount !== 1 ||
    receipt.searchOutboxCount !== 1 ||
    receipt.foundationJobDoneCount !== 1 ||
    receipt.sourceDerivedCatalogCount !== 0
  ) {
    throw new Error(
      "Foundation local activation receipt did not preserve its invariants.",
    );
  }
  await assertRegistryActorErasureRekey(preview.release.id);

  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: "ove255.stableRegistryFoundationLocalProof.v2",
      state: "active",
      activeReleaseCount: receipt.activeReleaseCount,
      activationCount: receipt.activationCount,
      searchOutboxCount: receipt.searchOutboxCount,
      foundationJobDoneCount: receipt.foundationJobDoneCount,
      sourceDerivedCatalogCount: receipt.sourceDerivedCatalogCount,
      exceptionGroupCount: review.exceptionGroups.length,
      buildRaceReceipts: drafts.length,
      activationRaceReceipts: activations.length,
      immutableActorErasureRekey: true,
    })}\n`,
  );
}

function assertArguments() {
  if (
    argumentValue("--environment") !== "local" ||
    argumentValue("--confirm-environment") !== "local"
  ) {
    throw new Error(
      "Local proof requires --environment local --confirm-environment local.",
    );
  }
}

function assertDisposableDatabase() {
  const databaseUrl = new URL(requiredEnv("DATABASE_URL"));
  if (!databaseUrl.pathname.startsWith(DISPOSABLE_DATABASE_PREFIX)) {
    throw new Error(
      "Local Foundation proof requires a dedicated disposable OVE-255 database.",
    );
  }
}

async function insertCompletedFixtureCapture(input: {
  sourceSnapshotId: string;
  captureId: string;
}) {
  const marker = randomUUID();
  const observedAt = new Date();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("catalog_source_snapshots")
      .values({
        id: input.sourceSnapshotId,
        source_slug: "eppo-codes",
        source_name: "Observed source fixture",
        source_category: "catalog_reference",
        source_version: `ove255-${marker}`,
        source_url: "https://example.invalid/observed-source-fixture",
        license: "Open Licence",
        license_url: "https://example.invalid/open-licence",
        attribution_required: true,
        attribution_text: "Observed source fixture attribution",
        allowed_usage: { product: false },
        parser_version: "ove255.fixture.v1",
        payload_sha256: SHA256,
        fetched_at: observedAt,
        verified_at: observedAt,
        status: "imported",
      })
      .execute();
    await trx
      .insertInto("catalog_source_capture_runs")
      .values({
        id: input.captureId,
        source_slug: "eppo-codes",
        source_snapshot_id: input.sourceSnapshotId,
        capture_schema_version: "ove254.eppoObservedCapture.v1",
        capture_tool_revision: TOOL_REVISION,
        upstream_authority_class: "observed_capture",
        state: "completed",
        source_host: "api.eppo.int",
        endpoint_family: "gd/v2",
        request_schema_version: "eppo.gd.v2.2026-08",
        openapi_sha256: SHA256,
        license_sha256: SHA256,
        observed_started_at: observedAt,
        observed_ended_at: observedAt,
        inventory_start_total: 2,
        inventory_end_total: 2,
        inventory_unique_codes: 2,
        inventory_page_count: 1,
        inventory_start_sha256: SHA256,
        inventory_end_sha256: SHA256,
        manifest_sha256: SHA256,
        terminal_counts: { captured: 2 },
        rights_counts: { source_public: 2 },
        preflight_receipt: { status: "passed" },
        zero_product_baseline: { catalogItems: 0 },
        zero_product_receipt: { passed: true },
        retry_count: 0,
      })
      .execute();
    await trx
      .insertInto("catalog_source_records")
      .values([
        {
          source_snapshot_id: input.sourceSnapshotId,
          source_record_id: `fixture-active-${marker}`,
          raw_payload: {},
          raw_payload_sha256: SHA256,
          source_only_fields: {},
          allowed_projection: {
            taxon_overview: {
              is_active: true,
              datatype: "plant",
              prefname: "Fixture",
            },
            taxon_taxonomy: [{ level: "species" }],
          },
          projection_status: "quarantined",
        },
        {
          source_snapshot_id: input.sourceSnapshotId,
          source_record_id: `fixture-source-only-${marker}`,
          raw_payload: {},
          raw_payload_sha256: SHA256,
          source_only_fields: {},
          allowed_projection: {},
          projection_status: "quarantined",
        },
      ])
      .execute();
  });
}

function runFoundationWorkerQueue() {
  const matchingRoot = path.resolve(process.cwd(), "../../services/matching");
  const command = [
    "from app.worker import _ActiveClaimLease, _claim, _process_claimed_job",
    "import os",
    "import psycopg",
    "from psycopg.rows import dict_row",
    "conn = psycopg.connect(os.environ['DIRECT_URL'], autocommit=True, row_factory=dict_row)",
    "job = _claim(conn)",
    "assert job is not None, 'foundation_job_not_claimed'",
    "_process_claimed_job(conn, job, _ActiveClaimLease())",
    "conn.close()",
  ].join("; ");
  const result = spawnSync("uv", ["run", "--frozen", "python", "-c", command], {
    cwd: matchingRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      "Foundation worker fixture failed without a safe completion receipt.",
    );
  }
}

async function readSafeReceipt() {
  const result = await sql<{
    activeReleaseCount: number;
    activationCount: number;
    searchOutboxCount: number;
    foundationJobDoneCount: number;
    sourceDerivedCatalogCount: number;
  }>`
    select
      (select count(*)::int from catalog_registry_active_pointers where release_family = 'foundation' and active_release_id is not null) as "activeReleaseCount",
      (select count(*)::int from catalog_registry_activations) as "activationCount",
      (select count(*)::int from catalog_registry_search_outbox) as "searchOutboxCount",
      (select count(*)::int from job_queue where payload->>'kind' = 'stable_registry_foundation_build' and status = 'done') as "foundationJobDoneCount",
      (select count(*)::int from catalog_items where source = 'eppo-codes') as "sourceDerivedCatalogCount"
  `.execute(db);
  const receipt = result.rows[0];
  if (!receipt) throw new Error("Foundation local receipt was unavailable.");
  return receipt;
}

async function assertApprovedPreviewImmutable(
  releaseId: string,
  previewDigest: string,
) {
  let rejected = false;
  try {
    await sql`
      update catalog_registry_releases
      set preview_digest = ${previewDigest === SHA256 ? "b".repeat(64) : SHA256}
      where id = ${releaseId}::uuid
    `.execute(db);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error("Approved preview digest was mutable.");
  }
}

async function assertRegistryActorErasureRekey(releaseId: string) {
  let appendOnlyRejected = false;
  try {
    await sql`
      update catalog_registry_decisions
      set decided_by_user_id = ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid
      where release_id = ${releaseId}::uuid
    `.execute(db);
  } catch {
    appendOnlyRejected = true;
  }
  if (!appendOnlyRejected) {
    throw new Error(
      "Registry decision attribution changed without erasure gate.",
    );
  }

  await db.transaction().execute(async (trx) => {
    await buildRekeyStableRegistryActorsForErasureQuery(trx, {
      requesterUserId: OPERATOR_ID,
      erasedSubjectUserId: ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID,
    }).execute();
  });

  const result = await sql<{
    releaseActorCount: number;
    decisionActorCount: number;
    activationActorCount: number;
  }>`
    select
      (select count(*)::int from catalog_registry_releases
        where id = ${releaseId}::uuid
          and created_by_user_id = ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid
          and approved_by_user_id = ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid
          and activated_by_user_id = ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid) as "releaseActorCount",
      (select count(*)::int from catalog_registry_decisions
        where release_id = ${releaseId}::uuid
          and decided_by_user_id = ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid) as "decisionActorCount",
      (select count(*)::int from catalog_registry_activations
        where release_id = ${releaseId}::uuid
          and activated_by_user_id = ${ERASURE_MODERATION_ACTOR_TOMBSTONE_USER_ID}::uuid) as "activationActorCount"
  `.execute(db);
  const receipt = result.rows[0];
  if (
    !receipt ||
    receipt.releaseActorCount !== 1 ||
    receipt.decisionActorCount !== 2 ||
    receipt.activationActorCount !== 1
  ) {
    throw new Error(
      "Registry immutable actor attribution was not safely rekeyed for erasure.",
    );
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Foundation local proof failed.",
    );
    process.exitCode = 1;
  });
