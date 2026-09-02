import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS } from "./smoke-stable-registry-public-catalog";

export interface PublicCatalogDatabaseReceipt {
  schemaVersion: "ove256.stableRegistryPublicCatalogDatabaseSmoke.v1";
  mode: "database";
  status: "pass";
  terminalClass: "completed";
  projectedKinds: string[];
  plantFilterMatches: number;
  animalFilterMatches: number;
  maxQueryLatencyMs: number;
  queryBudgetMs: number;
  forbiddenMarkersAbsent: true;
  controls: {
    retrySearchEnabled: true;
    browseApprovedCatalogEnabled: true;
  };
}

/**
 * Executes the public read models against a loopback Postgres inside one
 * transaction that always rolls back.
 *
 * The existing fixture smoke proves the timeout branch in memory and never
 * touches SQL, so the projection's own CHECK constraints and its kind
 * derivation were never executed. That is where the defect this proof pins
 * lived: migration 0025 published every non-breed identity as a plant, so an
 * approved animal species reached guests under the wrong kingdom and was
 * missing from the filter that should have found it.
 */
export async function runPublicCatalogDatabaseProof(): Promise<PublicCatalogDatabaseReceipt> {
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
       ) values ($1,'eppo-codes','EPPO','taxonomy','ove256',
         'https://data.eppo.int/','Open Licence','ove256',$2, now(), now(), 'imported')`,
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
       ) values ($1,$2,'ove256',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(), now(),
         3, 3, 3, 1, $3, $3, $3,
         '{"productMutationCount":0,"searchMutationCount":0}'::jsonb, 'completed')`,
      [ids.capture, ids.snapshot, digest, "b".repeat(40)],
    );

    // One identity per catalog kind. The species is the one the old projection
    // got wrong, so it carries a deliberately animal-sounding name: nothing in
    // the catalog layer can read a kingdom out of a name, and this proof must
    // not accidentally pass by inferring one.
    const identities = [
      {
        id: ids.variety,
        name: "OVE256 Variety",
        kind: "plant_variety",
        slug: "ove256-variety",
      },
      {
        id: ids.breed,
        name: "OVE256 Breed",
        kind: "breed",
        slug: "ove256-breed",
      },
      {
        id: ids.species,
        name: "OVE256 Beetle Species",
        kind: "species",
        slug: "ove256-species",
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

    // Activation is the only writer of the public read model.
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

    const projected = await client.query<{
      stable_taxon: string;
      object_kind: string;
    }>(
      `select stable_taxon, object_kind
         from stable_registry_public_catalog_records
        where registry_release_id = $1
        order by stable_taxon`,
      [ids.release],
    );
    const projectedKinds = projected.rows.map(
      (row) => `${row.stable_taxon}:${row.object_kind}`,
    );
    expectEqual(
      projectedKinds,
      ["ove256-breed:animal", "ove256-species:either", "ove256-variety:plant"],
      "public_catalog_object_kind_materialization_mismatch",
    );

    // The search terms are a separate table with its own CHECK. It has to
    // accept the same vocabulary, or the widened records would materialize
    // while their prefix index silently failed.
    const termKinds = await client.query<{ object_kind: string }>(
      `select distinct object_kind
         from stable_registry_public_catalog_search_terms
        where registry_release_id = $1
        order by object_kind`,
      [ids.release],
    );
    expectEqual(
      termKinds.rows.map((row) => row.object_kind),
      ["animal", "either", "plant"],
      "public_catalog_search_term_kind_mismatch",
    );

    // The guest-facing claim: a species whose kingdom the catalog has never
    // established is reachable under both filters, and neither filter returns
    // an identity that positively belongs to the other kingdom.
    const startedAt = performance.now();
    const plantFilter = await kindFilterMatches(client, ids.release, "plant");
    const animalFilter = await kindFilterMatches(client, ids.release, "animal");
    const maxQueryLatencyMs = performance.now() - startedAt;

    expectEqual(
      plantFilter,
      ["ove256-species", "ove256-variety"],
      "plant_filter_returned_wrong_identities",
    );
    expectEqual(
      animalFilter,
      ["ove256-breed", "ove256-species"],
      "animal_filter_returned_wrong_identities",
    );
    if (maxQueryLatencyMs > STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS) {
      throw new Error("public_catalog_query_budget_exceeded");
    }

    // A public row must never carry source evidence or a coordinate pair.
    const publicText = await client.query<{ payload: string }>(
      `select coalesce(
                string_agg(
                  concat_ws(' ', stable_taxon, object_kind, canonical_name,
                            scientific_name, taxonomic_rank, parent_display_name,
                            search_normalized, array_to_string(safe_aliases, ' ')),
                  ' '),
                '') as payload
         from stable_registry_public_catalog_records
        where registry_release_id = $1`,
      [ids.release],
    );
    assertNoForbiddenPublicMarkers(publicText.rows[0]?.payload ?? "");

    // Retiring the release must take the whole projection out of guest reads
    // while the immutable membership survives.
    await client.query(
      `update catalog_registry_active_pointers
          set active_release_id = null where release_family = 'foundation'`,
    );
    const afterRetire = await client.query(
      `select 1
         from stable_registry_public_catalog_records as records
         join catalog_registry_active_pointers as pointers
           on pointers.release_family = 'foundation'
          and pointers.active_release_id = records.registry_release_id
        where records.registry_release_id = $1`,
      [ids.release],
    );
    if (afterRetire.rowCount !== 0) {
      throw new Error("retire_left_identities_publicly_visible");
    }
    const retainedMembers = await client.query<{ count: string }>(
      `select count(*)::text as count
         from catalog_registry_release_members where release_id = $1`,
      [ids.release],
    );
    if (Number(retainedMembers.rows[0]?.count ?? 0) !== identities.length) {
      throw new Error("retire_destroyed_immutable_membership");
    }

    return {
      schemaVersion: "ove256.stableRegistryPublicCatalogDatabaseSmoke.v1",
      mode: "database",
      status: "pass",
      terminalClass: "completed",
      projectedKinds,
      plantFilterMatches: plantFilter.length,
      animalFilterMatches: animalFilter.length,
      maxQueryLatencyMs: Math.round(maxQueryLatencyMs * 100) / 100,
      queryBudgetMs: STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS,
      forbiddenMarkersAbsent: true,
      controls: {
        retrySearchEnabled: true,
        browseApprovedCatalogEnabled: true,
      },
    };
  } finally {
    // Read-back only: no fixture identity survives this proof.
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

/**
 * Mirrors the guest kind filter in `buildPublicStableCatalogQuery`: an
 * unresolved record belongs under both kingdoms.
 */
async function kindFilterMatches(
  client: { query: Pool["query"] },
  releaseId: string,
  kind: "plant" | "animal",
) {
  const result = await client.query<{ stable_taxon: string }>(
    `select records.stable_taxon
       from stable_registry_public_catalog_records as records
      where records.registry_release_id = $1
        and (records.object_kind = $2 or records.object_kind = 'either')
      order by records.stable_taxon`,
    [releaseId, kind],
  );
  return result.rows.map((row) => row.stable_taxon);
}

const FORBIDDEN_PUBLIC_MARKERS =
  /raw[_-]?payload|source[_-]?only|field[_-]?rights|checksum|capture[_-]?id|snapshot[_-]?id|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

export function assertNoForbiddenPublicMarkers(payload: string) {
  if (FORBIDDEN_PUBLIC_MARKERS.test(payload)) {
    throw new Error("forbidden_public_marker_present");
  }
}

function expectEqual(actual: string[], expected: string[], errorClass: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${errorClass}: ${JSON.stringify(actual)}`);
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
