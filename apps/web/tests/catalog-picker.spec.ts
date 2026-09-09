import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

/**
 * The gardener picker end to end (OVE-387, ADR-0026 D5–D7), against a
 * production build and a real database:
 *
 *   1. the three outcomes — a species, a form with its species implied, and
 *      "add as my own name" — each published into a gardener's garden and
 *      read back from `plant_objects`;
 *   2. a keyboard-only run: combobox roles, arrow keys moving
 *      `aria-activedescendant`, Enter picking;
 *   3. the route stubbed to 503: the own-name outcome alone, and the entry
 *      still publishes;
 *   4. the object page's control: an own-name object re-resolved to a species;
 *   5. an axe scan of the composer with no violations;
 *   6. search misses recorded with the normalized text.
 *
 * No worker is involved anywhere: the picker reads Postgres alone, so a
 * stopped worker is the ordinary state of this run, not a special case.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/catalog-picker.spec.ts
 */
const TEST_PASSWORD = "OVE387-local-password-1!";
const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";

interface Fixture {
  suffix: string;
  speciesId: string;
  cultivarId: string;
  /** OVE-395: the same denomination, in no register, for the market boost. */
  homonymId: string;
  animalTaxonId: string;
  breedId: string;
  snapshotId: string;
  assertionId: string;
}

test.use({ trace: "off" });

