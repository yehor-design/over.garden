import { randomUUID } from "node:crypto";

import { chromium } from "playwright";
import { Pool } from "pg";

import { seedPublishedEntryFixture } from "../tests/helpers/entry-fixture";
import {
  cleanupStaleOrganismRuns,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
} from "../tests/helpers/organism-fixture";
import {
  makePhotographOfWeight,
  PRODUCTION_WEIGHT_PHOTOGRAPHS,
  putLocalMediaObject,
} from "../tests/helpers/production-weight-photographs";

/**
 * A local database whose public pages weigh what production's do (`OVE-469`).
 *
 *   pnpm fixture:production-weight      # seed; then build against the database
 *   pnpm build && pnpm exec next start -p 3179
 *   pnpm measure:lighthouse --base-url http://localhost:3179 --label … <paths>
 *
 * A light fixture measures the architecture and flatters everything else: a
 * 56 kB cover with variants beside cards with nothing in them measured 1.90 s
 * where production, same page, measured 5.74 s (ADR-0032 D9). This seeds the
 * weights production's feed showed first on 2026-09-23 — a 94 kB cover, then
 * 103, 147, 209 and 453 kB — as browser-made WebP with no variants, the way
 * every production photograph is served today:
 *
 * - four gardeners' entries, one photograph each, the cover-weight one newest;
 * - an organism card whose gardener entry carries the fifth.
 *
 * Seed before building: the listings are static documents, prerendered from
 * the database, so rows written after the build do not reach them. Loopback
 * database and media store only. It prints the three pages to measure.
 */
const ORGANISM_PREFIX = "ove469measure";
const ENTRY_PREFIX = "ove469measure-entry";

async function main() {
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  const browser = await chromium.launch();
  try {
    // Both fixtures' gardeners are `ove469measure-…@example.test`.
    await cleanupStaleOrganismRuns(pool, ORGANISM_PREFIX);

    const page = await browser.newPage();
    const photographs = [];
    for (const target of PRODUCTION_WEIGHT_PHOTOGRAPHS)
      photographs.push(await makePhotographOfWeight(page as never, target));
    const [cover, species, ...rest] = photographs;

    const organism = await seedOrganismFixture(pool, ORGANISM_PREFIX);
    const speciesKey = `derivatives/${randomUUID()}/1.webp`;
    const photographed = await pool.query(
      `insert into media_assets (id, owner_user_id, journal_entry_id, derivative_key, alt_text, caption,
         document_position, usage_role, intrinsic_width, intrinsic_height, focal_x, focal_y,
         upload_generation, declared_size_bytes, variant_long_edges)
       select $1, entry.owner_user_id, entry.id, $2, 'Помідор на балконі, перше суцвіття',
              'Помідор на балконі, перше суцвіття', 0, 'inline', $5, $6, 0.5, 0.45, 1, $7, '{}'
         from journal_entries as entry
         join plant_objects as object on object.id = entry.plant_object_id
        where entry.owner_user_id = $3::uuid and object.catalog_item_id = $4::uuid`,
      [
        randomUUID(),
        speciesKey,
        organism.ownerUserId,
        organism.speciesId,
        species!.width,
        species!.height,
        species!.bytes,
      ],
    );
    if (photographed.rowCount !== 1)
      throw new Error("expected the organism fixture's species entry");
    await putLocalMediaObject(speciesKey, species!.body);

    const entryPaths: string[] = [];
    for (const photograph of [...rest.reverse(), cover!]) {
      const key = `derivatives/${randomUUID()}/1.webp`;
      const entry = await seedPublishedEntryFixture(pool, ENTRY_PREFIX, {
        photographs: [
          {
            width: photograph.width,
            height: photograph.height,
            bytes: photograph.bytes,
            key,
          },
        ],
      });
      await pool.query(
        `update media_assets set variant_long_edges = '{}' where journal_entry_id = $1`,
        [entry.entryId],
      );
      await putLocalMediaObject(key, photograph.body);
      entryPaths.push(entry.entryPath);
    }

    console.log(
      JSON.stringify(
        {
          photographs: photographs.map((photo) => photo.bytes),
          measure: ["/", entryPaths.at(-1), `/species/${organism.speciesSlug}`],
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await pool.end();
  }
}

void main();
