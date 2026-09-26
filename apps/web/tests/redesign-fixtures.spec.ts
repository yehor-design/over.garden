import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "playwright/test";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import {
  OWNER_BROWSER_FIXTURE,
  signInOwnerFixture,
} from "./helpers/owner-fixture";
import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";
import {
  COLLECTION_PRESETS,
  cleanupCollection,
  seedCollection,
  expireSyntheticSession,
  makeSyntheticPhotograph,
} from "./helpers/redesign-fixtures";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

let pool: Pool;
test.beforeAll(() => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
});
test.afterAll(async () => {
  await pool.end();
});

for (const preset of COLLECTION_PRESETS)
  test(`${preset.spaces} spaces / ${preset.objects} objects persist with explicit ownership`, async () => {
    const id = randomUUID();
    await pool.query(
      'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, now(), now())',
      [id, "Synthetic gardener", `ove480-${id}@example.test`],
    );
    await acceptLegalDocuments(pool, id);
    try {
      const fixture = await seedCollection(pool, id, preset);
      const counts = await pool.query(
        `select
      (select count(*)::int from spaces where owner_user_id=$1) as spaces,
      (select count(*)::int from plant_objects where owner_user_id=$1) as objects,
      (select count(*)::int from plant_objects where owner_user_id=$1 and space_id is null) as unassigned`,
        [id],
      );
      expect(counts.rows[0]).toEqual({ ...preset, unassigned: 0 });
      expect(
        (
          await pool.query("select id from plant_objects where id=$1", [
            fixture.deletedDestinationId,
          ])
        ).rowCount,
      ).toBe(0);
      if (preset.spaces > 1) {
        const duplicates = await pool.query(
          `select count(distinct space_id)::int as count from plant_objects where owner_user_id=$1 and display_name=$2`,
          [id, "Томат / Домат / Tomato"],
        );
        expect(duplicates.rows[0].count).toBe(preset.spaces);
      }
    } finally {
      await cleanupCollection(pool, id);
    }
  });

test("guest, ordinary member, sealed owner and expired session are distinct server outcomes", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local baseURL required");
  const context = await browser.newContext();
  let id: string | undefined;
  try {
    const guest = await context.request.get(`${baseURL}/api/auth/get-session`);
    expect(await guest.json()).toBeNull();
    const member = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: "ove480-roles",
    });
    id = member.id;
    await seedCollection(pool, id, { spaces: 20, objects: 1000 });
    const session = await context.request.get(
      `${baseURL}/api/auth/get-session`,
    );
    expect((await session.json()).user.id).toBe(id);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from admin_user_roles where user_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
    const page = await context.newPage();
    await page.goto(`${baseURL}/garden`);
    // A thousand objects are a collection to search, not a form (OVE-489).
    await expect(page.locator('[data-garden-collection="true"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-garden-search="true"]')).toBeVisible();
    await testInfo.attach("member-large-collection", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await expireSyntheticSession(pool, context, id);
    const expired = await context.request.get(
      `${baseURL}/api/auth/get-session`,
    );
    expect(await expired.json()).toBeNull();
    await signInOwnerFixture({ request: context.request, baseURL });
    const owner = await context.request.get(`${baseURL}/api/auth/get-session`);
    expect((await owner.json()).user.id).toBe(OWNER_BROWSER_FIXTURE.userId);
    expect(
      (
        await pool.query("select role from admin_user_roles where user_id=$1", [
          OWNER_BROWSER_FIXTURE.userId,
        ])
      ).rows[0].role,
    ).toBe("owner");
  } finally {
    await context.close();
    if (id) await cleanupCollection(pool, id);
  }
});

test("text-only, portrait, landscape and multiple-photo public entries have real synthetic media", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const entries: PublishedEntryFixture[] = [];
  const photographs = [
    await makeSyntheticPhotograph(page, "portrait"),
    await makeSyntheticPhotograph(page, "landscape"),
  ];
  await page.route(/\/derivatives\/ove480-/, async (route) => {
    const media = route.request().url().includes("portrait")
      ? photographs[0]
      : photographs[1];
    await route.fulfill({ contentType: "image/webp", body: media.body });
  });
  try {
    for (const [index, kinds] of [[], [0], [1], [0, 1]].entries()) {
      const fixture = await seedPublishedEntryFixture(
        pool,
        `ove480-media-${index}`,
        {
          photographInDocument: true,
          body: Array.from(
            { length: index === 3 ? 60 : 2 },
            (_, n) =>
              `Спостереження ${n + 1}. Български текст. Русское наблюдение. Solanum lycopersicum — 23 °C.`,
          ).join("\n\n"),
          language: (["uk", "bg", "ru"] as const)[index % 3],
          photographs: kinds.map((kind) => ({
            ...photographs[kind],
            key: `derivatives/ove480-${kind === 0 ? "portrait" : "landscape"}-${randomUUID()}/1.webp`,
          })),
        },
      );
      entries.push(fixture);
      const response = await page.goto(`${baseURL}${fixture.entryPath}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const rows = await pool.query(
        "select declared_size_bytes from media_assets where journal_entry_id=$1",
        [fixture.entryId],
      );
      expect(rows.rowCount).toBe(kinds.length);
      for (const row of rows.rows)
        expect(Number(row.declared_size_bytes)).toBeGreaterThan(100_000);
      for (const img of await page.locator('main img[src*="ove480-"]').all()) {
        await expect
          .poll(() =>
            img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      if (kinds.length)
        await expect(
          page.locator('main img[src*="ove480-"]').first(),
        ).toBeVisible();
    }
    const reportPath = testInfo.outputPath("synthetic-media-measurements.json");
    writeFileSync(
      reportPath,
      JSON.stringify(
        photographs.map(({ width, height, bytes }) => ({
          width,
          height,
          bytes,
        })),
        null,
        2,
      ),
    );
    await testInfo.attach("synthetic-media-measurements", {
      path: reportPath,
      contentType: "application/json",
    });
  } finally {
    for (const entry of entries)
      await cleanupPublishedEntryFixture(pool, entry);
  }
});
