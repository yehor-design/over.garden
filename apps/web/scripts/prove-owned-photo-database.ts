import "./neutralise-server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import type { ClaimedOwnedPhoto } from "../src/server/media/owned-photo-handoff";
import {
  readOwnedPhotos,
  writeOwnedPhoto,
} from "../src/server/owned-photo-repository";
import { changeSpacePhoto, deleteEmptySpace } from "../src/server/space-page-repository";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * Executes migration `0082` and the space and object photo (OVE-523,
 * ADR-0036 D1) on a fresh disposable database built from every migration.
 *
 * What it proves:
 *
 *   * a `media_assets` row has exactly one owner — an entry, a space or an
 *     object — and a space and an object hold one photo each;
 *   * writing a photo commits the row and a durable finalize job under the
 *     owner's id; a retry of the same claimed photo changes nothing;
 *   * replacing it queues the old photo's primary and variant files for
 *     revocation and removes the old row; removing it does the same;
 *   * deleting an empty space takes its photo's files back with it;
 *   * the rollback refuses while a photo is live, succeeds once none is, and
 *     the migration then re-applies twice.
 *
 * Output is aggregate: counts and booleans. Never a connection string.
 */

const MIGRATION = "0082_ove523_space_and_object_photos.sql";
const ROLLBACK = "0082_ove523_space_and_object_photos.down.sql";

function claimed(mediaAssetId: string, variants: Array<1280 | 480> = [1280, 480]): ClaimedOwnedPhoto {
  const key = `derivatives/${mediaAssetId}/1.webp`;
  return {
    media: {
      mediaAssetId,
      generation: 1,
      sha256: createHash("sha256").update(mediaAssetId).digest("base64url"),
      sizeBytes: 12_345,
      width: 2560,
      height: 1440,
      publicPath: key,
      variants: variants.map((variant) => ({
        variant,
        sha256: createHash("sha256").update(`${mediaAssetId}${variant}`).digest("base64url"),
        sizeBytes: 1_000,
        width: variant,
        height: Math.round((variant * 9) / 16),
        publicPath: key.replace(".webp", `-${variant}.webp`),
      })),
      placeholderDataUri: null,
    },
    stagingSessionId: randomUUID(),
    receiptSetDigest: createHash("sha256").update(randomUUID()).digest("base64url"),
  };
}

async function jobs(pool: Pool, kind: string) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from job_queue where payload->>'kind' = $1`,
    [kind],
  );
  return result.rows[0]!.count;
}

async function expectRefusal(pool: Pool, statement: string, params: unknown[], label: string) {
  try {
    await pool.query(statement, params);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted`);
}