test.describe("OVE-387 catalog picker", () => {
  test("offers three outcomes, works by keyboard, survives a 503 and re-resolves on the object page", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    // A step that cannot proceed fails with its own message instead of the
    // test timeout.
    page.setDefaultTimeout(15_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const email = `ove387-browser-${randomUUID()}@example.test`;
    let userId: string | null = null;
    let fixture: Fixture | null = null;

    try {
      fixture = await seedFixture(pool);
      userId = await createVerifiedCredentialSession({ baseURL, context, email, pool });
      await selectLocale(context, baseURL, "uk");

      // The organism card before any first-hand content (ADR-0026 D9):
      // reachable, noindex, nothing but the fact paragraph.
      const speciesPath = `/species/ove387-${fixture.suffix}-${fixture.speciesId.slice(0, 8)}`;
      const before = await page.request.get(speciesPath, { headers: { accept: "text/html" } });
      expect(before.status()).toBe(200);
      const beforeHtml = await before.text();
      expect(beforeHtml).toContain("Публічних записів садівників ще немає.");
      expect(beforeHtml).toMatch(/name="robots" content="noindex, nofollow"/u);
      expect(beforeHtml).not.toContain('data-organism-section="experience"');

      // Outcome 1: a species, picked by keyboard alone.
      await openComposer(page);
      const combobox = pickerCombobox(page);
      await combobox.focus();
      await page.keyboard.type("томат");
      const listbox = pickerListbox(page);
      await expect(listbox).toBeVisible({ timeout: 10_000 });
      const options = listbox.getByRole("option");
      await expect(options.first()).toHaveAttribute("data-catalog-option", "species");
      await expect(options.first()).toContainText(/Помідор/u);
      await expect(listbox.locator('[data-catalog-option="own_name"]')).toHaveCount(1);
      await expect(combobox).toHaveAttribute("aria-expanded", "true");
      await expect(combobox).toHaveAttribute("aria-controls", await listbox.getAttribute("id") ?? "");

      await page.keyboard.press("ArrowDown");
      const firstOptionId = await options.first().getAttribute("id");
      await expect(combobox).toHaveAttribute("aria-activedescendant", firstOptionId ?? "");
      await page.keyboard.press("ArrowDown");
      const secondOptionId = await options.nth(1).getAttribute("id");
      await expect(combobox).toHaveAttribute("aria-activedescendant", secondOptionId ?? "");
      await page.keyboard.press("ArrowUp");
      await expect(combobox).toHaveAttribute("aria-activedescendant", firstOptionId ?? "");
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-catalog-availability='selected']")).toContainText(/Вид: Помідор/u);
      await expect(page.locator("[data-catalog-picker='true']")).not.toContainText(
        /Перевірено|Підтверджено джерелом|Кандидат|карантин|каталог продукту/iu,
      );

      await runAxeOnComposer(page);

      const first = await publishEntry(page, `Помідор ${fixture.suffix}`, "Перший запис про помідор.");
      expect(first.variety_state).toBe("selected");
      expect(await readItem(pool, first.catalog_item_id)).toMatchObject({
        node_kind: "taxon",
        canonical_name: expect.stringMatching(/^Solanum lycopersicum/u),
      });

      // Publishing set the species' first-hand clock and expired its card: the
      // next load counts one gardener, is indexable, keeps the D9 section
      // order and ships the "Names and sources" panel closed.
      await page.goto(speciesPath, { waitUntil: "load" });
      // The site shell renders its own loading `main`s; the card is the one
      // carrying the fact paragraph.
      const card = page.locator("main", { has: page.locator("[data-organism-fact]") });
      await expect(card.locator("[data-organism-fact]")).toContainText("Публічні журнали ведуть 1 садівник");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
      const cardHtml = await card.innerHTML();
      const sectionOrder = [
        'data-organism-section="facts"',
        'data-organism-section="experience"',
        'data-organism-section="relations"',
        'data-organism-section="names-and-sources"',
        'data-organism-section="attribution"',
      ].map((marker) => cardHtml.indexOf(marker));
      expect(sectionOrder.every((index) => index >= 0)).toBe(true);
      expect([...sectionOrder].sort((a, b) => a - b)).toEqual(sectionOrder);
      const namesPanel = page.locator('details[data-organism-section="names-and-sources"]');
      await expect(namesPanel).toHaveJSProperty("open", false);
      await namesPanel.locator("summary").click();
      await expect(namesPanel).toHaveJSProperty("open", true);
      await expect(namesPanel).toContainText("Solanum lycopersicum");
      await expect(page.locator('[data-organism-relations="forms"]')).toContainText("Де Барао");
      await page.goto("/garden");

      // Outcome 2: a form, with its species implied in the row.
      await openComposer(page);
      await pickerCombobox(page).fill("де барао");
      const cultivarOption = pickerListbox(page)
        .locator('[data-catalog-option="cultivar"]')
        .first();
      await expect(cultivarOption).toBeVisible({ timeout: 10_000 });
      // OVE-395, ADR-0026 D7: two cultivars carry exactly this denomination
      // and only one of them is in the Ukrainian register. The row a Ukrainian
      // reader is offered first, and publishes, is the registered one — the
      // identity below is the assertion, not the count, because a database
      // may legitimately hold other organisms whose names begin the same way.
      await expect(cultivarOption).toContainText(/Сорт · Помідор/u);
      await cultivarOption.click();
      await expect(page.locator("[data-catalog-availability='selected']")).toContainText(/Сорт: Де Барао/u);
      const second = await publishEntry(page, `Де Барао ${fixture.suffix}`, "Перший запис про сорт.");
      expect(second).toMatchObject({
        variety_state: "selected",
        catalog_item_id: fixture.cultivarId,
      });
      expect(second?.catalog_item_id).not.toBe(fixture.homonymId);

      // Outcome 3: the gardener's own name, which matches nothing.
      await openComposer(page);
      const ownName = `Моя рідкісна ягода ${fixture.suffix}`;
      await pickerCombobox(page).fill(ownName);
      const ownNameOption = pickerListbox(page).locator('[data-catalog-option="own_name"]');
      await expect(ownNameOption).toBeVisible({ timeout: 10_000 });
      await expect(pickerListbox(page).locator('[data-catalog-option="species"]')).toHaveCount(0);
      await ownNameOption.click();
      await expect(page.locator("[data-catalog-availability='selected']")).toContainText(
        new RegExp(`Ваша назва: ${escapeRegExp(ownName)}`, "u"),
      );
      // No rename: the own name the gardener just declared is the object's
      // name, and publishing must carry exactly it.
      const third = await publishEntry(page, null, "Перший запис про ягоду.");
      expect(third).toMatchObject({
        variety_state: "free_text",
        variety_text: ownName,
        catalog_item_id: null,
      });
      await expect
        .poll(async () => readSearchMiss(pool, ownName.toLowerCase()), { timeout: 10_000 })
        .toMatchObject({ locale: "uk", object_kind: "plant" });

      // The route stubbed to 503: only the own name remains, and it publishes.
      await page.route("**/api/public/catalog/typeahead**", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ suggestions: [], state: "unavailable" }),
        }),
      );
      await openComposer(page);
      const offlineName = `Без каталогу ${fixture.suffix}`;
      await pickerCombobox(page).fill(offlineName);
      await expect(page.locator("[data-catalog-availability='unavailable']")).toBeVisible({ timeout: 10_000 });
      const offlineOptions = pickerListbox(page).getByRole("option");
      await expect(offlineOptions).toHaveCount(1);
      await expect(offlineOptions.first()).toHaveAttribute("data-catalog-option", "own_name");
      await offlineOptions.first().click();
      // Same as above: the declared own name is the object's name.
      const fourth = await publishEntry(page, null, "Запис без каталогу.");
      expect(fourth).toMatchObject({
        variety_state: "free_text",
        variety_text: offlineName,
        catalog_item_id: null,
      });
      await page.unroute("**/api/public/catalog/typeahead**");

      // The object page: an own-name object re-resolved to the species.
      await page.goto(`/garden/objects/${third.id}`);
      const resolveSection = page.locator("#passport-catalog");
      await expect(resolveSection).toBeVisible({ timeout: 10_000 });
      await resolveSection.locator('[data-catalog-picker="true"] [role="combobox"]').fill("помідор");
      const speciesOption = resolveSection.locator('[data-catalog-picker="true"] [role="listbox"]').locator('[data-catalog-option="species"]').first();
      await expect(speciesOption).toBeVisible({ timeout: 10_000 });
      await speciesOption.click();
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === "POST" && response.status() < 400, { timeout: 15_000 }),
        resolveSection.getByRole("button", { name: /Зберегти відповідність каталогу/u }).click(),
      ]);
      await expect
        .poll(
          async () =>
            (await readItem(pool, (await readObject(pool, third.id))?.catalog_item_id ?? null))?.canonical_name ?? null,
          { timeout: 15_000 },
        )
        .toMatch(/^Solanum lycopersicum/u);

      console.info(
        JSON.stringify({
          outcomes: 3,
          organismCardBeforeAndAfterPublish: true,
          keyboardOnlyPick: true,
          routeUnavailableStillPublishes: true,
          objectPageReresolve: true,
          axeViolations: 0,
        }),
      );
    } finally {
      if (userId) await cleanupSyntheticUser(pool, userId);
      if (fixture) await cleanupFixture(pool, fixture);
      await pool.end();
    }
  });
});

