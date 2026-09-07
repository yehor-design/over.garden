import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

/**
 * A seeded organism for the browser specs: a species with an accepted name,
 * a form linked by `form_of`, an orphan form, the EPPO code `LYPES` when the
 * database has none, and one public entry per organism so the species and
 * the form are indexable (their first-hand clock is set the way the 0054
 * backfill set it). Every row carries the caller's prefix so stale runs are
 * recognisable and removed first.
 */
export interface OrganismFixture {
  prefix: string;
  suffix: string;
  speciesId: string;
  speciesSlug: string;
  formId: string;
  formSlug: string;
  orphanId: string;
  orphanSlug: string;
  ownerUserId: string;
  snapshotId: string;
  assertionId: string;
  eppo: { itemId: string; seeded: boolean };
}

export async function cleanupStaleOrganismRuns(pool: Pool, prefix: string) {
  const staleUsers = await pool.query<{ id: string }>(
    `select id::text as id from "user" where email like '${prefix}-%'`,
  );
  const userIds = staleUsers.rows.map((row) => row.id);
  if (userIds.length > 0) {
    await pool.query(`delete from journal_entries where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from plant_objects where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from spaces where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from "user" where id = any($1::uuid[])`, [userIds]);
  }
  const staleItems = await pool.query<{ id: string }>(
    `select id::text as id from catalog_items where public_slug like '${prefix}-%' or source_id like '%:${prefix}:%'`,
  );
  const itemIds = staleItems.rows.map((row) => row.id);
  if (itemIds.length > 0) {
    await pool.query(
      `update plant_objects set catalog_item_id = null, variety_state = 'unknown', variety_text = null
       where catalog_item_id = any($1::uuid[])`,
      [itemIds],
    );
    await pool.query(
      `delete from catalog_item_relations where from_catalog_item_id = any($1::uuid[]) or to_catalog_item_id = any($1::uuid[])`,
      [itemIds],
    );
    await pool.query(`delete from catalog_item_identifiers where catalog_item_id = any($1::uuid[])`, [itemIds]);
    await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [itemIds]);
  }
  await pool.query(
    `delete from catalog_source_assertions where source_snapshot_id in
       (select id from catalog_source_snapshots where source_version like '${prefix}-%')`,
  );
  await pool.query(`delete from catalog_source_snapshots where source_version like '${prefix}-%'`);
}

