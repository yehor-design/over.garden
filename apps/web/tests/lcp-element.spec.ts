import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";
import {
  cleanupOrganismFixture,
  cleanupStaleOrganismRuns,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";
import {
  deleteLocalMediaObjects,
  makePhotographOfWeight,
  PRODUCTION_WEIGHT_PHOTOGRAPHS,
  putLocalMediaObject,
  type WeighedPhotograph,
} from "./helpers/production-weight-photographs";
import {
  publishPlantEntryThroughEndpoint,
  removePlantEntryPublisher,
} from "./helpers/publish-plant-entry";
import type { SyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * No public page's largest contentful paint is a lazy photograph (`OVE-469`).
 *
 * A lazy image is not asked for until layout has found it near the viewport,
 * which is after the stylesheet: on production on 2026-09-20 the organism
 * card's LCP element was its first gardener photograph, lazy, and it waited
 * 2.9 s before a byte of it was requested (`OVE-470`).
 *
 * `static-documents.spec.ts` asks the same of the laid-out page's geometry,
 * because its photographs are rows with no file behind them, and a photograph
 * that never paints is never an LCP candidate. These photographs paint: they
 * are real files of the weight production's are (`production-weight-
 * photographs.ts`), with no variants, as every production photograph is today.
 * So this reads the browser's own `largest-contentful-paint` entry — the
 * element it chose — and asks whether that element was lazy.
 *
 *   pnpm build && pnpm exec next start -p 3181
 *   PLAYWRIGHT_BASE_URL=http://localhost:3181 pnpm exec playwright test \
 *     tests/lcp-element.spec.ts
 */

const ORGANISM_PREFIX = "ove469organism";
const ENTRY_PREFIX = "ove469entry";
const OUTPUT = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-469",
);

const VIEWPORTS = [
  { width: 412, height: 823 },
  { width: 1_440, height: 900 },
] as const;

interface LargestContentfulPaint {
  tag: string | null;
  loading: string | null;
  fetchPriority: string | null;
  src: string | null;
  text: string | null;
  size: number;
  time: number;
}

/**
 * The browser's last `largest-contentful-paint` entry, once every image in the
 * viewport has finished. A string, so no transpiler rewrites it for the page.
 */
const READ_LARGEST_CONTENTFUL_PAINT = String.raw`new Promise((resolve) => {
  const entries = [];
  new PerformanceObserver((list) => entries.push(...list.getEntries())).observe({
    type: "largest-contentful-paint",
    buffered: true,
  });
  const inViewport = (image) => {
    const box = image.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
  };
  const settle = (deadline) => {
    const pending = [...document.images].filter((image) => inViewport(image) && !image.complete);
    if (pending.length > 0 && Date.now() < deadline) {
      setTimeout(() => settle(deadline), 100);
      return;
    }
    setTimeout(() => {
      const last = entries.at(-1);
      if (!last) return resolve(null);
      const element = last.element;
      const image = element instanceof HTMLImageElement ? element : null;
      resolve({
        tag: element ? element.tagName : null,
        loading: image ? image.loading : null,
        fetchPriority: element ? element.getAttribute("fetchpriority") : null,
        src: image ? image.currentSrc : null,
        text: element && !image ? (element.textContent || "").trim().slice(0, 80) : null,
        size: last.size,
        time: Math.round(last.renderTime || last.loadTime),
      });
    }, 500);
  };
  settle(Date.now() + 15000);
})`;

async function readLargestContentfulPaint(page: Page) {
  return (await page.evaluate(
    READ_LARGEST_CONTENTFUL_PAINT,
  )) as LargestContentfulPaint | null;
}

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
  ]);
}

/** A gardener's photograph on the organism card, with its file behind it. */
async function photographTheSpeciesEntry(
  pool: Pool,
  organism: OrganismFixture,
  photograph: WeighedPhotograph,
  key: string,
) {
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
      key,
      organism.ownerUserId,
      organism.speciesId,
      photograph.width,
      photograph.height,
      photograph.bytes,
    ],
  );
  if (photographed.rowCount !== 1)
    throw new Error(
      `${ORGANISM_PREFIX}: expected one species entry, found ${photographed.rowCount}`,
    );
  await putLocalMediaObject(key, photograph.body);
}

test.describe("the largest contentful paint is never a lazy photograph", () => {
  test.describe.configure({ mode: "serial" });

  let pool: Pool;
  let organism: OrganismFixture | null = null;
  const entries: PublishedEntryFixture[] = [];
  const keys: string[] = [];
  let publisher: SyntheticGardener | null = null;
  const receipts: Array<{
    page: string;
    viewport: string;
    lcp: LargestContentfulPaint | null;
  }> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    if (!baseURL) throw new Error("Playwright baseURL is required");
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    await cleanupStaleOrganismRuns(pool, ORGANISM_PREFIX);

    const maker = await browser.newPage();
    const photographs: WeighedPhotograph[] = [];
    for (const target of PRODUCTION_WEIGHT_PHOTOGRAPHS)
      photographs.push(await makePhotographOfWeight(maker, target));
    await maker.close();
    const [cover, ...more] = photographs;

    organism = await seedOrganismFixture(pool, ORGANISM_PREFIX);
    const speciesKey = `derivatives/${randomUUID()}/1.webp`;
    await photographTheSpeciesEntry(pool, organism, more[0]!, speciesKey);
    keys.push(speciesKey);

    // Heaviest first, so the cover-weight photograph is the newest card.
    for (const photograph of [...more.slice(1).reverse(), cover!]) {
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
      // As production's are: one size, no `srcset`.
      await pool.query(
        `update media_assets set variant_long_edges = '{}' where journal_entry_id = $1`,
        [entry.entryId],
      );
      await putLocalMediaObject(key, photograph.body);
      entries.push(entry);
      keys.push(key);
    }

    // The listings and the card are cached documents, and rows written here
    // do not expire them. A publish through the real endpoint does, so the
    // next visit renders all of the above from the database.
    publisher = await publishPlantEntryThroughEndpoint({
      baseURL,
      browser,
      pool,
      prefix: "ove469publisher",
      title: "Перевірка найбільшого зображення",
      text: "Короткий запис без фотографії, щоб оновити публічні списки.",
    });
  });

  test.afterAll(async () => {
    for (const entry of entries)
      await cleanupPublishedEntryFixture(pool, entry).catch(() => undefined);
    if (organism)
      await cleanupOrganismFixture(pool, organism).catch(() => undefined);
    await removePlantEntryPublisher(pool, publisher);
    await deleteLocalMediaObjects(keys);
    await pool.end();
    mkdirSync(OUTPUT, { recursive: true });
    writeFileSync(
      path.join(OUTPUT, "lcp-elements.json"),
      JSON.stringify(
        {
          issue: "OVE-469",
          proof:
            "Each page loaded at a phone's and a desk's width over production-weight photographs with no variants; the browser's own largest-contentful-paint entry is read once every image in the viewport has finished.",
          photographs: PRODUCTION_WEIGHT_PHOTOGRAPHS.map(
            (target) => target.targetBytes,
          ),
          receipts,
        },
        null,
        2,
      ) + "\n",
    );
  });

  test("on the feed, an entry, the organism card, the directory and a profile", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    if (!baseURL || !organism) throw new Error("fixture missing");
    await selectLocale(context, baseURL);
    const newest = entries.at(-1)!;
    const pages = [
      { name: "feed", address: "/" },
      { name: "entry", address: newest.entryPath },
      { name: "organism card", address: `/species/${organism.speciesSlug}` },
      { name: "directory", address: "/journals" },
      { name: "profile", address: `/@${newest.handle}` },
    ];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { name, address } of pages) {
        await page.goto(address, { waitUntil: "load" });
        const lcp = await readLargestContentfulPaint(page);
        const where = `${name} (${address}) at ${viewport.width} px`;
        receipts.push({
          page: address,
          viewport: `${viewport.width}x${viewport.height}`,
          lcp,
        });
        expect(lcp, `${where}: a largest contentful paint`).not.toBeNull();
        expect(
          lcp?.loading ?? "not an image",
          `${where}: the LCP element ${lcp?.src ?? lcp?.text} is lazy`,
        ).not.toBe("lazy");
      }
    }
    // The fixture exists to make photographs the LCP: if none of them was,
    // the proof above proved nothing about them.
    expect(
      receipts.filter((receipt) => receipt.lcp?.tag === "IMG").length,
      JSON.stringify(receipts, null, 2),
    ).toBeGreaterThan(0);
  });
});