/** The picker's own combobox: the page has native selects with that role too. */
function pickerCombobox(page: Page) {
  return page.locator('#first-entry-composer [data-catalog-picker="true"] [role="combobox"]');
}

function pickerListbox(page: Page) {
  return page.locator('#first-entry-composer [data-catalog-picker="true"] [role="listbox"]');
}

async function openComposer(page: Page) {
  const response = await page.goto("/garden");
  expect(response?.status()).toBe(200);
  const composer = page.locator("#first-entry-composer");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.scrollIntoViewIfNeeded();
  // The name field is the picker, so nothing has to be opened to reach it.
  // It used to sit under a closed "More details", which is how the graph went
  // unnoticed in the product for a week.
  await expect(pickerCombobox(page)).toBeVisible({ timeout: 10_000 });
}

/**
 * Publishes the composer. `plantName` renames the object first; `null` keeps
 * whatever the picker already holds, which is what the own-name outcome needs
 * — the name field *is* the picker, so renaming after declaring an own name
 * would be declaring a different one.
 */
async function publishEntry(page: Page, plantName: string | null, body: string) {
  const composer = page.locator("#first-entry-composer");
  const nameField = composer.locator('input[name="plantName"]');
  if (plantName !== null) {
    // Typing opens the picker's listbox, and the list can cover the fields
    // below it on a narrow viewport; Escape closes it and keeps the text.
    await nameField.fill(plantName);
    await nameField.press("Escape");
  }
  // The object is read back by the name it is actually published under, which
  // is whatever the field holds — the picker fills it on a pick, and keeps the
  // gardener's own name when there is none.
  const publishedName = await nameField.inputValue();
  // A gardener without a space names the first one; the field is required.
  const spaceName = composer.locator('input[name="spaceName"]');
  if ((await spaceName.count()) > 0 && !(await spaceName.inputValue())) {
    await spaceName.fill("Сад OVE-387");
  }
  const editor = composer.locator('[data-structured-journal-composer="true"] [contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type(body);
  const disclosure = composer.locator('input[name="publicationDisclosureAccepted"]');
  if ((await disclosure.count()) > 0) await disclosure.check();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.url().includes("/api/garden/entries") && candidate.request().method() === "POST",
      { timeout: 30_000 },
    ),
    composer.getByRole("button", { name: /Опублікувати/u }).click(),
  ]);
  // The composer navigates as soon as the publish answers, and the body of a
  // response whose page has moved on is not always retrievable; it is read
  // only to explain a failure.
  if (response.status() >= 400) {
    const body = await response.text().catch(() => "(body unavailable)");
    throw new Error(`Publish answered ${response.status()}: ${body}`);
  }
  await page.waitForURL((url) => !url.pathname.endsWith("/garden") || url.search.length > 0, { timeout: 30_000 }).catch(() => undefined);
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  try {
    const row = await pool.query<{
      id: string;
      variety_state: string;
      variety_text: string | null;
      catalog_item_id: string | null;
    }>(
      `select id::text as id, variety_state, variety_text, catalog_item_id::text as catalog_item_id
       from plant_objects where display_name = $1 order by created_at desc limit 1`,
      [publishedName],
    );
    if (!row.rows[0]) {
      throw new Error(`Object "${publishedName}" was not persisted.`);
    }
    return row.rows[0];
  } finally {
    await pool.end();
  }
}

