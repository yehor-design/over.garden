import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

/**
 * The picker's secondary path end to end (OVE-392, ADR-0026 D7), against a
 * production build and a database holding a real Catalogue of Life release.
 *
 * The primary list is canonical nodes. When it is thin, the composer offers
 * the whole checklist; picking a row there creates the node, its ancestors and
 * its Catalogue of Life identifier from that moment, and the gardener's entry
 * publishes against it like any other. Picking the same usage again reuses the
 * node rather than making a second one.
 *
 * It needs the release in the database. Ingest it first:
 *
 *   (cd services/matching && .venv/bin/python -m scripts.ingest_catalogue_of_life \
     --archive /path/coldp.zip)
 *   pnpm build && BETTER_AUTH_URL=http://127.0.0.1:3130 \
 *     pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/catalog-full-catalogue.spec.ts
 *
 * Without a snapshot the whole spec skips: an empty checklist is not a
 * failure of the picker, and saying so is better than a red run nobody trusts.
 */
const TEST_PASSWORD = "OVE392-local-password-1!";
const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";

/** A capybara: in every release, in no OverGarden garden, unmistakable. */
const CHECKLIST_QUERY = "hydrochoerus hydro";
const CHECKLIST_NAME = "Hydrochoerus hydrochaeris";
const CHECKLIST_SLUG = "hydrochoerus-hydrochaeris";

test.use({ trace: "off" });

test.describe("OVE-392 the full catalogue", () => {
  test("offers the checklist when the list is thin, and picking a row creates the node", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const email = `ove392-browser-${randomUUID()}@example.test`;
    let userId: string | null = null;

    try {
      const snapshot = await readCurrentSnapshot(pool);
      test.skip(
        snapshot === null,
        "No Catalogue of Life snapshot in this database; run the ingest first.",
      );
      await removeExistingChecklistNode(pool);

      userId = await createVerifiedCredentialSession({
        baseURL,
        context,
        email,
        pool,
      });
      await selectLocale(context, baseURL, "uk");

      // The route itself: the primary scope knows nothing about a capybara,
      // the full scope does, and a checklist row carries an identifier rather
      // than a node id.
      const canonical = await readTypeahead(page, CHECKLIST_QUERY, null);
      // No node for the species itself (its genus and subfamily may exist as
      // ancestors of something else), and few enough rows that the picker
      // offers the checklist.
      expect(
        canonical.suggestions.map((row) => row.displayName),
      ).not.toContain(CHECKLIST_NAME);
      expect(canonical.suggestions.length).toBeLessThan(3);
      const full = await readTypeahead(page, CHECKLIST_QUERY, "full");
      expect(full.scope).toBe("full");
      const match = full.suggestions.find(
        (row) => row.displayName === CHECKLIST_NAME,
      );
      expect(match, JSON.stringify(full.suggestions)).toBeDefined();
      expect(match!.colId).toMatch(/^[A-Za-z0-9]+$/u);
      expect("id" in match!).toBe(false);

      // The composer: a thin list, the offer, the checklist row, the pick.
      await openComposer(page);
      await pickerCombobox(page).fill(CHECKLIST_QUERY);
      const offer = page.locator('[data-catalog-full-catalogue="offer"]');
      await expect(offer).toBeVisible({ timeout: 10_000 });
      await offer.click();

      const checklistOption = page.locator(
        '[data-catalog-option="full_catalogue"]',
        { hasText: CHECKLIST_NAME },
      );
      await expect(checklistOption).toBeVisible({ timeout: 15_000 });
      await checklistOption.click();

      await expect(
        page.locator("[data-catalog-availability='selected']"),
      ).toContainText(CHECKLIST_NAME, { timeout: 20_000 });

      const created = await readChecklistNode(pool);
      expect(created, "the pick created no node").not.toBeNull();
      expect(created!.public_slug).toBe(CHECKLIST_SLUG);
      expect(created!.rank).toBe("species");
      expect(created!.kingdom).toBe("Animalia");
      expect(created!.node_kind).toBe("taxon");
      expect(created!.col_ids).toEqual([match!.colId]);
      // Its ancestors came with it, and none of them took an address.
      expect(created!.ancestors).toBeGreaterThan(3);
      expect(created!.addressed_ancestors).toBe(0);

      // Picking the same organism again reuses the node: once it exists the
      // primary list finds it, and no second node is made. This runs before
      // the entry, because the first-entry composer is gone once the gardener
      // has an object.
      await page.locator('[data-catalog-picker="true"] button[aria-label]').first().click();
      await pickerCombobox(page).fill(CHECKLIST_QUERY);
      const primary = page.locator('[data-catalog-option="species"]', {
        hasText: CHECKLIST_NAME,
      });
      await expect(primary.first()).toBeVisible({ timeout: 15_000 });
      await primary.first().click();
      await expect(
        page.locator("[data-catalog-availability='selected']"),
      ).toContainText(CHECKLIST_NAME, { timeout: 20_000 });
      expect(
        await countChecklistNodes(pool),
        "a second pick made a second node",
      ).toBe(1);

      // The entry publishes against the node the checklist created.
      const published = await publishEntry(
        page,
        `Капібара ${randomUUID().slice(0, 8)}`,
        "Перший запис про капібару.",
        pool,
      );
      expect(published.variety_state).toBe("selected");
      expect(published.catalog_item_id).toBe(created!.id);

      // The card carries the Catalogue of Life attribution, with its licence.
      const card = await page.request.get(`/species/${CHECKLIST_SLUG}`, {
        headers: { accept: "text/html" },
      });
      expect(card.status()).toBe(200);
      const html = await card.text();
      expect(html).toContain("Catalogue of Life");
      expect(html).toContain("CC BY 4.0");
    } finally {
      if (userId) await cleanupSyntheticUser(pool, userId);
      await removeExistingChecklistNode(pool).catch(() => undefined);
      await pool.end().catch(() => undefined);
    }
  });
});