export async function seedOrganismFixture(pool: Pool, prefix: string): Promise<OrganismFixture> {
  await cleanupStaleOrganismRuns(pool, prefix);
  const suffix = randomUUID().slice(0, 8);
  const snapshotId = randomUUID();
  const assertionId = randomUUID();
  const speciesId = randomUUID();
  const formId = randomUUID();
  const orphanId = randomUUID();
  const ownerUserId = randomUUID();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const formObjectId = randomUUID();
  const speciesSlug = `${prefix}-solanum-lycopersicum-${suffix}`;
  const formSlug = `${prefix}-de-barao-${suffix}`;
  const orphanSlug = `${prefix}-syrota-${suffix}`;

  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'ua-state-register', 'State Register of Plant Varieties', 'taxonomy', $2, 'https://example.test/',
             'CC BY 4.0', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `${prefix}-${suffix}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );
  const items: Array<[string, string, string, string, string, string, string]> = [
    [speciesId, "Solanum lycopersicum L.", "species_backbone", "la", "taxon", "Plantae", speciesSlug],
    [formId, "Де Барао", "ua_state_register", "uk", "cultivar", "Plantae", formSlug],
    [orphanId, "Сирота", "ua_state_register", "uk", "cultivar", "Plantae", orphanSlug],
  ];
  for (const [id, name, source, locale, nodeKind, kingdom, slug] of items) {
    await pool.query(
      `insert into catalog_items (id, canonical_name, normalized_name, public_slug, source,
         source_id, locale, node_kind, kingdom, identity_state, search_weight)
       values ($1, $2, catalog_normalize_name($2), $3, $4, $5, $6, $7, $8, 'active', 5)`,
      [id, name, slug, source, `${source}:${prefix}:${id}`, locale, nodeKind, kingdom],
    );
  }
  const names: Array<[string, string, string, boolean, string]> = [
    [speciesId, "Solanum lycopersicum", "la", true, "scientific_accepted"],
    [speciesId, "помідор", "uk", false, "vernacular"],
    [formId, "Де Барао", "uk", true, "denomination"],
    [orphanId, "Сирота", "uk", true, "denomination"],
  ];
  for (const [itemId, display, locale, primary, nameType] of names) {
    await pool.query(
      `insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary, name_type)
       values ($1, $2, catalog_normalize_name($2), $3, $4, $5)
       on conflict do nothing`,
      [itemId, display, locale, primary, nameType],
    );
  }
  await pool.query(
    `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
     values ($1, $2, 'form_of', $3)`,
    [formId, speciesId, assertionId],
  );

  // `/eppo/LYPES` must resolve; a database that already links the tomato's
  // EPPO code keeps its row, an empty one gets the code on this species.
  const existingEppo = await pool.query<{ id: string }>(
    `select catalog_item_id::text as id from catalog_item_identifiers where scheme = 'eppo' and value = 'LYPES' limit 1`,
  );
  let eppo: OrganismFixture["eppo"];
  if (existingEppo.rows[0]) {
    eppo = { itemId: existingEppo.rows[0].id, seeded: false };
  } else {
    await pool.query(
      `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id) values ($1, 'eppo', 'LYPES', $2)`,
      [speciesId, assertionId],
    );
    eppo = { itemId: speciesId, seeded: true };
  }

  // One public entry each makes the species and the form indexable, so their
  // JSON-LD and sitemap rows exist; the orphan stays without entries. The
  // entries are inserted directly, so the first-hand clock the publish path
  // keeps is set here the way the 0054 backfill set it.
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $3, $2, true, now(), now())`,
    [ownerUserId, `${prefix}-${suffix}@example.test`, `${prefix} gardener`],
  );
  await pool.query(`insert into spaces (id, owner_user_id, display_name) values ($1, $2, $3)`, [spaceId, ownerUserId, `${prefix} garden`]);
  const objects: Array<[string, string, string]> = [
    [objectId, speciesId, "Помідор на балконі"],
    [formObjectId, formId, "Де Барао на грядці"],
  ];
  for (const [id, catalogItemId, displayName] of objects) {
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state, variety_text)
       values ($1, $2, $3, $4, 'plant', $5, 'selected', null)`,
      [id, ownerUserId, spaceId, displayName, catalogItemId],
    );
    await pool.query(
      `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
         visibility, lifecycle_state, published_at, public_slug, client_mutation_id)
       values ($1, $2, $3, 'Перше суцвіття', 'Перший публічний запис про рослину на балконі.', 'object',
               'public', 'active', now() - interval '1 day', $4, $4)`,
      [ownerUserId, spaceId, id, `${prefix}-entry-${id.slice(0, 8)}-${suffix}`],
    );
  }

  await pool.query(
    `update catalog_items set first_hand_content_at = now() where id = any($1::uuid[])`,
    [[speciesId, formId]],
  );

  return {
    prefix,
    suffix,
    speciesId,
    speciesSlug,
    formId,
    formSlug,
    orphanId,
    orphanSlug,
    ownerUserId,
    snapshotId,
    assertionId,
    eppo,
  };
}

export async function cleanupOrganismFixture(pool: Pool, fixture: OrganismFixture) {
  await pool.query(`delete from journal_entries where owner_user_id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from plant_objects where owner_user_id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from spaces where owner_user_id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from "user" where id = $1::uuid`, [fixture.ownerUserId]);
  await pool.query(`delete from catalog_item_relations where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_item_identifiers where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [
    [fixture.speciesId, fixture.formId, fixture.orphanId],
  ]);
  await pool.query(`delete from catalog_source_assertions where id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_source_snapshots where id = $1`, [fixture.snapshotId]);
}

export function requiredLocalDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL is required for the organism specs.");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("The organism specs run against a loopback database only.");
  }
  return url;
}