async function runAxeOnComposer(page: Page) {
  // Evaluated through the protocol rather than injected as a script element:
  // the page's Content-Security-Policy would block the element, and a blocked
  // script tag never fires its load event.
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Element, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> } }).axe;
    const composer = document.querySelector("#first-entry-composer");
    if (!composer) throw new Error("composer missing");
    const result = await axe.run(composer, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }));
  });
  expect(violations, JSON.stringify(violations)).toEqual([]);
}

/**
 * A run that was killed before its `finally` leaves its rows behind; the next
 * run removes them first so two identical tomato species never compete.
 */
async function cleanupStaleRuns(pool: Pool) {
  const staleUsers = await pool.query<{ id: string }>(
    `select id::text as id from public."user" where email like 'ove387-browser-%'`,
  );
  const userIds = staleUsers.rows.map((row) => row.id);
  if (userIds.length > 0) {
    await pool.query(`delete from journal_entries where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from plant_objects where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from spaces where owner_user_id = any($1::uuid[])`, [userIds]);
    await pool.query(`delete from public."user" where id = any($1::uuid[])`, [userIds]);
  }
  const staleItems = await pool.query<{ id: string }>(
    `select id::text as id from catalog_items where public_slug like 'ove387-%' or source_id like '%:ove387:%'`,
  );
  const itemIds = staleItems.rows.map((row) => row.id);
  if (itemIds.length > 0) {
    await pool.query(
      `update plant_objects set catalog_item_id = null, variety_state = 'unknown', variety_text = null
       where catalog_item_id = any($1::uuid[])`,
      [itemIds],
    );
    await pool.query(`delete from catalog_item_relations where from_catalog_item_id = any($1::uuid[]) or to_catalog_item_id = any($1::uuid[])`, [itemIds]);
    await pool.query(`delete from catalog_item_identifiers where catalog_item_id = any($1::uuid[])`, [itemIds]);
    await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [itemIds]);
  }
  await pool.query(
    `delete from catalog_source_assertions where source_snapshot_id in
       (select id from catalog_source_snapshots where source_version like 'ove387-%')`,
  );
  await pool.query(`delete from catalog_source_snapshots where source_version like 'ove387-%'`);
  await pool.query(`delete from catalog_search_misses where query_normalized like '%ove387%' or query_normalized like 'моя рідкісна ягода%' or query_normalized like 'без каталогу%'`);
}