async function readTypeahead(
  page: Page,
  query: string,
  scope: "full" | null,
): Promise<{
  suggestions: Array<Record<string, unknown> & { displayName: string; colId?: string }>;
  state: string;
  scope?: string;
}> {
  const params = new URLSearchParams({ q: query, kind: "animal", locale: "uk" });
  if (scope) params.set("scope", scope);
  const response = await page.request.get(
    `/api/public/catalog/typeahead?${params.toString()}`,
  );
  expect(response.status()).toBe(200);
  return response.json();
}

async function readCurrentSnapshot(pool: Pool) {
  const result = await pool
    .query<{ id: string | null }>(
      "select catalog_col_current_snapshot()::text as id",
    )
    .catch(() => null);
  return result?.rows[0]?.id ?? null;
}

async function readChecklistNode(pool: Pool) {
  const result = await pool.query<{
    id: string;
    public_slug: string | null;
    rank: string | null;
    kingdom: string | null;
    node_kind: string;
    col_ids: string[];
    ancestors: number;
    addressed_ancestors: number;
  }>(
    `select
       item.id::text as id,
       item.public_slug,
       item.rank,
       item.kingdom,
       item.node_kind,
       coalesce((
         select array_agg(identifier.value)
         from catalog_item_identifiers as identifier
         where identifier.catalog_item_id = item.id and identifier.scheme = 'col'
       ), array[]::text[]) as col_ids,
       coalesce(array_length(item.ancestor_ids, 1), 0) as ancestors,
       (
         select count(*)::int from catalog_items as ancestor
         where ancestor.id = any(item.ancestor_ids) and ancestor.public_slug is not null
       ) as addressed_ancestors
     from catalog_items as item
     where item.canonical_name = $1 and item.identity_state = 'active'
     order by item.created_at desc
     limit 1`,
    [CHECKLIST_NAME],
  );
  return result.rows[0] ?? null;
}