export async function runDisposableProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const disposable = `overgarden_ove523_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  pool.on("error", () => undefined);
  const kdb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), "9999");
    const owner = randomUUID();
    const scope = { userId: owner };
    const space = randomUUID();
    const object = randomUUID();
    await pool.query(
      `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Балкон')`,
      [space, owner],
    );
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind)
       values ($1, $2, $3, 'Рябка', 'animal')`,
      [object, owner, space],
    );

    // One owner, never none and never two.
    const orphan = randomUUID();
    await expectRefusal(
      pool,
      `insert into media_assets (id, owner_user_id, derivative_key) values ($1, $2, $3)`,
      [orphan, owner, `derivatives/${orphan}/1.webp`],
      "a photo with no owner",
    );
    await expectRefusal(
      pool,
      `insert into media_assets (id, owner_user_id, derivative_key, space_id, plant_object_id)
       values ($1, $2, $3, $4, $5)`,
      [orphan, owner, `derivatives/${orphan}/1.webp`, space, object],
      "a photo with two owners",
    );

    // Write, retry, replace.
    const first = claimed(randomUUID());
    const written = await kdb.transaction().execute((tx) =>
      writeOwnedPhoto(tx, { ownerUserId: owner, owner: { kind: "space", id: space }, photo: first }),
    );
    const replayed = await kdb.transaction().execute((tx) =>
      writeOwnedPhoto(tx, { ownerUserId: owner, owner: { kind: "space", id: space }, photo: first }),
    );
    if (written !== "written" || replayed !== "replayed") {
      throw new Error(`write/replay answered ${written}/${replayed}`);
    }
    if ((await jobs(pool, "media_staging_finalize")) !== 1) {
      throw new Error("the photo was committed without its durable finalize job");
    }
    const second = claimed(randomUUID(), [1280]);
    const replaced = await changeSpacePhoto(scope, { spaceId: space, photo: second }, kdb);
    const photos = await readOwnedPhotos(kdb, { ownerUserId: owner, kind: "space", ids: [space] });
    if (replaced.status !== "saved" || photos.get(space)?.mediaAssetId !== second.media.mediaAssetId) {
      throw new Error("the replacement photo is not the space's photo");
    }
    const oldRows = await pool.query(`select 1 from media_assets where id = $1`, [
      first.media.mediaAssetId,
    ]);
    if (oldRows.rowCount !== 0) throw new Error("the replaced photo's row stayed");
    if ((await jobs(pool, "media_derivative_revoke")) !== 3) {
      throw new Error("the replaced photo's primary and two variants were not all queued for revocation");
    }
    await expectRefusal(
      pool,
      `insert into media_assets (id, owner_user_id, derivative_key, space_id) values ($1, $2, $3, $4)`,
      [orphan, owner, `derivatives/${orphan}/1.webp`, space],
      "a second live photo on one space",
    );

    // An object's photo, the same way.
    await kdb.transaction().execute((tx) =>
      writeOwnedPhoto(tx, {
        ownerUserId: owner,
        owner: { kind: "object", id: object },
        photo: claimed(randomUUID(), []),
      }),
    );

    // Remove, then delete an empty space that has a photo.
    const removed = await changeSpacePhoto(scope, { spaceId: space, photo: null }, kdb);
    if (removed.status !== "saved" || (await jobs(pool, "media_derivative_revoke")) !== 5) {
      throw new Error("removing the photo did not queue its files for revocation");
    }
    const empty = randomUUID();
    await pool.query(
      `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Порожній')`,
      [empty, owner],
    );
    await kdb.transaction().execute((tx) =>
      writeOwnedPhoto(tx, {
        ownerUserId: owner,
        owner: { kind: "space", id: empty },
        photo: claimed(randomUUID(), []),
      }),
    );
    const deleted = await deleteEmptySpace(scope, empty, kdb);
    if (deleted.status !== "deleted" || (await jobs(pool, "media_derivative_revoke")) !== 6) {
      throw new Error("deleting the space left its photo's files behind");
    }

    // The rollback refuses over a live photo, then succeeds; 0082 re-applies.
    const rollback = readFileSync(path.join(process.cwd(), "sql", "rollback", ROLLBACK), "utf8");
    await expectRefusal(pool, rollback, [], "the rollback over a live object photo");
    await pool.query(`delete from media_assets where plant_object_id is not null`);
    await pool.query(rollback);
    const columns = await pool.query(
      `select column_name from information_schema.columns
        where table_name = 'media_assets' and column_name in ('space_id', 'plant_object_id')`,
    );
    if (columns.rowCount !== 0) throw new Error("the rollback left the owner columns");
    const migration = readFileSync(path.join(process.cwd(), "sql", MIGRATION), "utf8");
    await pool.query(migration);
    await pool.query(migration);

    process.stdout.write(
      `${JSON.stringify(
        {
          class: "owned_photo_database_proof",
          singleOwnerEnforced: true,
          onePhotoPerOwner: true,
          finalizeJobWritten: true,
          retryIsNoOp: true,
          revokeJobs: await jobs(pool, "media_derivative_revoke"),
          spaceDeleteRevokes: true,
          rollbackRefusesLivePhoto: true,
          migrationReapplied: true,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await kdb.destroy().catch(() => undefined);
    await admin.query(`drop database if exists "${disposable}" with (force)`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

if (process.argv[1]?.endsWith("prove-owned-photo-database.ts") === true) {
  runDisposableProof().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "owned_photo_database_proof_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
