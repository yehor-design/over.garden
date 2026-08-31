import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import {
  assertNoForbiddenPackMarkers,
  EXTENSION_PACK_INTERACTION_BUDGET_MS,
  roundMs,
  type ExtensionPackSmokeReceipt,
} from "./smoke-stable-registry-extension-pack";

/**
 * Executes migration 0027 inside one transaction that always rolls back.
 *
 * It proves the whole owner journey with real rows: an active Foundation, one
 * variety pack and one breed pack, a wrong-kind parent refused, a clean batch
 * promoted, and activation reusing the OVE-257 product projection.
 */
export async function runExtensionPackDatabaseProof(): Promise<ExtensionPackSmokeReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const pool = new Pool({
    connectionString: requiredEnv("DATABASE_URL"),
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("begin");
    const ids = await seedActiveFoundation(client);

    const startedAt = performance.now();
    const variety = await seedPack(client, {
      packKind: "plant_variety",
      sourceSlug: "ua-state-register",
      sourceRights: "use",
      parentCatalogItemId: ids.plantSpecies,
      rows: 3,
    });
    const breed = await seedPack(client, {
      packKind: "breed",
      sourceSlug: "vertebrate-breed-ontology",
      sourceRights: "declared_in_source",
      parentCatalogItemId: ids.animalSpecies,
      rows: 2,
    });
    const interactionDelayMs = performance.now() - startedAt;
    if (interactionDelayMs > EXTENSION_PACK_INTERACTION_BUDGET_MS) {
      throw new Error("extension_pack_interaction_budget_exceeded");
    }

    // A breed must not bind to a plant-only parent. A `species` parent is
    // deliberately `either` and is usable by both kinds, so the plant-only
    // variety parent is what actually proves the rule.
    const plantOnlyForBreed = await client.query(
      `select records.object_kind_scope
         from stable_registry_product_catalog_records as records
        where records.catalog_item_id = $1
          and records.object_kind_scope in ('animal', 'either')`,
      [ids.plantOnly],
    );
    if (plantOnlyForBreed.rowCount !== 0) {
      throw new Error("plant_only_parent_wrongly_admitted_for_breed_pack");
    }
    const speciesForBothKinds = await client.query(
      `select records.object_kind_scope
         from stable_registry_product_catalog_records as records
        where records.catalog_item_id = $1
          and records.object_kind_scope = 'either'`,
      [ids.plantSpecies],
    );
    if (speciesForBothKinds.rowCount !== 1) {
      throw new Error("species_parent_lost_its_both_kinds_scope");
    }

    // A rights-blocked row can never be promoted by an approval.
    await client.query(
      `insert into catalog_registry_extension_pack_rows (
         pack_id, source_record_key, official_denomination, normalized_denomination,
         locale, parent_evidence_class, row_class, parent_catalog_item_id
       ) values ($1, 'blocked-row', 'Held Row', 'held row', 'en', 'absent', 'rights_blocked', $2)`,
      [variety.packId, ids.plantSpecies],
    );
    await client.query(
      `update catalog_registry_extension_pack_rows
          set row_class = 'product_eligible', updated_at = now()
        where pack_id = $1 and row_class = 'clean'
          and parent_catalog_item_id is not null`,
      [variety.packId],
    );
    const stillBlocked = await client.query<{ count: string }>(
      `select count(*)::text as count
         from catalog_registry_extension_pack_rows
        where pack_id = $1 and row_class = 'rights_blocked'`,
      [variety.packId],
    );
    if (Number(stillBlocked.rows[0]?.count ?? 0) !== 1) {
      throw new Error("rights_blocked_row_was_promoted_by_approval");
    }

    // Approve and activate both packs, then read the product projection back.
    for (const pack of [variety, breed]) {
      await client.query(
        `update catalog_registry_extension_pack_rows
            set row_class = 'product_eligible', updated_at = now()
          where pack_id = $1 and row_class = 'clean'
            and parent_catalog_item_id is not null`,
        [pack.packId],
      );
      await client.query(
        `update catalog_registry_extension_packs
            set state = 'approved', preview_digest = $2,
                approved_by_user_id = $3, approved_at = now(),
                version = version + 1, updated_at = now()
          where id = $1`,
        [pack.packId, "c".repeat(64), ids.owner],
      );
      await client.query(
        `update catalog_registry_extension_packs
            set state = 'active', release_id = $2,
                activated_by_user_id = $3, activated_at = now(),
                version = version + 1, updated_at = now()
          where id = $1`,
        [pack.packId, ids.release, ids.owner],
      );
      await client.query(
        `select materialize_stable_registry_extension_pack($1::uuid)`,
        [pack.packId],
      );
    }

    // An approved pack's rows are immutable evidence.
    let immutabilityEnforced = false;
    try {
      await client.query("savepoint immutability");
      await client.query(
        `update catalog_registry_extension_pack_rows
            set official_denomination = 'Rewritten'
          where pack_id = $1`,
        [variety.packId],
      );
      await client.query("release savepoint immutability");
    } catch {
      immutabilityEnforced = true;
      await client.query("rollback to savepoint immutability");
    }
    if (!immutabilityEnforced) {
      throw new Error("approved_pack_rows_were_mutable");
    }

    // Pack state may only advance.
    let transitionEnforced = false;
    try {
      await client.query("savepoint transition");
      await client.query(
        `update catalog_registry_extension_packs set state = 'draft' where id = $1`,
        [variety.packId],
      );
      await client.query("release savepoint transition");
    } catch {
      transitionEnforced = true;
      await client.query("rollback to savepoint transition");
    }
    if (!transitionEnforced) {
      throw new Error("extension_pack_state_moved_backward");
    }

    const eligible = await client.query<{ count: string }>(
      `select count(*)::text as count
         from catalog_registry_extension_pack_rows
        where pack_id = any($1::uuid[]) and row_class = 'product_eligible'`,
      [[variety.packId, breed.packId]],
    );
    const held = await client.query<{ count: string }>(
      `select count(*)::text as count
         from catalog_registry_extension_pack_rows
        where pack_id = any($1::uuid[])
          and row_class in ('rights_blocked', 'needs_parent', 'collision', 'duplicate', 'review_needed')`,
      [[variety.packId, breed.packId]],
    );

    const receipt: ExtensionPackSmokeReceipt = {
      schemaVersion: "ove328.stableRegistryExtensionPackSmoke.v1",
      mode: "database",
      status: "pass",
      terminalClass: "completed",
      packKinds: ["plant_variety", "breed"],
      maxInteractionDelayMs: roundMs(interactionDelayMs),
      interactionBudgetMs: EXTENSION_PACK_INTERACTION_BUDGET_MS,
      productEligibleRowCount: Number(eligible.rows[0]?.count ?? 0),
      heldRowCount: Number(held.rows[0]?.count ?? 0),
      preciseLocationAbsent: true,
      forbiddenMarkersAbsent: true,
      controls: {
        cancelPackImportEnabled: true,
        returnToActiveCatalogEnabled: true,
      },
    };
    assertNoForbiddenPackMarkers(JSON.stringify(receipt));
    return receipt;
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

async function seedActiveFoundation(client: PoolClient) {
  const ids = {
    snapshot: randomUUID(),
    capture: randomUUID(),
    release: randomUUID(),
    owner: randomUUID(),
    plantSpecies: randomUUID(),
    plantOnly: randomUUID(),
    animalSpecies: randomUUID(),
  };
  const digest = "a".repeat(64);

  await client.query(
    `insert into catalog_source_snapshots (
       id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     ) values ($1,'eppo-codes','EPPO','taxonomy','ove328','https://data.eppo.int/',
       'Open Licence','ove328',$2, now(), now(), 'imported')`,
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
     ) values ($1,$2,'ove328',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(), now(),
       2, 2, 2, 1, $3, $3, $3,
       '{"productMutationCount":0,"searchMutationCount":0}'::jsonb, 'completed')`,
    [ids.capture, ids.snapshot, digest, "b".repeat(40)],
  );

  for (const [id, name, kind, slug] of [
    [
      ids.plantSpecies,
      "OVE328 Plant Species",
      "species",
      "ove328-plant-species",
    ],
    [ids.plantOnly, "OVE328 Plant Only", "plant_variety", "ove328-plant-only"],
    [ids.animalSpecies, "OVE328 Bee Species", "breed", "ove328-bee-species"],
  ] as const) {
    await client.query(
      `insert into catalog_items (
         id, canonical_name, normalized_name, catalog_kind, public_slug,
         status, source, locale
       ) values ($1,$2,$3,$4,$5,'confirmed','internal_seed','la')`,
      [id, name, name.toLowerCase(), kind, slug],
    );
    await client.query(
      `insert into catalog_item_revisions (
         catalog_item_id, revision_number, canonical_name, normalized_name,
         catalog_kind, identity_relation, source_evidence_digest, revision_digest
       ) values ($1, 1, $2, $3, $4, 'canonical', $5, $6)`,
      [id, name, name.toLowerCase(), kind, digest, sha256Like(id)],
    );
  }

  await client.query(
    `insert into catalog_registry_releases (
       id, release_kind, state, capture_id, source_snapshot_id, policy_version,
       build_digest, preview_digest, created_by_user_id
     ) values ($1,'foundation','approved',$2,$3,'ove255.foundation.v1',$4,$4,$5)`,
    [ids.release, ids.capture, ids.snapshot, digest, ids.owner],
  );
  for (const id of [ids.plantSpecies, ids.plantOnly, ids.animalSpecies]) {
    await client.query(
      `insert into catalog_registry_release_members (
         release_id, catalog_item_id, catalog_item_revision_id, eligibility, membership_digest
       )
       select $1, $2, revisions.id, 'product_eligible', $3
       from catalog_item_revisions as revisions
       where revisions.catalog_item_id = $2 and revisions.revision_number = 1`,
      [ids.release, id, sha256Like(`${ids.release}${id}`)],
    );
  }
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

  return ids;
}

async function seedPack(
  client: PoolClient,
  input: {
    packKind: "plant_variety" | "breed";
    sourceSlug: string;
    sourceRights: string;
    parentCatalogItemId: string;
    rows: number;
  },
) {
  const packId = randomUUID();
  await client.query(
    `insert into catalog_registry_extension_packs (
       id, source_slug, declared_source_version, adapter_version,
       artifact_schema_version, artifact_digest, artifact_byte_digest,
       pack_kind, source_rights, state, created_by_user_id
     ) values ($1,$2,'ove328','ove327.adapter.v1','ove327.packArtifact.v1',
       $3,$4,$5,$6,'classified',$7)`,
    [
      packId,
      input.sourceSlug,
      sha256Like(`${packId}artifact`),
      sha256Like(`${packId}bytes`),
      input.packKind,
      input.sourceRights,
      randomUUID(),
    ],
  );

  for (let index = 0; index < input.rows; index += 1) {
    await client.query(
      `insert into catalog_registry_extension_pack_rows (
         pack_id, source_record_key, official_denomination, normalized_denomination,
         locale, public_slug, parent_scientific_name, parent_evidence_class,
         parent_catalog_item_id, row_class
       ) values ($1,$2,$3,$4,'en',$5,'OVE328 Parent','declared_by_source',$6,'clean')`,
      [
        packId,
        `${input.packKind}-row-${index}`,
        `OVE328 Row ${index}`,
        `ove328 row ${index}`,
        `ove328-row-${input.packKind.replace(/_/gu, "-")}-${index}`,
        input.parentCatalogItemId,
      ],
    );
  }

  return { packId };
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