async function seedFixture(pool: Pool): Promise<Fixture> {
  await cleanupStaleRuns(pool);
  const suffix = randomUUID().slice(0, 8);
  const snapshotId = randomUUID();
  const assertionId = randomUUID();
  const speciesId = randomUUID();
  const cultivarId = randomUUID();
  const homonymId = randomUUID();
  const animalTaxonId = randomUUID();
  const breedId = randomUUID();
  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version, source_url,
       license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'ua-state-register', 'State Register of Plant Varieties', 'taxonomy', $2, 'https://example.test/',
             'CC BY 4.0', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `ove387-${suffix}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values ($1, 'ua-state-register', $2)`,
    [assertionId, snapshotId],
  );
  const items: Array<[string, string, string, string, string, string]> = [
    [speciesId, "Solanum lycopersicum L.", "species_backbone", "la", "taxon", "Plantae"],
    [cultivarId, "Де Барао", "ua_state_register", "uk", "cultivar", "Plantae"],
    [homonymId, "Де Барао", "manual", "uk", "cultivar", "Plantae"],
    [animalTaxonId, "Apis mellifera", "species_backbone", "la", "taxon", "Animalia"],
    [breedId, "Карпатська", "ua_official_bee_breed", "uk", "breed", "Animalia"],
  ];
  for (const [id, name, source, locale, nodeKind, kingdom] of items) {
    await pool.query(
      `insert into catalog_items (id, canonical_name, normalized_name, public_slug, source,
         source_id, locale, node_kind, kingdom, identity_state, search_weight)
       values ($1, $2, catalog_normalize_name($2), $3, $4, $5, $6, $7, $8, 'active', 5)`,
      [id, name, `ove387-${suffix}-${id.slice(0, 8)}`, source, `${source}:ove387:${id}`, locale, nodeKind, kingdom],
    );
  }
  const names: Array<[string, string, string, boolean, string]> = [
    [speciesId, "Solanum lycopersicum", "la", true, "scientific_accepted"],
    [speciesId, "Lycopersicon esculentum", "la", false, "scientific_synonym"],
    [speciesId, "помідор", "uk", false, "vernacular"],
    [speciesId, "томат", "uk", false, "vernacular"],
    [speciesId, "домат", "bg", false, "vernacular"],
    [speciesId, "помидор", "ru", false, "vernacular"],
    [speciesId, "Tomato", "en", false, "vernacular"],
    [cultivarId, "Де Барао", "uk", true, "denomination"],
    [homonymId, "Де Барао", "uk", true, "denomination"],
    [animalTaxonId, "Apis mellifera", "la", true, "scientific_accepted"],
    [animalTaxonId, "бджола медоносна", "uk", false, "vernacular"],
    [breedId, "Карпатська", "uk", true, "denomination"],
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
    `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
     values ($1, 'ua_register', $2, $3)`,
    [cultivarId, `ove387-${suffix}`, assertionId],
  );
  await pool.query(
    `insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
     values ($1, $2, 'form_of', $3), ($4, $5, 'form_of', $3)`,
    [cultivarId, speciesId, assertionId, breedId, animalTaxonId],
  );
  // OVE-395: the registration fact is what `registered_ua` reads, and
  // `registered_ua` is the first key the picker orders duplicates by.
  await pool.query(
    `insert into catalog_item_facts (catalog_item_id, predicate, region_code, value, value_normalized, assertion_id)
     values ($1, 'registration_status', 'UA', 'registered', 'registered', $2)`,
    [cultivarId, assertionId],
  );
  await pool.query("select catalog_recompute_search_weight()");
  return {
    suffix,
    speciesId,
    cultivarId,
    homonymId,
    animalTaxonId,
    breedId,
    snapshotId,
    assertionId,
  };
}

