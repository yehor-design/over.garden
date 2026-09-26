import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";

import { fakeStaging, photograph } from "./helpers/fake-staging";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  expectReflow,
  scanAccessibility,
} from "./helpers/redesign-accessibility";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import { signInSyntheticGardener } from "./helpers/synthetic-gardener";

/**
 * Adding a plant or an animal is a full-screen stepper (`OVE-524`, ADR-0035
 * D1, DESIGN.md §5.24, §5.28): «Простір» → «Рослина чи тварина?» → an
 * optional photo cropped and turned in the browser → «Вкажіть ім'я …» →
 * «Вид» → «Сорт» / «Порода» → «Додати». The count is this run's; «Не знаю»
 * is the default species and cultivar; a species comes from the standard base
 * by everyday words; a typed cultivar or breed becomes a shared entry the next
 * gardener sees at once, and a name that matches one reuses it.
 *
 * Every outcome is read back from the database. The staging Worker cannot be
 * signed for locally, so a photo's uploads are answered in the browser and
 * the request that commits it is read (`helpers/fake-staging.ts`); the row
 * its claim would write is written here.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";
const RUN = randomUUID().slice(0, 8);

interface Fixture {
  tomato: string;
  chicken: string;
  strawberry: string;
  pepper: string;
  zucchini: string;
  wolf: string;
  oxheart: string;
  barao: string;
  seedUser: string;
  snapshot: string;
}

async function one<T>(pool: Pool, statement: string, params: unknown[] = []) {
  return (await pool.query(statement, params)).rows[0] as T;
}

async function seedFixture(pool: Pool): Promise<Fixture> {
  const snapshot = await one<{ id: string }>(
    pool,
    `insert into catalog_source_snapshots (
       source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status
     )
     values ('ove524-browser', 'Seed', 'species_backbone', $1, 'https://example.test/',
             'CC0', 'ove524', $2, now(), now(), 'imported')
     returning id`,
    [`ove524-${RUN}`, createHash("sha256").update(RUN).digest("hex")],
  );
  const assertion = await one<{ id: string }>(
    pool,
    `insert into catalog_source_assertions (
       source_slug, source_snapshot_id, rights_class, confidence, decision, reason_codes
     )
     values ('ove524-browser', $1, 'source_public', 1, 'automatic', array['ove524_browser'])
     returning id`,
    [snapshot.id],
  );
  async function species(input: {
    key: string;
    latin: string;
    kingdom: "Plantae" | "Animalia";
    names: string[];
    base: { kind: "plant" | "animal"; group: string } | null;
  }) {
    const id = randomUUID();
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, normalized_name, public_slug, source, source_id,
         locale, node_kind, kingdom, rank, identity_state
       )
       values ($1, $2, catalog_normalize_name($2), $3, 'species_backbone', $4,
               'la', 'taxon', $5, 'species', 'active')`,
      [
        id,
        input.latin,
        `ove524-${RUN}-${input.key}`,
        `ove524:${id}`,
        input.kingdom,
      ],
    );
    await pool.query(
      `insert into catalog_item_names (
         catalog_item_id, display_name, normalized_name, locale, script,
         is_primary, name_type, weight
       )
       values ($1, $2, catalog_normalize_name($2), 'la', 'latin', true, 'scientific_accepted', 5)`,
      [id, input.latin],
    );
    for (const [index, name] of input.names.entries()) {
      await pool.query(
        `insert into catalog_item_names (
           catalog_item_id, display_name, normalized_name, locale, script,
           is_primary, name_type, weight
         )
         values ($1, $2, catalog_normalize_name($2), 'uk', 'cyrillic', $3, 'vernacular', 5)`,
        [id, name, index === 0],
      );
    }
    if (input.base) {
      // Popular enough to lead any other base species with the same name.
      await pool.query(
        `insert into catalog_standard_species (
           catalog_item_id, base_key, object_kind, base_group, latin_name,
           popularity, base_version
         )
         values ($1, $2, $3, $4, $5, 900000, '2026-09-26')`,
        [
          id,
          `${input.base.kind}:ove524-${RUN}-${input.key}`,
          input.base.kind,
          input.base.group,
          input.latin,
        ],
      );
    }
    return id;
  }
  async function registered(name: string, key: string, speciesId: string) {
    const id = randomUUID();
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, normalized_name, public_slug, source, source_id,
         locale, node_kind, kingdom, rank, identity_state
       )
       values ($1, $2, catalog_normalize_name($2), $3, 'ua_state_register', $4,
               'uk', 'cultivar', 'Plantae', 'cultivar', 'active')`,
      [id, name, `ove524-${RUN}-${key}`, `ove524:${id}`],
    );
    await pool.query(
      `insert into catalog_item_names (
         catalog_item_id, display_name, normalized_name, locale, script,
         is_primary, name_type, weight
       )
       values ($1, $2, catalog_normalize_name($2), 'uk', 'cyrillic', true, 'denomination', 4)`,
      [id, name],
    );
    await pool.query(
      `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
       values ($1, $2, 'form_of', $3)`,
      [id, speciesId, assertion.id],
    );
    return id;
  }

  const tomato = await species({
    key: "tomato",
    latin: "Solanum lycopersicum",
    kingdom: "Plantae",
    names: ["помідор", "томат"],
    base: { kind: "plant", group: "vegetables" },
  });
  const chicken = await species({
    key: "chicken",
    latin: "Gallus gallus domesticus",
    kingdom: "Animalia",
    names: ["курка", "кури"],
    base: { kind: "animal", group: "poultry" },
  });
  const strawberry = await species({
    key: "strawberry",
    latin: "Fragaria × ananassa",
    kingdom: "Plantae",
    names: ["полуниця", "суниця садова"],
    base: { kind: "plant", group: "berries" },
  });
  const pepper = await species({
    key: "pepper",
    latin: "Capsicum annuum",
    kingdom: "Plantae",
    names: ["перець", "болгарський перець", "солодкий перець"],
    base: { kind: "plant", group: "vegetables" },
  });
  const zucchini = await species({
    key: "zucchini",
    latin: "Cucurbita pepo",
    kingdom: "Plantae",
    names: ["кабачок", "цукіні"],
    base: { kind: "plant", group: "vegetables" },
  });
  // In the catalogue, not in the base: found by nothing.
  const wolf = await species({
    key: "wolf",
    latin: "Canis lupus",
    kingdom: "Animalia",
    names: ["вовк сірий"],
    base: null,
  });
  const oxheart = await registered("Бичаче серце", "oxheart", tomato);
  const barao = await registered("Де Барао", "de-barao", tomato);

  // Somebody's tomato already uses «Бичаче серце»; nobody uses «Де Барао».
  const seedUser = randomUUID();
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'ove524 seed', $2, true, now(), now())`,
    [seedUser, `ove524-seed-${RUN}@example.test`],
  );
  const seedSpace = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Грядка')`,
    [seedSpace, seedUser],
  );
  await pool.query(
    `insert into plant_objects (
       id, owner_user_id, space_id, display_name, object_kind,
       catalog_item_id, variety_state, variety_text
     )
     values (gen_random_uuid(), $1, $2, 'Сусідський', 'plant', $3, 'selected', 'Бичаче серце')`,
    [seedUser, seedSpace, oxheart],
  );
  return {
    tomato,
    chicken,
    strawberry,
    pepper,
    zucchini,
    wolf,
    oxheart,
    barao,
    seedUser,
    snapshot: snapshot.id,
  };
}

async function gardenerEntries(pool: Pool, speciesId: string) {
  return (
    await pool.query<{
      id: string;
      canonical_name: string;
      created_by_user_id: string | null;
      reviewed_at: Date | null;
      node_kind: string;
    }>(
      `select item.id, item.canonical_name, item.created_by_user_id,
              item.reviewed_at, item.node_kind
         from catalog_items as item
         join catalog_item_relations as relation
           on relation.from_catalog_item_id = item.id
          and relation.relation_type = 'form_of'
        where relation.to_catalog_item_id = $1 and item.source = 'gardener'
        order by item.created_at`,
      [speciesId],
    )
  ).rows;
}

async function cleanupFixture(pool: Pool, fixture: Fixture | null) {
  if (!fixture) return;
  const species = [
    fixture.tomato,
    fixture.chicken,
    fixture.strawberry,
    fixture.pepper,
    fixture.zucchini,
    fixture.wolf,
  ];
  await cleanupCollection(pool, fixture.seedUser);
  const entries = await pool.query<{ id: string }>(
    `select relation.from_catalog_item_id as id
       from catalog_item_relations as relation
      where relation.to_catalog_item_id = any($1::uuid[])
        and relation.relation_type = 'form_of'`,
    [species],
  );
  const forms = entries.rows.map((row) => row.id);
  await pool.query(
    "delete from plant_objects where catalog_item_id = any($1::uuid[])",
    [[...species, ...forms]],
  );
  await pool.query("delete from catalog_items where id = any($1::uuid[])", [
    [...forms, ...species],
  ]);
  await pool.query(
    `delete from catalog_source_assertions
      where source_snapshot_id = $1
         or (source_slug = 'overgarden-gardeners'
             and not exists (select 1 from catalog_item_relations as r where r.assertion_id = catalog_source_assertions.id)
             and not exists (select 1 from catalog_item_names as n where n.assertion_id = catalog_source_assertions.id))`,
    [fixture.snapshot],
  );
  await pool.query("delete from catalog_source_snapshots where id = $1", [
    fixture.snapshot,
  ]);
}

async function objectsOf(pool: Pool, userId: string) {
  return (
    await pool.query<{
      id: string;
      display_name: string;
      object_kind: string;
      space_id: string;
      catalog_item_id: string | null;
      variety_state: string;
      variety_text: string | null;
      species_text: string | null;
    }>(
      `select id, display_name, object_kind, space_id, catalog_item_id,
              variety_state, variety_text, species_text
         from plant_objects where owner_user_id = $1 order by created_at`,
      [userId],
    )
  ).rows;
}

async function createSpace(
  request: APIRequestContext,
  baseURL: string,
  displayName: string,
) {
  const response = await request.post(`${baseURL}/api/garden/spaces`, {
    data: {
      requestId: randomUUID(),
      displayName,
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { space: { id: string } }).space.id;
}

async function gardener(
  browser: import("playwright/test").Browser,
  baseURL: string,
  pool: Pool,
  prefix: string,
) {
  const context = await browser.newContext();
  const user = await signInSyntheticGardener({
    baseURL,
    context,
    pool,
    prefix,
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL },
  ]);
  return { context, user };
}

async function openStepper(page: Page, query = "") {
  await page.goto(`/garden/objects/new${query}`, { waitUntil: "load" });
  const stepper = page.locator('[data-creation-stepper="true"]');
  await expect(stepper).toBeVisible({ timeout: 20_000 });
  await waitForHydration(stepper);
  return stepper;
}

function progress(stepper: Locator) {
  return stepper.locator("[data-creation-progress]");
}

function question(stepper: Locator) {
  return stepper.getByRole("heading", { level: 1 });
}

function primary(stepper: Locator) {
  return stepper.locator('[data-creation-primary="true"]');
}

function selected(stepper: Locator) {
  return stepper.locator('[data-choice-selected="true"]');
}

async function insertObjectPhoto(
  pool: Pool,
  input: { owner: string; objectId: string; mediaAssetId: string },
) {
  await pool.query(
    `insert into media_assets (id, owner_user_id, plant_object_id, derivative_key, usage_role,
       intrinsic_width, intrinsic_height, focal_x, focal_y, upload_generation,
       declared_size_bytes, variant_long_edges)
     values ($1, $2, $3, $4, 'cover_only', 1600, 900, 0.5, 0.5, 1, 90000, '{1280,480}')`,
    [
      input.mediaAssetId,
      input.owner,
      input.objectId,
      `derivatives/${input.mediaAssetId}/1.webp`,
    ],
  );
}

test.describe("object setup", () => {
  let pool: Pool;
  let fixture: Fixture | null = null;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    fixture = await seedFixture(pool);
  });
  test.afterAll(async () => {
    await cleanupFixture(pool, fixture);
    await pool.end();
  });

  test("the full run: an animal, a photo cropped and turned, «Рябка», «курка», a new breed «Брама» — which the next gardener sees at once", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    const f = fixture!;
    const first = await gardener(browser, baseURL!, pool, "ove524-full");
    let second: Awaited<ReturnType<typeof gardener>> | null = null;
    try {
      const spaceId = await createSpace(
        first.context.request,
        baseURL!,
        "Двір",
      );
      const staging = await fakeStaging(first.context, async () => "stage");
      // The create request is read, then sent on without the photo: its claim
      // needs the real Worker's receipts, which `route.test.ts` and
      // `schema:object-species:prove-database` prove instead.
      let sent = null as Record<string, unknown> | null;
      await first.context.route("**/api/garden/objects", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const body = route.request().postDataJSON() as Record<string, unknown>;
        sent = body;
        await route.continue({
          postData: JSON.stringify({ ...body, photo: null }),
        });
      });

      const page = await first.context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 900 });
      const stepper = await openStepper(page);

      // 1 · «Простір»: the one space is chosen, and «Далі» and «Додати
      // простір» are both there.
      await expect(question(stepper)).toHaveText("Простір");
      await expect(progress(stepper)).toHaveText("Крок 1 з 5");
      await expect(selected(stepper)).toHaveAttribute(
        "data-object-setup-space",
        spaceId,
      );
      await expect(
        stepper.locator('[data-object-setup-add-space="true"]'),
      ).toHaveText("Додати простір");
      await scanAccessibility(page, testInfo, "object-setup-space-1280");
      await page.screenshot({ path: testInfo.outputPath("1-space-1280.png") });
      await primary(stepper).click();

      // 2 · a choice answers and moves on.
      await expect(question(stepper)).toHaveText("Рослина чи тварина?");
      await page.screenshot({ path: testInfo.outputPath("2-kind-1280.png") });
      await stepper.locator('[data-object-setup-kind="animal"]').click();
      await page.waitForURL(/step=photo/u);

      // 3 · the photo, cropped to the cover and turned a quarter.
      await expect(question(stepper)).toHaveText("Додайте фото тварини");
      await expect(progress(stepper)).toHaveText("Крок 3 з 5");
      await stepper.locator('[data-owned-photo-input="true"]').setInputFiles({
        name: "ryabka.jpg",
        mimeType: "image/jpeg",
        buffer: await photograph(page, "portrait", "image/jpeg"),
      });
      const frame = stepper.locator('[data-photo-crop-frame="true"]');
      await expect(frame).toBeVisible();
      await expect(
        stepper.locator('[data-photo-crop-done="true"]'),
      ).toBeEnabled();
      await frame.focus();
      await page.keyboard.press("r");
      await expect(frame).toHaveAttribute("data-crop-turns", "1");
      await stepper.getByRole("button", { name: "Готово" }).click();
      await expect(
        stepper.locator("[data-owned-photo-status]"),
      ).toHaveAttribute("data-owned-photo-status", "ready", {
        timeout: 30_000,
      });
      await page.screenshot({ path: testInfo.outputPath("3-photo-1280.png") });
      await primary(stepper).click();

      // 4 · the name.
      await expect(question(stepper)).toHaveText("Вкажіть ім'я тварини");
      const name = stepper.locator('[data-object-setup-name="true"]');
      await expect(name).toHaveAttribute("placeholder", "Рябка");
      await name.fill("Рябка");
      await page.screenshot({ path: testInfo.outputPath("4-name-1280.png") });
      await page.keyboard.press("Enter");

      // 5 · «Вид»: «Не знаю» until the gardener says otherwise; «курка»
      // finds the species by its everyday name.
      await expect(question(stepper)).toHaveText("Вид");
      await expect(progress(stepper)).toHaveText("Крок 5 з 5");
      await expect(primary(stepper)).toHaveText("Додати");
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "unknown",
      );
      const search = stepper.locator(
        '[data-object-setup-species-search="true"]',
      );
      await expect(search).toHaveAttribute("placeholder", "Наприклад, курка");
      await search.fill("курка");
      const chicken = stepper.locator(`[data-species-id="${f.chicken}"]`);
      await expect(chicken).toBeVisible();
      await expect(chicken).toContainText("Gallus gallus domesticus");
      await scanAccessibility(page, testInfo, "object-setup-species-1280");
      await page.screenshot({
        path: testInfo.outputPath("5-species-1280.png"),
      });
      await chicken.click();
      // A species adds «Порода» to this run.
      await expect(progress(stepper)).toHaveText("Крок 5 з 6");
      await expect(primary(stepper)).toHaveText("Далі");
      await primary(stepper).click();

      // 6 · «Порода»: «Не знаю» and no hint; «Брама» typed and added.
      await expect(question(stepper)).toHaveText("Порода");
      await expect(progress(stepper)).toHaveText("Крок 6 з 6");
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "unknown",
      );
      const breed = stepper.locator(
        '[data-object-setup-cultivar-search="true"]',
      );
      await expect(breed).not.toHaveAttribute("placeholder", /.+/u);
      await breed.fill("Брама");
      const add = stepper.locator('[data-cultivar-add="true"]');
      await expect(add).toHaveText(/Додати «Брама»/u);
      await add.click();
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "add",
      );
      await page.screenshot({ path: testInfo.outputPath("6-breed-1280.png") });
      await primary(stepper).click();
      await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u);
      const objectId = new URL(page.url()).pathname.split("/").at(-1)!;

      // Exactly what was chosen, with the staged photo's receipts.
      expect(sent).not.toBeNull();
      expect(sent!.species).toEqual({
        kind: "catalog",
        catalogItemId: f.chicken,
      });
      expect(sent!.cultivar).toEqual({ kind: "new", name: "Брама" });
      const staged = staging.uploads.filter((upload) => upload.status === 200);
      const primaryUpload = staged.find((upload) => upload.variant === 0)!;
      expect(primaryUpload.width / primaryUpload.height).toBeCloseTo(16 / 9, 1);
      const photo = sent!.photo as Record<string, unknown>;
      expect(photo.mediaAssetId).toBe(primaryUpload.mediaAssetId);

      // One shared, unreviewed breed entry, and the object on it.
      const entries = await gardenerEntries(pool, f.chicken);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        canonical_name: "Брама",
        created_by_user_id: first.user.id,
        reviewed_at: null,
        node_kind: "breed",
      });
      expect(await objectsOf(pool, first.user.id)).toEqual([
        expect.objectContaining({
          id: objectId,
          display_name: "Рябка",
          object_kind: "animal",
          space_id: spaceId,
          catalog_item_id: entries[0]!.id,
          variety_state: "selected",
          variety_text: "Брама",
          species_text: null,
        }),
      ]);

      // The photo the claim would write is the passport's cover.
      await insertObjectPhoto(pool, {
        owner: first.user.id,
        objectId,
        mediaAssetId: primaryUpload.mediaAssetId,
      });
      await page.goto(`/garden/objects/${objectId}`, { waitUntil: "load" });
      await expect(
        page.getByRole("img", { name: "Рябка" }).first(),
      ).toHaveAttribute("src", new RegExp(primaryUpload.mediaAssetId, "u"));
      await page.screenshot({ path: testInfo.outputPath("7-object-1280.png") });
      expect(errors).toEqual([]);

      // The next gardener: «Брама» is on the chicken's list without typing.
      second = await gardener(browser, baseURL!, pool, "ove524-second");
      const secondSpace = await createSpace(
        second.context.request,
        baseURL!,
        "Курник",
      );
      const secondPage = await second.context.newPage();
      const next = await openStepper(secondPage, `?space=${secondSpace}`);
      // Started inside a space: «Простір» is not asked or counted.
      await expect(question(next)).toHaveText("Рослина чи тварина?");
      await expect(progress(next)).toHaveText("Крок 1 з 4");
      await next.locator('[data-object-setup-kind="animal"]').click();
      await next.getByRole("button", { name: "Пропустити" }).click();
      await next.locator('[data-object-setup-name="true"]').fill("Чорнушка");
      await secondPage.keyboard.press("Enter");
      await next
        .locator('[data-object-setup-species-search="true"]')
        .fill("кури");
      await next.locator(`[data-species-id="${f.chicken}"]`).click();
      await primary(next).click();
      const shared = next.locator(`[data-cultivar-id="${entries[0]!.id}"]`);
      await expect(shared).toHaveText(/Брама/u);
      await shared.click();
      await primary(next).click();
      await secondPage.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u);
      expect((await objectsOf(pool, second.user.id))[0]!.catalog_item_id).toBe(
        entries[0]!.id,
      );
      expect(await gardenerEntries(pool, f.chicken)).toHaveLength(1);
    } finally {
      await cleanupCollection(pool, first.user.id);
      await first.context.close();
      if (second) {
        await cleanupCollection(pool, second.user.id);
        await second.context.close();
      }
    }
  });

  test("no space yet: the space stepper first, then step 1 with the new space chosen; leaving it goes home", async ({
    browser,
    baseURL,
  }) => {
    const { context, user } = await gardener(
      browser,
      baseURL!,
      pool,
      "ove524-nospace",
    );
    try {
      const page = await context.newPage();
      await page.goto("/garden/objects/new", { waitUntil: "load" });
      await page.waitForURL(/\/garden\/spaces\/new\?returnTo=/u);

      // Leaving the space stepper does not bounce back here.
      const spaceStepper = page.locator('[data-creation-stepper="true"]');
      await waitForHydration(spaceStepper);
      await spaceStepper.locator('[data-creation-close="true"]').click();
      await page.waitForURL((url) => url.pathname === "/garden");

      await page.goto("/garden/objects/new", { waitUntil: "load" });
      await page.waitForURL(/\/garden\/spaces\/new\?returnTo=/u);
      await waitForHydration(spaceStepper);
      await spaceStepper.getByLabel("Назва простору").fill("Теплиця");
      await page.keyboard.press("Enter");
      await spaceStepper.getByRole("button", { name: "Пропустити" }).click();
      await page.waitForURL(/\/garden\/objects\/new\?from=space-setup/u);
      const created = (
        await pool.query<{ id: string }>(
          "select id from spaces where owner_user_id = $1",
          [user.id],
        )
      ).rows;
      expect(created).toHaveLength(1);
      const stepper = page.locator('[data-creation-stepper="true"]');
      await waitForHydration(stepper);
      await expect(question(stepper)).toHaveText("Простір");
      await expect(progress(stepper)).toHaveText("Крок 1 з 5");
      await expect(selected(stepper)).toHaveAttribute(
        "data-object-setup-space",
        created[0]!.id,
      );
    } finally {
      await cleanupCollection(pool, user.id);
      await context.close();
    }
  });

  test("one space with a photo: shown with it and chosen; «Додати простір» comes back with the new one chosen", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    const { context, user } = await gardener(
      browser,
      baseURL!,
      pool,
      "ove524-onespace",
    );
    try {
      const spaceId = await createSpace(context.request, baseURL!, "Балкон");
      const photoId = randomUUID();
      await pool.query(
        `insert into media_assets (id, owner_user_id, space_id, derivative_key, usage_role,
           intrinsic_width, intrinsic_height, focal_x, focal_y, upload_generation,
           declared_size_bytes, variant_long_edges)
         values ($1, $2, $3, $4, 'cover_only', 1600, 900, 0.5, 0.5, 1, 90000, '{1280,480}')`,
        [photoId, user.id, spaceId, `derivatives/${photoId}/1.webp`],
      );
      const page = await context.newPage();
      await page.setViewportSize({ width: 375, height: 740 });
      const stepper = await openStepper(page);
      await expectReflow(page);
      await expect(selected(stepper)).toHaveAttribute(
        "data-object-setup-space",
        spaceId,
      );
      await expect(
        stepper.locator('[data-object-setup-space-photo="true"]'),
      ).toHaveAttribute("srcset", /480w/u);
      await expect(primary(stepper)).toHaveText("Далі");
      await scanAccessibility(page, testInfo, "object-setup-one-space-375");
      await page.screenshot({ path: testInfo.outputPath("one-space-375.png") });

      await stepper.locator('[data-object-setup-add-space="true"]').click();
      await page.waitForURL(/\/garden\/spaces\/new\?returnTo=/u);
      const spaceStepper = page.locator('[data-creation-stepper="true"]');
      await waitForHydration(spaceStepper);
      await spaceStepper.getByLabel("Назва простору").fill("Теплиця");
      await page.keyboard.press("Enter");
      await spaceStepper.getByRole("button", { name: "Пропустити" }).click();
      await page.waitForURL(/\/garden\/objects\/new\?from=space-setup/u);
      await waitForHydration(stepper);
      const greenhouse = (
        await pool.query<{ id: string }>(
          "select id from spaces where owner_user_id = $1 and display_name = 'Теплиця'",
          [user.id],
        )
      ).rows[0]!.id;
      await expect(selected(stepper)).toHaveAttribute(
        "data-object-setup-space",
        greenhouse,
      );
      await expect(stepper.locator("[data-object-setup-space]")).toHaveCount(2);
    } finally {
      await pool.query("delete from media_assets where owner_user_id = $1", [
        user.id,
      ]);
      await cleanupCollection(pool, user.id);
      await context.close();
    }
  });

  test("«Не знаю» for the species, then an own species with an own cultivar, Back keeping every answer — at 375 px", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const f = fixture!;
    const { context, user } = await gardener(
      browser,
      baseURL!,
      pool,
      "ove524-own",
    );
    try {
      const spaceId = await createSpace(context.request, baseURL!, "Город");
      const page = await context.newPage();
      await page.setViewportSize({ width: 375, height: 740 });

      // «Не знаю»: no «Сорт» step and the count says so; «Додати» without
      // touching anything.
      let stepper = await openStepper(page, `?space=${spaceId}`);
      await stepper.locator('[data-object-setup-kind="plant"]').click();
      await stepper.getByRole("button", { name: "Пропустити" }).click();
      await stepper
        .locator('[data-object-setup-name="true"]')
        .fill("Щось зелене");
      await page.keyboard.press("Enter");
      await expect(question(stepper)).toHaveText("Вид");
      await expect(progress(stepper)).toHaveText("Крок 4 з 4");
      await expect(
        stepper.locator('[data-object-setup-species-search="true"]'),
      ).toHaveAttribute("placeholder", "Наприклад, помідор");
      await expectReflow(page);
      // A phone's keyboard shrinks the viewport; the frame follows it, so the
      // step's button stays in view.
      await page.setViewportSize({ width: 375, height: 420 });
      await stepper
        .locator('[data-object-setup-species-search="true"]')
        .focus();
      await expect(primary(stepper)).toBeInViewport();
      await page.setViewportSize({ width: 375, height: 740 });
      await primary(stepper).click();
      await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u);
      expect(await objectsOf(pool, user.id)).toEqual([
        expect.objectContaining({
          display_name: "Щось зелене",
          catalog_item_id: null,
          variety_state: "unknown",
          species_text: null,
          variety_text: null,
        }),
      ]);

      // An own species: «Сорт» becomes a private text field or «Не знаю».
      stepper = await openStepper(page, `?space=${spaceId}`);
      await stepper.locator('[data-object-setup-kind="plant"]').click();
      await stepper.getByRole("button", { name: "Пропустити" }).click();
      const name = stepper.locator('[data-object-setup-name="true"]');
      await name.fill("Бабусині помідори");
      await page.keyboard.press("Enter");
      // Back returns to the name, and it is still there.
      await page.goBack();
      await expect(question(stepper)).toHaveText("Вкажіть ім'я рослини");
      await expect(name).toHaveValue("Бабусині помідори");
      await name.press("Enter");
      await stepper.locator('[data-choice-option="own"]').click();
      const own = stepper.locator('[data-object-setup-species-own="true"]');
      await expect(own).toBeFocused();
      await own.fill("Помідор бабусин");
      await expect(progress(stepper)).toHaveText("Крок 4 з 5");
      await primary(stepper).click();
      await expect(question(stepper)).toHaveText("Сорт");
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "unknown",
      );
      await stepper.locator('[data-choice-option="own"]').click();
      await stepper
        .locator('[data-object-setup-cultivar-own="true"]')
        .fill("Рожевий");
      await scanAccessibility(page, testInfo, "object-setup-own-cultivar-375");
      await page.screenshot({
        path: testInfo.outputPath("own-cultivar-375.png"),
      });
      await primary(stepper).click();
      await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u);
      const ownObject = (await objectsOf(pool, user.id)).at(-1)!;
      expect(ownObject).toMatchObject({
        display_name: "Бабусині помідори",
        catalog_item_id: null,
        variety_state: "own",
        variety_text: "Рожевий",
        species_text: "Помідор бабусин",
      });
      // The owner sees their own words; nobody else does.
      await expect(
        page.locator('main[data-workspace-surface="object"]'),
      ).toContainText("Помідор бабусин · Рожевий");

      // A species from the base: «Сорт» opens on «Не знаю», and «Додати»
      // works without touching it.
      stepper = await openStepper(page, `?space=${spaceId}`);
      await stepper.locator('[data-object-setup-kind="plant"]').click();
      await stepper.getByRole("button", { name: "Пропустити" }).click();
      await stepper
        .locator('[data-object-setup-name="true"]')
        .fill("Томат на грядці");
      await page.keyboard.press("Enter");
      await stepper
        .locator('[data-object-setup-species-search="true"]')
        .fill("томат");
      await stepper.locator(`[data-species-id="${f.tomato}"]`).click();
      await primary(stepper).click();
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "unknown",
      );
      await primary(stepper).click();
      await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u);
      expect((await objectsOf(pool, user.id)).at(-1)).toMatchObject({
        catalog_item_id: f.tomato,
        variety_state: "selected",
        species_text: null,
      });
    } finally {
      await cleanupCollection(pool, user.id);
      await context.close();
    }
  });

  test("the species search: everyday words find the base first, nothing outside it, Enter takes only a highlighted row, a failed search keeps both answers", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const f = fixture!;
    const { context, user } = await gardener(
      browser,
      baseURL!,
      pool,
      "ove524-search",
    );
    try {
      const spaceId = await createSpace(context.request, baseURL!, "Грядка");
      const page = await context.newPage();
      const stepper = await openStepper(page, `?space=${spaceId}`);
      await stepper.locator('[data-object-setup-kind="plant"]').click();
      await stepper.getByRole("button", { name: "Пропустити" }).click();
      await stepper.locator('[data-object-setup-name="true"]').fill("Перша");
      await page.keyboard.press("Enter");
      const search = stepper.locator(
        '[data-object-setup-species-search="true"]',
      );
      const firstFound = stepper.locator("[data-species-id]").first();

      for (const [word, id] of [
        ["полуниця", f.strawberry],
        ["болгарський перець", f.pepper],
        ["кабачок", f.zucchini],
      ] as const) {
        await search.fill(word);
        await expect(firstFound).toHaveAttribute("data-species-id", id);
      }

      // Outside the base: nothing is offered, and the own variant takes it.
      await search.fill("вовк сірий");
      await expect(stepper.locator("[data-choice-status]")).toHaveAttribute(
        "data-choice-status",
        "empty",
      );
      await expect(
        stepper.locator(`[data-species-id="${f.wolf}"]`),
      ).toHaveCount(0);
      await expect(stepper.locator('[data-choice-option="own"]')).toBeVisible();

      // Enter with nothing highlighted takes nothing and moves nowhere.
      await search.fill("помідор");
      await expect(
        stepper.locator(`[data-species-id="${f.tomato}"]`),
      ).toBeVisible();
      await search.press("Enter");
      await expect(page).toHaveURL(/step=species/u);
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "unknown",
      );
      // Highlighted with the arrows, it is taken.
      await search.press("ArrowDown");
      await search.press("ArrowDown");
      await search.press("Enter");
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        `species:${f.tomato}`,
      );

      // A search that fails says so; «Не знаю» and the own variant work.
      await page.route("**/api/public/catalog/species**", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ suggestions: [], state: "unavailable" }),
        }),
      );
      await search.fill("кабачки");
      await expect(stepper.locator("[data-choice-status]")).toHaveText(
        "Пошук зараз недоступний. Можна ввести свій варіант або вибрати «Не знаю».",
      );
      await stepper.locator('[data-choice-option="unknown"]').click();
      await expect(selected(stepper)).toHaveAttribute(
        "data-choice-option",
        "unknown",
      );
      await stepper.locator('[data-choice-option="own"]').click();
      await expect(
        stepper.locator('[data-object-setup-species-own="true"]'),
      ).toHaveValue("кабачки");
    } finally {
      await cleanupCollection(pool, user.id);
      await context.close();
    }
  });

  test("the cultivar list: only what objects use and gardeners added; a matching name reuses the entry", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const f = fixture!;
    const { context, user } = await gardener(
      browser,
      baseURL!,
      pool,
      "ove524-list",
    );
    try {
      const spaceId = await createSpace(context.request, baseURL!, "Теплиця");
      const page = await context.newPage();
      const stepper = await openStepper(page, `?space=${spaceId}`);
      await stepper.locator('[data-object-setup-kind="plant"]').click();
      await stepper.getByRole("button", { name: "Пропустити" }).click();
      await stepper.locator('[data-object-setup-name="true"]').fill("Серце");
      await page.keyboard.press("Enter");
      await stepper
        .locator('[data-object-setup-species-search="true"]')
        .fill("помідор");
      await stepper.locator(`[data-species-id="${f.tomato}"]`).click();
      await primary(stepper).click();

      await expect(
        stepper.locator(`[data-cultivar-id="${f.oxheart}"]`),
      ).toBeVisible();
      await expect(
        stepper.locator(`[data-cultivar-id="${f.barao}"]`),
      ).toHaveCount(0);
      const filter = stepper.locator(
        '[data-object-setup-cultivar-search="true"]',
      );
      await filter.fill("бичаче серце");
      await expect(
        stepper.locator("[data-cultivar-id]").first(),
      ).toHaveAttribute("data-cultivar-id", f.oxheart);
      await expect(stepper.locator('[data-cultivar-add="true"]')).toHaveCount(
        0,
      );
      // A typo still finds it.
      await filter.fill("бичаче серцк");
      await expect(
        stepper.locator(`[data-cultivar-id="${f.oxheart}"]`),
      ).toBeVisible();
      await stepper.locator(`[data-cultivar-id="${f.oxheart}"]`).click();
      await primary(stepper).click();
      await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u);
      expect((await objectsOf(pool, user.id))[0]!.catalog_item_id).toBe(
        f.oxheart,
      );
      expect(await gardenerEntries(pool, f.tomato)).toEqual([]);
    } finally {
      await cleanupCollection(pool, user.id);
      await context.close();
    }
  });

  test("settings: an object without a photo gets one, it is the cover; replaced, then removed with its files queued", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const { context, user } = await gardener(
      browser,
      baseURL!,
      pool,
      "ove524-settings",
    );
    try {
      const spaceId = await createSpace(context.request, baseURL!, "Пасіка");
      const objectId = randomUUID();
      const created = await context.request.post(
        `${baseURL}/api/garden/objects`,
        {
          data: {
            requestId: objectId,
            objectKind: "animal",
            displayName: "Вулик 1",
            spaceId,
          },
        },
      );
      expect(created.status()).toBe(201);
      await fakeStaging(context, async () => "stage");
      // The save is read; the row the server's claim would write is written
      // here (replacing the previous one, as the server does), and the page is
      // told it was saved.
      const saved: string[] = [];
      await context.route(
        `**/api/garden/objects/${objectId}/photo`,
        async (route) => {
          if (route.request().method() !== "PUT") return route.continue();
          const photo = (
            route.request().postDataJSON() as { photo: Record<string, unknown> }
          ).photo;
          const mediaAssetId = photo.mediaAssetId as string;
          saved.push(mediaAssetId);
          await pool.query(
            "delete from media_assets where plant_object_id = $1",
            [objectId],
          );
          await insertObjectPhoto(pool, {
            owner: user.id,
            objectId,
            mediaAssetId,
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "saved" }),
          });
        },
      );

      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/garden/objects/${objectId}/settings`, {
        waitUntil: "load",
      });
      const settings = page.locator("[data-object-photo-settings]");
      await waitForHydration(settings);
      for (const orientation of ["landscape", "portrait"] as const) {
        const file = {
          name: `${orientation}.png`,
          mimeType: "image/png",
          buffer: await photograph(page, orientation, "image/png"),
        };
        if (orientation === "landscape") {
          // No photo yet: the field offers to add one.
          await settings
            .locator('[data-owned-photo-input="true"]')
            .setInputFiles(file);
        } else {
          // «Замінити» opens the same editor for the next one.
          const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            settings.getByRole("button", { name: "Замінити" }).click(),
          ]);
          await chooser.setFiles(file);
        }
        await expect(
          settings.locator('[data-photo-crop-done="true"]'),
        ).toBeEnabled({
          timeout: 20_000,
        });
        await settings.getByRole("button", { name: "Готово" }).click();
        const expected = orientation === "landscape" ? 1 : 2;
        await expect
          .poll(() => saved.length, { timeout: 30_000 })
          .toBe(expected);
        await expect(settings).toHaveAttribute(
          "data-object-photo-settings",
          "saved",
        );
      }
      await expect(
        settings.locator('[data-owned-photo-preview="true"]'),
      ).toHaveAttribute("srcset", /480w/u);
      await scanAccessibility(page, testInfo, "object-settings-photo");

      await page.goto(`/garden/objects/${objectId}`, { waitUntil: "load" });
      await expect(
        page.getByRole("img", { name: "Вулик 1" }).first(),
      ).toHaveAttribute("src", new RegExp(saved[1]!, "u"));

      // «Прибрати» takes it away through the real route, files and all.
      await page.goto(`/garden/objects/${objectId}/settings`, {
        waitUntil: "load",
      });
      await waitForHydration(settings);
      await settings.getByRole("button", { name: "Прибрати" }).click();
      await expect(settings).toHaveAttribute(
        "data-object-photo-settings",
        "removed",
      );
      expect(
        (
          await pool.query(
            "select 1 from media_assets where plant_object_id = $1",
            [objectId],
          )
        ).rows,
      ).toEqual([]);
      const revokes = await pool.query<{ reason: string }>(
        `select payload->>'reason' as reason from job_queue
          where payload->>'kind' = 'media_derivative_revoke'
            and payload::text like '%' || $1 || '%'`,
        [saved[1]],
      );
      expect(revokes.rows.length).toBeGreaterThan(0);
      await pool.query(
        `delete from job_queue where payload::text like '%' || $1 || '%'`,
        [saved[1]],
      );
      await page.goto(`/garden/objects/${objectId}`, { waitUntil: "load" });
      await expect(page.getByRole("img", { name: "Вулик 1" })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await pool.query("delete from media_assets where owner_user_id = $1", [
        user.id,
      ]);
      await cleanupCollection(pool, user.id);
      await context.close();
    }
  });

  test("the endpoint: one object per intent, one entry per name, and every refusal is a status", async ({
    browser,
    baseURL,
  }) => {
    const f = fixture!;
    const first = await gardener(browser, baseURL!, pool, "ove524-api");
    const second = await gardener(browser, baseURL!, pool, "ove524-api2");
    try {
      const spaceId = await createSpace(
        first.context.request,
        baseURL!,
        "Двір",
      );
      const otherSpace = await createSpace(
        second.context.request,
        baseURL!,
        "Двір",
      );
      const post = (context: BrowserContext, data: Record<string, unknown>) =>
        context.request.post(`${baseURL}/api/garden/objects`, { data });
      const requestId = randomUUID();
      const body = {
        requestId,
        objectKind: "animal",
        displayName: "Кохінхінка",
        spaceId,
        species: { kind: "catalog", catalogItemId: f.chicken },
        cultivar: { kind: "new", name: "Кохінхін" },
      };
      expect((await post(first.context, body)).status()).toBe(201);
      const again = await post(first.context, body);
      expect(again.status()).toBe(200);
      expect(await again.json()).toMatchObject({
        status: "created",
        replayed: true,
      });
      expect(
        (
          await post(second.context, {
            ...body,
            requestId: randomUUID(),
            spaceId: otherSpace,
            cultivar: { kind: "new", name: "кохінхін" },
          })
        ).status(),
      ).toBe(201);
      expect(
        (await gardenerEntries(pool, f.chicken)).filter(
          (entry) => entry.canonical_name === "Кохінхін",
        ),
      ).toHaveLength(1);

      for (const [label, data, status] of [
        [
          "outside the base",
          { species: { kind: "catalog", catalogItemId: f.wolf } },
          422,
        ],
        [
          "the other kind",
          {
            objectKind: "plant",
            species: { kind: "catalog", catalogItemId: f.chicken },
          },
          422,
        ],
        [
          "another species' entry",
          {
            objectKind: "plant",
            species: { kind: "catalog", catalogItemId: f.tomato },
            cultivar: { kind: "entry", catalogItemId: f.chicken },
          },
          422,
        ],
        [
          "a cultivar without a species",
          {
            species: { kind: "unknown" },
            cultivar: { kind: "new", name: "Брама" },
          },
          400,
        ],
        [
          "an own species too long",
          {
            species: { kind: "own", text: "я".repeat(121) },
            cultivar: undefined,
          },
          422,
        ],
      ] as const) {
        const response = await post(first.context, {
          ...body,
          requestId: randomUUID(),
          displayName: `Відмова: ${label}`,
          cultivar: { kind: "unknown" },
          ...data,
        });
        expect(response.status(), label).toBe(status);
      }

      const forms = await first.context.request.get(
        `${baseURL}/api/garden/catalog/forms?species=${f.chicken}&kind=animal`,
      );
      expect(forms.status()).toBe(200);
      expect(forms.headers()["cache-control"]).toContain("no-store");
      const guest = await browser.newContext();
      const refused = await guest.request.get(
        `${baseURL}/api/garden/catalog/forms?species=${f.chicken}&kind=animal`,
      );
      expect(refused.status()).toBe(401);
      await guest.close();
    } finally {
      await cleanupCollection(pool, first.user.id);
      await cleanupCollection(pool, second.user.id);
      await first.context.close();
      await second.context.close();
    }
  });
});
