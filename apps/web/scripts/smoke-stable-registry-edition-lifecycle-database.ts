import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";
import {
  assertNoForbiddenEditionMarkers,
  EDITION_INTERACTION_BUDGET_MS,
  roundMs,
  type EditionSmokeReceipt,
} from "./smoke-stable-registry-edition-lifecycle";

/**
 * Applies the Stable Registry migrations and exercises them inside one
 * transaction that always rolls back.
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
    // The proof owns the schema it asserts against. Applying the Stable
    // Registry migrations here — inside the transaction that always rolls back
    // — means this runs against current `main`'s schema rather than whatever a
    // developer's local database happens to have replayed, and it mutates
    // nothing permanently.
    await applyStableRegistryMigrations(client);
    const ids = await seedTwoReleasesAndOneObject(client);

    // Preparing and building an edition is the step that creates the release
    // the pointer later moves onto. It runs before the pointer proof because a
    // lifecycle that cannot produce a reviewable edition has nothing to
    // activate.
    await proveOneEditionIsPreparedAndBuilt(client, ids);

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

/**
 * Replays exactly the migrations this proof asserts against.
 *
 * `0023` owns the source capture, `0024` the release model and its transition
 * guard, and `0028` the edition diffs, relations, and activation sequence.
 * `0028` reads nothing from the public, product, or extension-pack projections,
 * so those are deliberately not replayed here — this proof owns the edition
 * lifecycle and should fail only for edition reasons.
 *
 * All three are additive and idempotent, so replaying them over an
 * already-migrated database is a no-op, and the surrounding rollback discards
 * everything either way.
 */
const EDITION_LIFECYCLE_MIGRATIONS = /^(0023|0024|0028)_/u;

/**
 * Every table those three migrations own, in dependency order.
 *
 * They are recreated rather than replayed over, because each migration creates
 * its tables `if not exists`: replaying alone would silently keep an older
 * shape a developer's database happens to hold and prove nothing about current
 * `main`. All of them are capture, release, and edition evidence with no
 * external referent, and the emptiness check below is what makes recreating
 * them safe.
 */
const EDITION_LIFECYCLE_TABLES = [
  "catalog_registry_activation_sequence",
  "catalog_registry_item_relations",
  "catalog_registry_edition_diffs",
  "catalog_registry_search_outbox",
  "catalog_registry_activations",
  "catalog_registry_active_pointers",
  "catalog_registry_decisions",
  "catalog_registry_exception_groups",
  "catalog_registry_release_members",
  "catalog_registry_releases",
  "catalog_item_revisions",
  "catalog_source_capture_units",
  "catalog_source_capture_runs",
] as const;

