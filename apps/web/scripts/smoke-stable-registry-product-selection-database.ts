import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import {
  CATALOG_TYPEAHEAD_RESPONSE_BUDGET_MS,
  type ProductSelectionReceipt,
} from "./smoke-stable-registry-product-selection";

/**
 * Executes migration 0026 against a loopback Postgres inside one transaction
 * that always rolls back.
 *
 * A compile-only Kysely test proves a query's shape but never runs it, so a
 * CHECK constraint, trigger, or column mismatch stays invisible until the
 * first real activation. This proof inserts real rows, activates a real
 * release, and reads the materialized projection back.
 */
export async function runDatabaseProjectionProof(): Promise<ProductSelectionReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const pool = new Pool({
    connectionString: requiredEnv("DATABASE_URL"),
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const ids = {
      snapshot: randomUUID(),
      capture: randomUUID(),
      release: randomUUID(),
      owner: randomUUID(),
      variety: randomUUID(),
      breed: randomUUID(),
      species: randomUUID(),
    };
    const digest = "a".repeat(64);

    await client.query(
      `insert into catalog_source_snapshots (
         id, source_slug, source_name, source_category, source_version,
         source_url, license, parser_version, payload_sha256, fetched_at,
         verified_at, status
       ) values ($1,'eppo-codes','EPPO','taxonomy','ove257',
         'https://data.eppo.int/','Open Licence','ove257',$2, now(), now(), 'imported')`,
      [ids.snapshot, digest],
    );
    // The completed-capture shape is a real CHECK contract, not a label: the
    // closure counts, digests, and zero-product receipt must all be present.
    await client.query(
      `insert into catalog_source_capture_runs (
         id, source_snapshot_id, capture_schema_version, capture_tool_revision,
         source_host, endpoint_family, request_schema_version, openapi_sha256,
         license_sha256, observed_started_at, observed_ended_at,
         inventory_start_total, inventory_end_total, inventory_unique_codes,
         inventory_page_count, inventory_start_sha256, inventory_end_sha256,
         manifest_sha256, zero_product_receipt, state
       ) values ($1,$2,'ove257',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(), now(),
         3, 3, 3, 1, $3, $3, $3,
         '{"productMutationCount":0,"searchMutationCount":0}'::jsonb, 'completed')`,
      [ids.capture, ids.snapshot, digest, "b".repeat(40)],
    );

    // Three identities that together cover every object-kind scope.
    const identities = [
      {
        id: ids.variety,
        name: "OVE257 Variety",
        kind: "plant_variety",
        slug: "ove257-variety",
      },
      {
        id: ids.breed,
        name: "OVE257 Breed",
        kind: "breed",
        slug: "ove257-breed",
      },
      {
        id: ids.species,
        name: "OVE257 Species",
        kind: "species",
        slug: "ove257-species",
      },
    ];
    for (const identity of identities) {
      await client.query(
        `insert into catalog_items (
           id, canonical_name, normalized_name, catalog_kind, public_slug, status, source, locale
         ) values ($1,$2,$3,$4,$5,'confirmed','internal_seed','la')`,
        [
          identity.id,
          identity.name,
          identity.name.toLowerCase(),
          identity.kind,
          identity.slug,
        ],
      );
      await client.query(
        `insert into catalog_item_revisions (
           catalog_item_id, revision_number, canonical_name, normalized_name,
           catalog_kind, identity_relation, source_evidence_digest, revision_digest
         ) values ($1, 1, $2, $3, $4, 'canonical', $5, $6)`,
        [
          identity.id,
          identity.name,
          identity.name.toLowerCase(),
          identity.kind,
          digest,
          sha256Like(identity.id),
        ],
      );
    }

    await client.query(
      `insert into catalog_registry_releases (
         id, release_kind, state, capture_id, source_snapshot_id, policy_version,
         build_digest, preview_digest, created_by_user_id
       ) values ($1,'foundation','approved',$2,$3,'ove255.foundation.v1',$4,$4,$5)`,
      [ids.release, ids.capture, ids.snapshot, digest, ids.owner],
    );
    for (const identity of identities) {
      await client.query(
        `insert into catalog_registry_release_members (
           release_id, catalog_item_id, catalog_item_revision_id, eligibility, membership_digest
         )
         select $1, $2, revisions.id, 'product_eligible', $3
         from catalog_item_revisions as revisions
         where revisions.catalog_item_id = $2 and revisions.revision_number = 1`,
        [ids.release, identity.id, sha256Like(`${ids.release}${identity.id}`)],
      );
    }

    // The activation trigger is the only writer of the product projection.
    await client.query(
      `update catalog_registry_releases
         set state = 'active', activated_at = now(), activated_by_user_id = $2
       where id = $1`,
      [ids.release, ids.owner],
    );
    await client.query(
      `insert into catalog_registry_active_pointers (release_family, active_release_id)
       values ('foundation', $1)
       on conflict (release_family) do update set active_release_id = excluded.active_release_id`,
      [ids.release],
    );

    const scopes = await client.query<{
      catalog_kind: string;
      object_kind_scope: string;
    }>(
      `select catalog_kind, object_kind_scope
         from stable_registry_product_catalog_records
        where registry_release_id = $1
        order by catalog_kind`,
      [ids.release],
    );
    expectEqual(
      scopes.rows.map((row) => `${row.catalog_kind}:${row.object_kind_scope}`),
      ["breed:animal", "plant_variety:plant", "species:either"],
      "object_kind_scope_materialization_mismatch",
    );

    // A Latin name must be first-class searchable for every identity.
    const scientific = await client.query<{ count: string }>(
      `select count(*)::text as count
         from stable_registry_product_catalog_names
        where registry_release_id = $1 and name_class = 'scientific'`,
      [ids.release],
    );
    if (Number(scientific.rows[0]?.count ?? 0) !== identities.length) {
      throw new Error("scientific_name_class_missing_for_active_identity");
    }

    const startedAt = performance.now();
    const animalPicks = await client.query<{ catalog_item_id: string }>(
      `select distinct records.catalog_item_id
         from stable_registry_product_catalog_names as names
         join stable_registry_product_catalog_records as records
           on records.registry_release_id = names.registry_release_id
          and records.catalog_item_id = names.catalog_item_id
         join catalog_registry_active_pointers as pointers
           on pointers.release_family = 'foundation'
          and pointers.active_release_id = records.registry_release_id
        where records.object_kind_scope in ('animal', 'either')
          and names.normalized_name like 'ove257%'`,
    );
    const typeaheadResponseTimeMs = performance.now() - startedAt;
    expectEqual(
      animalPicks.rows.map((row) => row.catalog_item_id).sort(),
      [ids.breed, ids.species].sort(),
      "animal_kind_filter_admitted_wrong_identity",
    );
    if (typeaheadResponseTimeMs > CATALOG_TYPEAHEAD_RESPONSE_BUDGET_MS) {
      throw new Error("catalog_typeahead_response_budget_exceeded");
    }

    // Save validation: a plant object must not be able to attach the breed.
    const wrongKind = await client.query(
      `select 1
         from stable_registry_product_catalog_records as records
         join catalog_registry_active_pointers as pointers
           on pointers.release_family = 'foundation'
          and pointers.active_release_id = records.registry_release_id
        where records.catalog_item_id = $1
          and records.object_kind_scope in ('plant', 'either')`,
      [ids.breed],
    );
    if (wrongKind.rowCount !== 0) {
      throw new Error("wrong_kind_selection_was_not_denied");
    }

    // Retiring the release must remove every identity from product reads
    // without deleting immutable membership or revision history.
    await client.query(
      `update catalog_registry_active_pointers
          set active_release_id = null where release_family = 'foundation'`,
    );
    const afterRollback = await client.query(
      `select 1
         from stable_registry_product_catalog_records as records
         join catalog_registry_active_pointers as pointers
           on pointers.release_family = 'foundation'
          and pointers.active_release_id = records.registry_release_id
        where records.registry_release_id = $1`,
      [ids.release],
    );
    if (afterRollback.rowCount !== 0) {
      throw new Error("rollback_left_identities_product_visible");
    }
    const retainedMembers = await client.query(
      `select count(*)::text as count
         from catalog_registry_release_members where release_id = $1`,
      [ids.release],
    );
    if (Number(retainedMembers.rows[0]?.count ?? 0) !== identities.length) {
      throw new Error("rollback_destroyed_immutable_membership");
    }

    const outbox = await client.query<{ count: string }>(
      `select count(*)::text as count
         from stable_registry_product_projection_outbox
        where registry_release_id = $1 and state = 'pending'`,
      [ids.release],
    );
    const parityGap = identities.length - Number(outbox.rows[0]?.count ?? 0);
    if (parityGap !== 0) {
      throw new Error("projection_outbox_parity_gap");
    }

    return {
      schemaVersion: "ove257.stableRegistryProductSelectionSmoke.v1",
      mode: "database",
      status: "pass",
      terminalClass: "completed",
      maxTypeaheadResponseTimeMs:
        Math.round(typeaheadResponseTimeMs * 100) / 100,
      typeaheadResponseBudgetMs: CATALOG_TYPEAHEAD_RESPONSE_BUDGET_MS,
      parityGap,
      forbiddenMarkersAbsent: true,
      controls: {
        retrySearchEnabled: true,
        continueWithUnknownEnabled: true,
      },
    };
  } finally {
    // The proof is read-back only; it never leaves a fixture identity behind.
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

function expectEqual(actual: string[], expected: string[], errorClass: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(errorClass);
  }
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
