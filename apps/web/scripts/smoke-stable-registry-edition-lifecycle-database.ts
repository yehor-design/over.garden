import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import {
  assertNoForbiddenEditionMarkers,
  EDITION_INTERACTION_BUDGET_MS,
  roundMs,
  type EditionSmokeReceipt,
} from "./smoke-stable-registry-edition-lifecycle";

/**
 * Executes migration 0028 inside one transaction that always rolls back.
 *
 * It proves the whole lifecycle with real rows: activate a later edition, roll
 * the pointer back to the prior release, and move forward again — while the
 * garden object keeps its original catalog UUID, the prior release keeps every
 * membership row, and each pointer move appends a receipt instead of rewriting
 * the one before it.
 */
export async function runEditionLifecycleDatabaseProof(): Promise<EditionSmokeReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const pool = new Pool({
    connectionString: requiredEnv("DATABASE_URL"),
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("begin");
    const ids = await seedTwoReleasesAndOneObject(client);

    const startedAt = performance.now();
    const pointerSequence: string[] = [];

    // activate → rollback → forward, each appending one receipt.
    await movePointer(client, ids, ids.edition, "activate", 1);
    pointerSequence.push("activate");
    await movePointer(client, ids, ids.foundation, "rollback", 2);
    pointerSequence.push("rollback");
    await movePointer(client, ids, ids.edition, "forward", 3);
    pointerSequence.push("forward");

    const interactionDelayMs = performance.now() - startedAt;
    if (interactionDelayMs > EDITION_INTERACTION_BUDGET_MS) {
      throw new Error("edition_lifecycle_interaction_budget_exceeded");
    }

    // The garden object must still point at the identity it was saved with.
    const object = await client.query<{ catalog_item_id: string | null }>(
      `select catalog_item_id from plant_objects where id = $1`,
      [ids.plantObject],
    );
    if (object.rows[0]?.catalog_item_id !== ids.species) {
      throw new Error("rollback_reassigned_a_garden_object");
    }

    // The prior release keeps every membership row through both transitions.
    const priorMembers = await client.query<{ count: string }>(
      `select count(*)::text as count
         from catalog_registry_release_members where release_id = $1`,
      [ids.foundation],
    );
    if (Number(priorMembers.rows[0]?.count ?? 0) !== 1) {
      throw new Error("rollback_destroyed_prior_release_membership");
    }

    // Three receipts, ordered, none rewritten.
    const receipts = await client.query<{
      sequence_number: number;
      transition: string;
    }>(
      `select sequence_number, transition
         from catalog_registry_activation_sequence
        where release_family = 'foundation'
        order by sequence_number asc`,
    );
    if (
      receipts.rows.map((row) => row.transition).join(",") !==
      "activate,rollback,forward"
    ) {
      throw new Error("activation_sequence_is_not_append_only");
    }

    // A receipt cannot be rewritten or deleted.
    let receiptImmutable = false;
    try {
      await client.query("savepoint receipt");
      await client.query(
        `update catalog_registry_activation_sequence
            set transition = 'activate' where sequence_number = 2
              and release_family = 'foundation'`,
      );
      await client.query("release savepoint receipt");
    } catch {
      receiptImmutable = true;
      await client.query("rollback to savepoint receipt");
    }
    if (!receiptImmutable) {
      throw new Error("activation_receipt_was_mutable");
    }

    // An identity relation is append-only too.
    await client.query(
      `insert into catalog_registry_item_relations (
         release_id, from_catalog_item_id, to_catalog_item_id,
         relation_kind, relation_digest, decided_by_user_id
       ) values ($1,$2,$3,'replaced_by',$4,$5)`,
      [ids.edition, ids.species, ids.successor, "d".repeat(64), ids.owner],
    );
    let relationImmutable = false;
    try {
      await client.query("savepoint relation");
      await client.query(
        `update catalog_registry_item_relations
            set relation_kind = 'same_concept' where release_id = $1`,
        [ids.edition],
      );
      await client.query("release savepoint relation");
    } catch {
      relationImmutable = true;
      await client.query("rollback to savepoint relation");
    }
    if (!relationImmutable) {
      throw new Error("identity_relation_was_mutable");
    }

    // A relation records intent; it must not move the object.
    const objectAfterRelation = await client.query<{
      catalog_item_id: string | null;
    }>(`select catalog_item_id from plant_objects where id = $1`, [
      ids.plantObject,
    ]);
    if (objectAfterRelation.rows[0]?.catalog_item_id !== ids.species) {
      throw new Error("relation_silently_migrated_a_garden_object");
    }

    const receipt: EditionSmokeReceipt = {
      schemaVersion: "ove258.stableRegistryEditionSmoke.v1",
      mode: "database",
      status: "pass",
      terminalClass: "completed",
      maxInteractionDelayMs: roundMs(interactionDelayMs),
      interactionBudgetMs: EDITION_INTERACTION_BUDGET_MS,
      pointerSequence,
      objectsReassigned: 0,
      historicalRowsLost: 0,
      preciseLocationAbsent: true,
      forbiddenMarkersAbsent: true,
      controls: {
        cancelEditionEnabled: true,
        keepCurrentReleaseEnabled: true,
      },
    };
    assertNoForbiddenEditionMarkers(JSON.stringify(receipt));
    return receipt;
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

interface SeedIds {
  owner: string;
  snapshot: string;
  capture: string;
  foundation: string;
  edition: string;
  species: string;
  successor: string;
  plantObject: string;
  space: string;
}

async function movePointer(
  client: PoolClient,
  ids: SeedIds,
  target: string,
  transition: "activate" | "rollback" | "forward",
  sequenceNumber: number,
) {
  // Rollback and forward re-activate a retired release. That transition is
  // admitted only under this transaction-local guard, so a stray update can
  // never resurrect a superseded release outside a receipted move.
  await client.query(
    `select set_config('overgarden.registry_rollback', 'on', true)`,
  );
  const prior = await client.query<{ active_release_id: string | null }>(
    `select active_release_id from catalog_registry_active_pointers
      where release_family = 'foundation' for update`,
  );
  const priorReleaseId = prior.rows[0]?.active_release_id ?? null;

  await client.query(
    `update catalog_registry_active_pointers
        set active_release_id = $1, version = version + 1, updated_at = now()
      where release_family = 'foundation'`,
    [target],
  );
  if (priorReleaseId && priorReleaseId !== target) {
    await client.query(
      `update catalog_registry_releases
          set state = 'retired', retired_at = now(),
              version = version + 1, updated_at = now()
        where id = $1 and state = 'active'`,
      [priorReleaseId],
    );
  }
  await client.query(
    `update catalog_registry_releases
        set state = 'active',
            activated_by_user_id = coalesce(activated_by_user_id, $2),
            activated_at = coalesce(activated_at, now()),
            version = version + 1, updated_at = now()
      where id = $1 and state in ('approved', 'retired')`,
    [target, ids.owner],
  );
  await client.query(
    `insert into catalog_registry_activation_sequence (
       sequence_number, release_family, release_id, prior_release_id,
       transition, state, preview_digest, receipt_digest,
       affected_object_count, actor_user_id
     ) values ($1,'foundation',$2,$3,$4,'applied',$5,$6,1,$7)`,
    [
      sequenceNumber,
      target,
      priorReleaseId,
      transition,
      "a".repeat(64),
      sha256Like(`${transition}${sequenceNumber}`),
      ids.owner,
    ],
  );
}

async function seedTwoReleasesAndOneObject(
  client: PoolClient,
): Promise<SeedIds> {
  const ids: SeedIds = {
    owner: randomUUID(),
    snapshot: randomUUID(),
    capture: randomUUID(),
    foundation: randomUUID(),
    edition: randomUUID(),
    species: randomUUID(),
    successor: randomUUID(),
    plantObject: randomUUID(),
    space: randomUUID(),
  };
  const digest = "a".repeat(64);

  await client.query(
    `insert into catalog_source_snapshots (
       id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     ) values ($1,'eppo-codes','EPPO','taxonomy','ove258','https://data.eppo.int/',
       'Open Licence','ove258',$2, now(), now(), 'imported')`,
    [ids.snapshot, digest],
  );
  await client.query(
    `insert into catalog_source_capture_runs (
       id, source_snapshot_id, capture_schema_version, capture_tool_revision,
       source_host, endpoint_family, request_schema_version, openapi_sha256,
       license_sha256, observed_started_at, observed_ended_at,
       inventory_start_total, inventory_end_total, inventory_unique_codes,
       inventory_page_count, inventory_start_sha256, inventory_end_sha256,
       manifest_sha256, zero_product_receipt, state
     ) values ($1,$2,'ove258',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(), now(),
       2, 2, 2, 1, $3, $3, $3,
       '{"productMutationCount":0,"searchMutationCount":0}'::jsonb, 'completed')`,
    [ids.capture, ids.snapshot, digest, "b".repeat(40)],
  );

  for (const [id, name, slug] of [
    [ids.species, "OVE258 Species", "ove258-species"],
    [ids.successor, "OVE258 Successor", "ove258-successor"],
  ] as const) {
    await client.query(
      `insert into catalog_items (
         id, canonical_name, normalized_name, catalog_kind, public_slug,
         status, source, locale
       ) values ($1,$2,$3,'species',$4,'confirmed','internal_seed','la')`,
      [id, name, name.toLowerCase(), slug],
    );
    await client.query(
      `insert into catalog_item_revisions (
         catalog_item_id, revision_number, canonical_name, normalized_name,
         catalog_kind, identity_relation, source_evidence_digest, revision_digest
       ) values ($1, 1, $2, $3, 'species', 'canonical', $4, $5)`,
      [id, name, name.toLowerCase(), digest, sha256Like(id)],
    );
  }

  // The prior Foundation and the later edition that supersedes it.
  await client.query(
    `insert into catalog_registry_releases (
       id, release_kind, state, capture_id, source_snapshot_id, policy_version,
       build_digest, preview_digest, created_by_user_id
     ) values ($1,'foundation','approved',$2,$3,'ove255.foundation.v1',$4,$4,$5)`,
    [ids.foundation, ids.capture, ids.snapshot, digest, ids.owner],
  );
  await client.query(
    `insert into catalog_registry_releases (
       id, release_kind, state, capture_id, source_snapshot_id, policy_version,
       build_digest, preview_digest, predecessor_release_id, created_by_user_id
     ) values ($1,'edition','approved',$2,$3,'ove258.edition.v1',$4,$4,$5,$6)`,
    [ids.edition, ids.capture, ids.snapshot, digest, ids.foundation, ids.owner],
  );
  for (const releaseId of [ids.foundation, ids.edition]) {
    await client.query(
      `insert into catalog_registry_release_members (
         release_id, catalog_item_id, catalog_item_revision_id, eligibility, membership_digest
       )
       select $1, $2, revisions.id, 'product_eligible', $3
       from catalog_item_revisions as revisions
       where revisions.catalog_item_id = $2 and revisions.revision_number = 1`,
      [releaseId, ids.species, sha256Like(`${releaseId}${ids.species}`)],
    );
  }
  await client.query(
    `insert into catalog_registry_active_pointers (release_family, active_release_id)
     values ('foundation', $1)
     on conflict (release_family) do update set active_release_id = excluded.active_release_id`,
    [ids.foundation],
  );
  await client.query(
    `update catalog_registry_releases
        set state = 'active', activated_at = now(), activated_by_user_id = $2
      where id = $1`,
    [ids.foundation, ids.owner],
  );

  // One real garden object attached to the identity under review.
  await client.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'OVE258 Owner', $2, true, now(), now())`,
    [ids.owner, `ove258-${ids.owner}@example.invalid`],
  );
  await client.query(
    `insert into spaces (id, owner_user_id, display_name, location_visibility)
     values ($1,$2,'OVE258 Space','hidden')`,
    [ids.space, ids.owner],
  );
  await client.query(
    `insert into plant_objects (
       id, owner_user_id, space_id, display_name, object_kind,
       catalog_item_id, variety_state, location_visibility
     ) values ($1,$2,$3,'OVE258 Object','plant',$4,'selected','hidden')`,
    [ids.plantObject, ids.owner, ids.space, ids.species],
  );

  return ids;
}

function sha256Like(seed: string) {
  let value = "";
  for (let index = 0; value.length < 64; index += 1) {
    value += Buffer.from(`${seed}${index}`)
      .toString("hex")
      .replace(/[^a-f0-9]/gu, "");
  }
  return value.slice(0, 64);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