async function applyStableRegistryMigrations(client: PoolClient) {
  // Refuse to recreate anything that holds rows. A populated table here means
  // this database is not the disposable local one this proof is written for,
  // and the proof stops rather than discarding evidence — even inside a
  // transaction that would roll it back.
  for (const table of EDITION_LIFECYCLE_TABLES) {
    const existing = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
        where table_schema = 'public' and table_name = $1`,
      [table],
    );
    if (existing.rows[0]?.count === "0") continue;
    const rows = await client.query<{ count: string }>(
      `select count(*)::text as count from "${table}"`,
    );
    if (rows.rows[0]?.count !== "0") {
      throw new Error(`edition_lifecycle_table_not_disposable:${table}`);
    }
  }
  await client.query(
    `drop table if exists ${EDITION_LIFECYCLE_TABLES.map(
      (table) => `"${table}"`,
    ).join(", ")} cascade`,
  );

  const migrations = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  const applied = migrations.filter((migration) =>
    EDITION_LIFECYCLE_MIGRATIONS.test(migration.name),
  );
  if (applied.length !== 3) {
    throw new Error("edition_lifecycle_migrations_missing");
  }
  for (const migration of applied) {
    await client.query(migration.sql);
  }
}

/**
 * Proves the prepare-and-build path against the real schema and its guards.
 *
 * The worker's statements are exercised here rather than asserted in the
 * abstract, because both halves of this transition are enforced by objects a
 * fake connection cannot see: the column set of `catalog_registry_releases`,
 * and the OVE-255 trigger that holds a release's identity immutable while
 * admitting `draft -> building -> review_ready`. A statement that writes a
 * column the schema does not define, or that rewrites `build_digest` on
 * completion, fails here and only here.
 */
async function proveOneEditionIsPreparedAndBuilt(
  client: PoolClient,
  ids: SeedIds,
) {
  const releaseId = randomUUID();
  const identityDigest = sha256(`prepare|${releaseId}`);

  // prepareEdition: one draft edition succeeding the active release.
  await client.query(
    `insert into catalog_registry_releases (
       id, release_kind, state, capture_id, source_snapshot_id,
       predecessor_release_id, policy_version, build_digest, created_by_user_id
     ) values ($1,'edition','draft',$2,$3,$4,'ove258.edition.v1',$5,$6)`,
    [
      releaseId,
      ids.capture,
      ids.snapshot,
      ids.foundation,
      identityDigest,
      ids.owner,
    ],
  );

  // Worker, first transaction: draft -> building.
  const started = await client.query(
    `update catalog_registry_releases
        set state = 'building', build_started_at = now(),
            version = version + 1, updated_at = now()
      where id = $1 and state = 'draft'
      returning id`,
    [releaseId],
  );
  if (started.rowCount !== 1) {
    throw new Error("edition_build_could_not_start");
  }

  // Worker: one grouped, aggregate-only row per derived class.
  for (const [diffClass, memberCount] of [
    ["unchanged", 2],
    ["addition", 1],
    ["correction", 1],
    ["supersession", 1],
    ["rights_change", 1],
  ] as const) {
    await client.query(
      `insert into catalog_registry_edition_diffs (
         release_id, prior_release_id, diff_class, group_key, member_count,
         affected_object_count, affected_object_digest, state, safe_summary
       ) values ($1,$2,$3,$4,$5,$6,$7,'open',
         jsonb_build_object('memberCount', $5::int, 'affectedObjectCount', $6::int))
       on conflict (release_id, group_key) do nothing`,
      [
        releaseId,
        ids.foundation,
        diffClass,
        sha256(`group|${releaseId}|${diffClass}`),
        memberCount,
        0,
        sha256(`affected|${releaseId}|${diffClass}`),
      ],
    );
  }

  // Worker, completion: building -> review_ready carrying the aggregate
  // summary. `build_digest` is release identity and is never rewritten here.
  const completed = await client.query(
    `update catalog_registry_releases
        set state = 'review_ready', safe_summary = $1::jsonb,
            review_ready_at = now(), version = version + 1, updated_at = now()
      where id = $2 and state = 'building'
      returning id`,
    [
      JSON.stringify({
        policyVersion: "ove258.edition.v1",
        diffDigest: sha256(`diff|${releaseId}`),
        counts: {
          unchanged: 2,
          addition: 1,
          correction: 1,
          supersession: 1,
          rights_change: 1,
        },
      }),
      releaseId,
    ],
  );
  if (completed.rowCount !== 1) {
    throw new Error("edition_build_could_not_complete");
  }

  // The identity the draft was opened with survived the build.
  const identity = await client.query<{
    build_digest: string;
    state: string;
    review_ready_at: Date | null;
  }>(
    `select build_digest, state, review_ready_at
       from catalog_registry_releases where id = $1`,
    [releaseId],
  );
  if (identity.rows[0]?.build_digest !== identityDigest) {
    throw new Error("edition_build_rewrote_release_identity");
  }
  if (identity.rows[0]?.state !== "review_ready") {
    throw new Error("edition_build_did_not_reach_review_ready");
  }
  if (!identity.rows[0]?.review_ready_at) {
    throw new Error("edition_build_left_no_review_receipt");
  }

  // Five groups, and the owner's review has real work in it.
  const groups = await client.query<{ count: string }>(
    `select count(*)::text as count
       from catalog_registry_edition_diffs where release_id = $1`,
    [releaseId],
  );
  if (Number(groups.rows[0]?.count ?? 0) !== 5) {
    throw new Error("edition_build_did_not_group_every_class");
  }

  // A built edition must not touch the active pointer: preparing is a
  // comparison, and only a receipted activation moves what gardeners read.
  const pointer = await client.query<{ active_release_id: string | null }>(
    `select active_release_id from catalog_registry_active_pointers
      where release_family = 'foundation'`,
  );
  if (pointer.rows[0]?.active_release_id !== ids.foundation) {
    throw new Error("edition_build_moved_the_active_pointer");
  }
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

/**
 * A real digest, because these values are unique keys.
 *
 * `sha256Like` hex-encodes its seed, so only the seed's first 32 characters
 * survive the 64-character slice. Seeds that share a UUID prefix collapse to
 * one value, which silently turns five diff groups into one.
 */
function sha256(seed: string) {
  return createHash("sha256").update(seed).digest("hex");
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
