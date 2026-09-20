import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

/**
 * One gardener, one plant, one published entry with a cover photograph.
 *
 * A spec that *looks* for a published entry and skips when it finds none is a
 * gate that cannot fail. `journal-entry.spec.ts` did exactly that, and on CI —
 * a freshly bootstrapped database, specs running in parallel, every other spec
 * deleting its own rows on the way out — it found none: all five of its tests
 * reported `skipped`, in every run from the day it was written, while the row
 * in `DESIGN.md` §10 said the entry page was gated (found 2026-09-20, from the
 * run log's `6 skipped`). A spec that needs a row now makes it, here, and a
 * failure to make it is a failure.
 */
export interface PublishedEntryFixture {
  ownerUserId: string;
  handle: string;
  entryId: string;
  entryNumber: number;
  /** `/@{handle}/post/{n}` — the entry's one address (ADR-0029 D9). */
  entryPath: string;
  title: string;
  body: string;
}

export async function seedPublishedEntryFixture(
  pool: Pool,
  prefix: string,
  options: {
    title?: string;
    body?: string;
    language?: "uk" | "bg" | "ru";
    /**
     * Write the entry the way the composer writes one: the photograph is a
     * *block of the document*, and it is the cover (ADR-0028). Without this
     * the fixture has a cover row and a plain-text body — which is why no
     * spec could see the page drawing that photograph twice (`OVE-471`).
     */
    photographInDocument?: boolean;
  } = {},
): Promise<PublishedEntryFixture> {
  const suffix = randomUUID().slice(0, 8);
  const ownerUserId = randomUUID();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const entryId = randomUUID();
  const assetId = randomUUID();
  const title = options.title ?? "Перші зав'язі після тижня спеки";
  // Long enough to wrap at every width: the measure of a line is a laid-out
  // fact, and one short sentence never reaches the column's edge.
  const body =
    options.body ??
    [
      "Новий приріст рівний, листя без плям на зворотному боці. Поливала ввечері під корінь, мульча тримає вологу третій день, і нижній ярус уже не в'яне опівдні.",
      "Наступна перевірка за тиждень: дивлюся нижній ярус і зав'язь на другій китиці, бо саме там минулого року з'явилася перша пляма. Пасинки прибрала до другого листка.",
    ].join("\n\n");

  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Олена з Полтави', $2, true, now(), now())`,
    [ownerUserId, `${prefix}-${suffix}@example.test`],
  );
  // Sign-up claims a handle (a trigger); the fixture reads the one it was given.
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
     where user_id = $1 and lifecycle_state = 'current'`,
    [ownerUserId],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle)
    throw new Error(`${prefix}: the fixture gardener holds no handle`);

  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, $3)`,
    [spaceId, ownerUserId, `${prefix} garden`],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $2, $3, 'Томат Чорний принц', 'plant', 'unknown')`,
    [objectId, ownerUserId, spaceId],
  );
  // The composer's shape: the photograph is a block, and the paragraphs are the
  // same words the plain body holds, so a spec can ask for either.
  const contentDocument = options.photographInDocument
    ? {
        schemaVersion: 1,
        blocks: [
          {
            id: "b_photograph",
            type: "image",
            mediaAssetId: assetId,
            caption: "Грядка з томатами у вечірньому світлі",
          },
          ...body.split(/\n\s*\n/).map((paragraph, index) => ({
            id: `b_paragraph_${index}`,
            type: "paragraph",
            spans: [{ text: paragraph.trim() }],
          })),
        ],
      }
    : null;

  const entry = await pool.query<{ n: number }>(
    `insert into journal_entries (id, owner_user_id, space_id, plant_object_id, title, body,
       content_document, content_schema_version, entry_scope,
       visibility, lifecycle_state, published_at, public_slug, source_language, client_mutation_id)
     values ($1, $2, $3, $4, $5, $6, $9, $10, 'object', 'public', 'active', now(), $7, $8, $7)
     returning author_entry_number as n`,
    [
      entryId,
      ownerUserId,
      spaceId,
      objectId,
      title,
      body,
      `${prefix}-entry-${suffix}`,
      options.language ?? "uk",
      contentDocument ? JSON.stringify(contentDocument) : null,
      contentDocument ? 1 : null,
    ],
  );
  const entryNumber = entry.rows[0]?.n;
  if (!entryNumber) throw new Error(`${prefix}: the entry was given no number`);

  // The row is what puts an `<img>`, its `srcset` and its preload in the
  // document. Whether a file answers behind it is the media pipeline's
  // question; a missing file costs a broken image, never the page's shape —
  // the box is reserved by `aspect-ratio` (DESIGN.md §2.10).
  await pool.query(
    `insert into media_assets (id, owner_user_id, journal_entry_id, derivative_key, alt_text, caption,
       document_position, usage_role, intrinsic_width, intrinsic_height, focal_x, focal_y,
       upload_generation, declared_size_bytes, variant_long_edges)
     values ($1, $2, $3, $4, 'Грядка з томатами у вечірньому світлі',
             'Грядка з томатами у вечірньому світлі', 0, 'inline', 2560, 1440, 0.5, 0.45, 1, 56744,
             '{1280,480}')`,
    [assetId, ownerUserId, entryId, `derivatives/${randomUUID()}/1.webp`],
  );
  await pool.query(
    `update journal_entries set cover_media_asset_id = $2 where id = $1`,
    [entryId, assetId],
  );

  return {
    ownerUserId,
    handle,
    entryId,
    entryNumber,
    entryPath: `/@${handle}/post/${entryNumber}`,
    title,
    body,
  };
}

export async function cleanupPublishedEntryFixture(
  pool: Pool,
  fixture: PublishedEntryFixture | null | undefined,
) {
  if (!fixture) return;
  // Children first: a gate database that keeps a deleted gardener's entries
  // accumulates rows with no resolvable address, and they fail other specs on
  // lines those specs did not touch.
  for (const table of ["journal_entries", "plant_objects", "spaces"]) {
    await pool.query(`delete from ${table} where owner_user_id = $1::uuid`, [
      fixture.ownerUserId,
    ]);
  }
  await pool.query('delete from public."user" where id = $1::uuid', [
    fixture.ownerUserId,
  ]);
}
