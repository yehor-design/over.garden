import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const collapseSql = readFileSync(
  join(webRoot, "sql/0007_ove211_object_kind_collapse.sql"),
  "utf8",
);
const LEGACY_KIND = (["bee", "colony"] as const).join("_");
const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

const describeIfDb = databaseUrl ? describe : describe.skip;

describeIfDb("OVE-211 live object-kind upgrade path", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const ownerUserId = randomUUID();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const catalogItemId = randomUUID();
  const journalId = randomUUID();
  const lineageId = randomUUID();
  const mutationId = `ove211-${objectId}`;
  const lineageMutationId = `ove211-lineage-${lineageId}`;
  const publicSlug = `ove211-upgrade-${objectId.slice(0, 8)}`;

  beforeAll(async () => {
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, 'OVE-211', $2, true, now(), now())`,
      [ownerUserId, `ove211-${ownerUserId}@example.test`],
    );

    await pool.query(
      `insert into spaces (id, owner_user_id, display_name, location_visibility)
       values ($1, $2, 'OVE-211 space', 'hidden')`,
      [spaceId, ownerUserId],
    );

    await pool.query(
      `insert into catalog_items (
         id, catalog_kind, canonical_name, normalized_name, source, status
       ) values ($1, 'breed', 'OVE-211 Carpathian', 'ove-211 carpathian', 'ua_official_bee_breed', 'seeded')`,
      [catalogItemId],
    );

    await pool.query(
      `alter table plant_objects drop constraint if exists plant_objects_object_kind_check`,
    );
    await pool.query(
      `alter table plant_objects
         add constraint plant_objects_object_kind_check
         check (object_kind in ('plant', 'animal', '${LEGACY_KIND}'))`,
    );

    await pool.query(
      `insert into plant_objects (
         id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state
       ) values ($1, $2, $3, 'OVE-211 hive', $4, $5, 'selected')`,
      [objectId, ownerUserId, spaceId, LEGACY_KIND, catalogItemId],
    );

    await pool.query(
      `insert into journal_entries (
         id, owner_user_id, plant_object_id, space_id, title, body, visibility,
         public_slug, entry_date, client_mutation_id
       ) values ($1, $2, $3, $4, 'Hive note', 'Observed the colony.', 'public', $5, current_date, $6)`,
      [journalId, ownerUserId, objectId, spaceId, publicSlug, mutationId],
    );

    await pool.query(
      `insert into lineage_provenance_edges (
         id, owner_user_id, subject_plant_object_id, source_kind,
         source_reference_kind, source_reference_label, client_mutation_id
       ) values ($1, $2, $3, 'source_reference', 'nursery', 'OVE-211 nursery', $4)`,
      [lineageId, ownerUserId, objectId, lineageMutationId],
    );
  }, 60_000);

  afterAll(async () => {
    try {
      await pool.query(`delete from lineage_provenance_edges where id = $1`, [
        lineageId,
      ]);
      await pool.query(`delete from journal_entries where id = $1`, [journalId]);
      await pool.query(`delete from plant_objects where id = $1`, [objectId]);
      await pool.query(`delete from spaces where id = $1`, [spaceId]);
      await pool.query(`delete from catalog_items where id = $1`, [
        catalogItemId,
      ]);
      await pool.query(`delete from "user" where id = $1`, [ownerUserId]);
      await pool.query(collapseSql);
    } finally {
      await pool.end();
    }
  }, 60_000);

  it("rewrites legacy kind rows to animal while preserving catalog, journals, lineage, and slug", async () => {
    const before = await pool.query(
      `select object_kind, catalog_item_id::text as catalog_item_id
       from plant_objects where id = $1`,
      [objectId],
    );
    expect(before.rows[0]?.object_kind).toBe(LEGACY_KIND);
    expect(before.rows[0]?.catalog_item_id).toBe(catalogItemId);

    await pool.query(collapseSql);

    const after = await pool.query(
      `select object_kind, catalog_item_id::text as catalog_item_id
       from plant_objects where id = $1`,
      [objectId],
    );
    expect(after.rows[0]?.object_kind).toBe("animal");
    expect(after.rows[0]?.catalog_item_id).toBe(catalogItemId);

    const journal = await pool.query(
      `select public_slug, plant_object_id::text as plant_object_id
       from journal_entries where id = $1`,
      [journalId],
    );
    expect(journal.rows[0]?.public_slug).toBe(publicSlug);
    expect(journal.rows[0]?.plant_object_id).toBe(objectId);

    const lineage = await pool.query(
      `select subject_plant_object_id::text as subject_id
       from lineage_provenance_edges where id = $1`,
      [lineageId],
    );
    expect(lineage.rows[0]?.subject_id).toBe(objectId);

    const check = await pool.query(
      `select pg_get_constraintdef(oid) as def
       from pg_constraint
       where conname = 'plant_objects_object_kind_check'
         and conrelid = 'plant_objects'::regclass`,
    );
    expect(check.rows[0]?.def).toMatch(/'plant'/);
    expect(check.rows[0]?.def).toMatch(/'animal'/);
    expect(check.rows[0]?.def).not.toContain(LEGACY_KIND);
  }, 60_000);
});