async function countChecklistNodes(pool: Pool) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from catalog_items
     where canonical_name = $1 and identity_state = 'active'`,
    [CHECKLIST_NAME],
  );
  return result.rows[0]?.count ?? 0;
}

/** A previous run's node, and the ancestors nothing else uses. */
async function removeExistingChecklistNode(pool: Pool) {
  await pool.query(
    `delete from plant_objects where catalog_item_id in (
       select id from catalog_items where canonical_name = $1
     )`,
    [CHECKLIST_NAME],
  );
  await pool.query("delete from catalog_items where canonical_name = $1", [
    CHECKLIST_NAME,
  ]);
}

function pickerCombobox(page: Page) {
  return page.locator(
    '#first-entry-composer [data-catalog-picker="true"] [role="combobox"]',
  );
}

async function openComposer(page: Page) {
  const response = await page.goto("/garden");
  expect(response?.status()).toBe(200);
  const composer = page.locator("#first-entry-composer");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.scrollIntoViewIfNeeded();
  // A capybara is an animal, and the picker's kingdoms follow the object kind.
  const animal = composer.locator('[data-object-kind="animal"]');
  if ((await animal.count()) > 0) await animal.first().click();
  const details = composer.locator("details").first();
  if (
    !(await details.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    ))
  ) {
    await details.locator("summary").first().click();
  }
  await expect(pickerCombobox(page)).toBeVisible({ timeout: 10_000 });
}

async function publishEntry(
  page: Page,
  plantName: string,
  body: string,
  pool: Pool,
) {
  const composer = page.locator("#first-entry-composer");
  await composer.locator('input[name="plantName"]').fill(plantName);
  const spaceName = composer.locator('input[name="spaceName"]');
  if ((await spaceName.count()) > 0 && !(await spaceName.inputValue())) {
    await spaceName.fill("Сад OVE-392");
  }
  const editor = composer
    .locator('[data-structured-journal-composer="true"] [contenteditable="true"]')
    .first();
  await editor.click();
  await page.keyboard.type(body);
  const disclosure = composer.locator(
    'input[name="publicationDisclosureAccepted"]',
  );
  if ((await disclosure.count()) > 0) await disclosure.check();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/garden/entries") &&
        candidate.request().method() === "POST",
      { timeout: 30_000 },
    ),
    composer.getByRole("button", { name: /Опублікувати/u }).click(),
  ]);
  if (response.status() >= 400) {
    const text = await response.text().catch(() => "(body unavailable)");
    throw new Error(`Publish answered ${response.status()}: ${text}`);
  }
  await page
    .waitForURL((url) => !url.pathname.endsWith("/garden") || url.search.length > 0, {
      timeout: 30_000,
    })
    .catch(() => undefined);
  const row = await pool.query<{
    variety_state: string;
    catalog_item_id: string | null;
  }>(
    `select variety_state, catalog_item_id::text as catalog_item_id
     from plant_objects where display_name = $1 order by created_at desc limit 1`,
    [plantName],
  );
  if (!row.rows[0]) throw new Error(`Object "${plantName}" was not persisted.`);
  return row.rows[0];
}

async function createVerifiedCredentialSession(input: {
  baseURL: string;
  context: BrowserContext;
  email: string;
  pool: Pool;
}) {
  const signUp = await input.context.request.post(
    `${input.baseURL}/api/auth/sign-up/email`,
    {
      headers: { origin: input.baseURL },
      data: {
        email: input.email,
        password: TEST_PASSWORD,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    },
  );
  const user = await input.pool.query<{ id: string }>(
    'select id::text as id from public."user" where email = $1::text',
    [input.email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error(
      `Synthetic auth user was not persisted (sign-up answered ${signUp.status()}).`,
    );
  }
  await input.pool.query(
    'update public."user" set "emailVerified" = true where id = $1::uuid',
    [userId],
  );
  const signIn = await input.context.request.post(
    `${input.baseURL}/api/auth/sign-in/email`,
    {
      headers: { origin: input.baseURL },
      data: { email: input.email, password: TEST_PASSWORD },
    },
  );
  expect(signIn.ok()).toBe(true);
  return userId;
}

async function selectLocale(
  context: BrowserContext,
  baseURL: string,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: INTERFACE_MARKET_COOKIE,
      value: locale === "uk" ? "ukraine" : "bulgaria",
      url: baseURL,
    },
  ]);
}

async function cleanupSyntheticUser(pool: Pool, userId: string) {
  await pool.query('delete from public."user" where id = $1::uuid', [userId]);
}

function requiredLocalDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL is required for the checklist spec.");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("The checklist spec runs against a loopback database only.");
  }
  return url;
}