async function cleanupFixture(pool: Pool, fixture: Fixture) {
  await pool.query(
    `update plant_objects set catalog_item_id = null, variety_state = 'unknown', variety_text = null
     where catalog_item_id = any($1::uuid[])`,
    [[fixture.speciesId, fixture.cultivarId, fixture.homonymId, fixture.animalTaxonId, fixture.breedId]],
  );
  await pool.query(`delete from catalog_item_relations where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_item_identifiers where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_item_facts where assertion_id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [
    [fixture.speciesId, fixture.cultivarId, fixture.homonymId, fixture.animalTaxonId, fixture.breedId],
  ]);
  await pool.query(`delete from catalog_source_assertions where id = $1`, [fixture.assertionId]);
  await pool.query(`delete from catalog_source_snapshots where id = $1`, [fixture.snapshotId]);
  await pool.query(`delete from catalog_search_misses where query_normalized like $1`, [`%${fixture.suffix.toLowerCase()}%`]);
}

async function readItem(pool: Pool, id: string | null) {
  if (!id) return null;
  const result = await pool.query<{ node_kind: string; canonical_name: string }>(
    `select node_kind, canonical_name from catalog_items where id = $1::uuid`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function readObject(pool: Pool, id: string) {
  const result = await pool.query<{ catalog_item_id: string | null; variety_state: string }>(
    `select catalog_item_id::text as catalog_item_id, variety_state from plant_objects where id = $1::uuid`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function readSearchMiss(pool: Pool, queryNormalized: string) {
  const result = await pool.query<{ locale: string; object_kind: string; occurrences: number }>(
    `select locale, object_kind, occurrences from catalog_search_misses where query_normalized = $1`,
    [queryNormalized],
  );
  return result.rows[0] ?? null;
}

async function createVerifiedCredentialSession(input: {
  baseURL: string;
  context: BrowserContext;
  email: string;
  pool: Pool;
}) {
  // The user and credential rows are written before the verification mail is
  // sent; on a database without a mail provider the request itself answers
  // 500 after the rows exist. The row is the fact this run needs.
  const signUp = await input.context.request.post(`${input.baseURL}/api/auth/sign-up/email`, {
    headers: { origin: input.baseURL },
    data: { email: input.email, password: TEST_PASSWORD, name: PRIVATE_AUTH_COMPATIBILITY_NAME },
  });
  const user = await input.pool.query<{ id: string }>(
    'select id::text as id from public."user" where email = $1::text',
    [input.email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error(`Synthetic auth user was not persisted (sign-up answered ${signUp.status()}).`);
  }
  await input.pool.query('update public."user" set "emailVerified" = true where id = $1::uuid', [userId]);
  const signIn = await input.context.request.post(`${input.baseURL}/api/auth/sign-in/email`, {
    headers: { origin: input.baseURL },
    data: { email: input.email, password: TEST_PASSWORD },
  });
  expect(signIn.ok()).toBe(true);
  return userId;
}

async function selectLocale(context: BrowserContext, baseURL: string, locale: "uk" | "bg" | "ru") {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: locale, url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: locale === "uk" ? "ukraine" : "bulgaria", url: baseURL },
  ]);
}

async function cleanupSyntheticUser(pool: Pool, userId: string) {
  await pool.query('delete from public."user" where id = $1::uuid', [userId]);
}

function requiredLocalDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL is required for the picker spec.");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("The picker spec runs against a loopback database only.");
  }
  return url;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
