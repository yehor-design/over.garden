import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

const TEST_PASSWORD = "OVE325-local-password-1!";
const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INLINE_MEDIA_FIXTURE = join(
  process.cwd(),
  "test/visual-fixtures/media/balcony-herbs-square.png",
);

const FORBIDDEN_ACTIVE_COPY = {
  uk: /(?:в черзі|синхронізовано|на цьому пристрої)/iu,
  bg: /(?:на опашка|синхронизирано|на това устройство)/iu,
  ru: /(?:в очереди|синхронизировано|на этом устройстве)/iu,
} as const;

test.describe.configure({ mode: "serial" });

test.describe("OVE-325 online-only composer cutover", () => {
  test("hydrates, autosaves, and publishes all four real composer flows without browser durability", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    const origin = requiredLoopbackOrigin(baseURL);
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const owner = await createVerifiedCredentialSession({
      origin,
      context,
      pool,
    });

    try {
      await selectLocale(context, origin, "uk");
      await expect((await page.goto("/garden"))?.status()).toBe(200);
      const first = composer(page, "first_entry");
      await waitUntilEditable(first);
      const browserStateBefore = await readBrowserDurability(page);

      await first.locator('input[name="plantName"]').fill("OVE-325 рослина");
      await first.locator('input[name="spaceName"]').fill("OVE-325 простір");
      await fillComposerStory(first, "Перший безпечний запис OVE-325");
      await addInlineImages(first, 10);
      await expectSavedWithServerTimestamp(first);
      await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([
        "first-entry",
      ]);

      await first.locator('[data-auth-intent-control="save"]').click();
      await page.waitForURL(/\/garden\/objects\/[0-9a-f-]+/iu);
      const firstReadback = await readOwnerJournalState(pool, owner.userId);
      expect(firstReadback.entryIds).toHaveLength(1);
      expect(firstReadback.objectId).toMatch(UUID_PATTERN);
      expect(firstReadback.spaceId).toMatch(UUID_PATTERN);
      await expect(
        readProcessedMediaState(pool, owner.userId),
      ).resolves.toEqual({
        count: 10,
        webpCount: 10,
        originalDeletedCount: 10,
      });
      await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([]);

      const followUp = composer(page, "follow_up");
      await waitUntilEditable(followUp);
      await fillComposerStory(followUp, "Наступний запис OVE-325");
      await expectSavedWithServerTimestamp(followUp);
      await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([
        `follow-up-entry:${firstReadback.objectId}`,
      ]);
      await followUp.locator('[data-auth-intent-control="save"]').click();
      await page.waitForURL((url) => {
        return (
          url.pathname === `/garden/objects/${firstReadback.objectId}` &&
          url.searchParams.get("saveProgress") === "follow-up"
        );
      });
      await expect
        .poll(
          async () =>
            (await readOwnerJournalState(pool, owner.userId)).entryIds.length,
        )
        .toBe(2);
      await expect.poll(() => readDraftKeys(pool, owner.userId)).toEqual([]);

      await expect((await page.goto("/garden"))?.status()).toBe(200);
      const space = composer(page, "space_entry");
      await waitUntilEditable(space);
      await space.locator('input[name="title"]').fill("Запис простору OVE-325");
      await fillComposerStory(space, "Стан усього простору OVE-325");
      await space.locator('input[type="checkbox"]').first().check();
      await expectSavedWithServerTimestamp(space);
      await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([
        `space-entry:${firstReadback.spaceId}`,
      ]);
      await space.locator('button[type="submit"]').click();
      await page.waitForURL((url) => {
        return (
          url.pathname === "/garden" &&
          url.searchParams.get("saveProgress") === "space-entry"
        );
      });
      await expect
        .poll(
          async () =>
            (await readOwnerJournalState(pool, owner.userId)).entryIds.length,
        )
        .toBe(3);
      await expect.poll(() => readDraftKeys(pool, owner.userId)).toEqual([]);

      const editEntryId = (await readOwnerJournalState(pool, owner.userId))
        .entryIds[0];
      if (!editEntryId) throw new Error("Synthetic edit target is absent.");
      await expect(
        (await page.goto(`/garden/entries/${editEntryId}/edit`))?.status(),
      ).toBe(200);
      const edit = composer(page, "edit_entry");
      await waitUntilEditable(edit);
      await edit.locator("input").first().fill("Редагування OVE-325");
      await fillComposerStory(edit, "Відредагований запис OVE-325");
      await expectSavedWithServerTimestamp(edit);
      await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([
        `edit-entry:${editEntryId}`,
      ]);
      await edit.locator("button").last().click();
      await expect(
        edit.locator('[data-online-composer-state="consumed"]'),
      ).toBeVisible();
      await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([]);
      await expect(
        readJournalRevision(pool, owner.userId, editEntryId),
      ).resolves.toBe(2);

      const browserStateAfter = await readBrowserDurability(page);
      expect(browserStateAfter).toEqual(browserStateBefore);
      expect(await page.locator("body").innerText()).not.toMatch(
        FORBIDDEN_ACTIVE_COPY.uk,
      );
    } finally {
      await cleanupSyntheticOwner(pool, owner).catch(() => undefined);
      await pool.end();
    }
  });

  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`${locale} request failure is finite, read-only, explicitly retryable, and never auto-replayed`, async ({
      baseURL,
      context,
      page,
    }) => {
      test.setTimeout(90_000);
      const origin = requiredLoopbackOrigin(baseURL);
      const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
      const owner = await createVerifiedCredentialSession({
        origin,
        context,
        pool,
      });
      let saveRequests = 0;
      let countDraftWrites = false;

      try {
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (
            countDraftWrites &&
            request.method() === "PUT" &&
            url.pathname === "/api/garden/drafts/first-entry"
          ) {
            saveRequests += 1;
          }
        });
        await selectLocale(context, origin, locale);
        await expect((await page.goto("/garden"))?.status()).toBe(200);
        const first = composer(page, "first_entry");
        await waitUntilEditable(first);
        await first
          .locator('input[name="plantName"]')
          .fill(`OVE-325 ${locale}`);
        await first
          .locator('input[name="spaceName"]')
          .fill(`OVE-325 ${locale}`);
        if (locale === "uk") {
          await fillComposerBlocks(first, 89);
          await addInlineImages(first, 10);
          await expect(
            first.locator("[data-lexical-reorder-block]"),
          ).toHaveCount(100);
          await expect
            .poll(async () => {
              const state = await readDraftState(
                pool,
                owner.userId,
                "first-entry",
              );
              if (!state) return false;
              const payload = JSON.parse(state.payloadText) as {
                request?: {
                  body?: string;
                  contentDocument?: { blocks?: Array<{ type?: string }> };
                };
              };
              return (
                payload.request?.body?.includes("Load block 89") === true &&
                payload.request.contentDocument?.blocks?.filter(
                  (block) => block.type === "image",
                ).length === 10
              );
            })
            .toBe(true);
          await waitForDraftQuiescence(pool, owner.userId, "first-entry");
        } else {
          await fillComposerStory(first, `Baseline server text ${locale}`);
        }
        await expectSavedWithServerTimestamp(first);
        // A successful server receipt can be followed by one already-scheduled
        // media-normalization save. Let that bounded flight settle before the
        // request-failure clock starts.
        await page.waitForTimeout(1_500);
        await expectSavedWithServerTimestamp(first);
        await waitForDraftQuiescence(pool, owner.userId, "first-entry");
        const serverStateBeforeFailure = await readDraftState(
          pool,
          owner.userId,
          "first-entry",
        );
        expect(serverStateBeforeFailure).not.toBeNull();

        countDraftWrites = true;
        await context.setOffline(true);
        const startedAt = Date.now();
        await appendComposerStory(first, `Current-tab text ${locale}`);
        await expect.poll(() => saveRequests, { timeout: 1_000 }).toBe(1);
        await expect(
          first.locator('[data-online-composer-state="connection_required"]'),
        ).toBeVisible({ timeout: 2_000 });
        expect(Date.now() - startedAt).toBeLessThanOrEqual(2_000);
        expect(saveRequests).toBe(1);
        await expect(first.locator('input[name="plantName"]')).toBeDisabled();
        await expect(
          first.locator('[data-auth-intent-control="save"]'),
        ).toBeDisabled();
        await expect(
          first.locator('[data-online-composer-action="retry"]'),
        ).toBeEnabled();
        const copyAction = first.locator(
          '[data-online-composer-action="copy"]',
        );
        await expect(copyAction).toBeEnabled();
        await expect(
          first.locator('[data-online-composer-action="cancel"]'),
        ).toBeEnabled();
        await expect(
          first.locator('[data-online-composer-action="navigate"]'),
        ).toBeVisible();
        await expect(page).toHaveTitle(/^●\s/u);
        expect(await page.locator("body").innerText()).not.toMatch(
          FORBIDDEN_ACTIVE_COPY[locale],
        );
        await page.evaluate(() => {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (value: string) => {
                (
                  window as typeof window & {
                    __ove325CopiedText?: string;
                  }
                ).__ove325CopiedText = value;
              },
            },
          });
        });
        await copyAction.click();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (
                  window as typeof window & {
                    __ove325CopiedText?: string;
                  }
                ).__ove325CopiedText ?? "",
            ),
          )
          .toContain(`Current-tab text ${locale}`);

        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await expect.poll(() => saveRequests).toBe(2);
        await expect(
          first.locator('[data-online-composer-state="connection_required"]'),
        ).toBeVisible();
        await page.waitForTimeout(50);
        await page.evaluate(() =>
          window.dispatchEvent(new Event("beforeunload")),
        );
        await expect.poll(() => saveRequests).toBe(3);
        await expect(
          first.locator('[data-online-composer-state="connection_required"]'),
        ).toBeVisible();

        await context.setOffline(false);
        await page.waitForTimeout(400);
        expect(saveRequests).toBe(3);
        await expect(
          readDraftState(pool, owner.userId, "first-entry"),
        ).resolves.toEqual(serverStateBeforeFailure);

        const retry = first.locator('[data-online-composer-action="retry"]');
        await context.setOffline(true);
        await retry.click();
        await expect.poll(() => saveRequests).toBe(4);
        await expect(retry).toBeFocused();
        await context.setOffline(false);
        await page.waitForTimeout(400);
        expect(saveRequests).toBe(4);
        await retry.click();
        await expectSavedWithServerTimestamp(first);
        expect(saveRequests).toBe(5);
        await expect(readDraftKeys(pool, owner.userId)).resolves.toEqual([
          "first-entry",
        ]);
        const recovered = await readDraftState(
          pool,
          owner.userId,
          "first-entry",
        );
        expect(recovered?.serverRevision).toBe(
          (serverStateBeforeFailure?.serverRevision ?? 0) + 1,
        );
        expect(recovered?.payloadText).toContain(`Current-tab text ${locale}`);
      } finally {
        await context.setOffline(false).catch(() => undefined);
        await cleanupSyntheticOwner(pool, owner).catch(() => undefined);
        await pool.end();
      }
    });
  }
});

function composer(
  page: Page,
  kind: "first_entry" | "follow_up" | "space_entry" | "edit_entry",
) {
  return page.locator(`[data-online-composer-kind="${kind}"]`);
}

async function waitUntilEditable(root: ReturnType<typeof composer>) {
  await expect(root).toBeVisible();
  await expect(root.locator('[data-online-composer-state="idle"]')).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await expect(root.locator('[contenteditable="true"]')).toBeEditable();
}

async function fillComposerStory(
  root: ReturnType<typeof composer>,
  text: string,
) {
  const editor = root.locator('[contenteditable="true"]').first();
  await editor.fill(text);
  await expect(editor).toContainText(text);
}

async function fillComposerBlocks(
  root: ReturnType<typeof composer>,
  blockCount: number,
) {
  const editor = root.locator('[contenteditable="true"]').first();
  await editor.fill("Load block 1");
  for (let index = 2; index <= blockCount; index += 1) {
    await editor.press("Enter");
    await editor.pressSequentially(`Load block ${index}`);
  }
  await expect(root.locator("[data-lexical-reorder-block]")).toHaveCount(
    blockCount,
  );
}

async function appendComposerStory(
  root: ReturnType<typeof composer>,
  text: string,
) {
  const editor = root.locator('[contenteditable="true"]').first();
  await editor.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await editor.pressSequentially(text);
  await expect(editor).toContainText(text);
}

async function addInlineImages(
  root: ReturnType<typeof composer>,
  count: number,
) {
  const input = root
    .locator('[data-structured-journal-composer="true"] input[type="file"]')
    .first();
  for (let index = 1; index <= count; index += 1) {
    await expect(input).toBeEnabled();
    await input.setInputFiles(INLINE_MEDIA_FIXTURE);
    await expect(
      root.locator('[data-lexical-journal-image-content="true"]'),
    ).toHaveCount(index, { timeout: 30_000 });
  }
}

async function expectSavedWithServerTimestamp(
  root: ReturnType<typeof composer>,
) {
  const status = root.locator('[data-online-composer-state="saved"]');
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(status).toContainText(/\d{1,2}:\d{2}:\d{2}/u);
}

async function createVerifiedCredentialSession(input: {
  origin: string;
  context: BrowserContext;
  pool: Pool;
}) {
  const email = `ove325-browser-${randomUUID()}@example.test`;
  const signUp = await input.context.request.post(
    `${input.origin}/api/auth/sign-up/email`,
    {
      headers: { origin: input.origin },
      data: {
        email,
        password: TEST_PASSWORD,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    },
  );
  expect(signUp.ok()).toBe(true);
  const user = await input.pool.query<{ id: string }>(
    'select id::text as id from public."user" where email = $1::text',
    [email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Synthetic auth user was not persisted.");
  await input.pool.query(
    'update public."user" set "emailVerified" = true where id = $1::uuid',
    [userId],
  );
  const signIn = await input.context.request.post(
    `${input.origin}/api/auth/sign-in/email`,
    {
      headers: { origin: input.origin },
      data: { email, password: TEST_PASSWORD },
    },
  );
  expect(signIn.ok()).toBe(true);
  return { email, userId };
}

async function selectLocale(
  context: BrowserContext,
  origin: string,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    {
      name: MARKET_COOKIE,
      value: locale === "uk" ? "ukraine" : "bulgaria",
      url: origin,
    },
  ]);
}

async function readDraftKeys(pool: Pool, userId: string) {
  const result = await pool.query<{ draft_key: string }>(
    `
      select draft_key
      from public.journal_entry_drafts
      where owner_user_id = $1::uuid
      order by draft_key
    `,
    [userId],
  );
  return result.rows.map((row) => row.draft_key);
}

async function readOwnerJournalState(pool: Pool, userId: string) {
  const [entries, object, space] = await Promise.all([
    pool.query<{ id: string }>(
      `
        select id::text as id
        from public.journal_entries
        where owner_user_id = $1::uuid
        order by created_at, id
      `,
      [userId],
    ),
    pool.query<{ id: string }>(
      `
        select id::text as id
        from public.plant_objects
        where owner_user_id = $1::uuid
        order by created_at, id
        limit 1
      `,
      [userId],
    ),
    pool.query<{ id: string }>(
      `
        select id::text as id
        from public.spaces
        where owner_user_id = $1::uuid
        order by created_at, id
        limit 1
      `,
      [userId],
    ),
  ]);
  return {
    entryIds: entries.rows.map((row) => row.id),
    objectId: object.rows[0]?.id ?? "",
    spaceId: space.rows[0]?.id ?? "",
  };
}

async function readJournalRevision(
  pool: Pool,
  userId: string,
  entryId: string,
) {
  const result = await pool.query<{ revision: number }>(
    `
      select journal_revision::int as revision
      from public.journal_entries
      where owner_user_id = $1::uuid and id = $2::uuid
    `,
    [userId, entryId],
  );
  return result.rows[0]?.revision ?? -1;
}

async function readProcessedMediaState(pool: Pool, userId: string) {
  const result = await pool.query<{
    count: number;
    webp_count: number;
    original_deleted_count: number;
  }>(
    `
      select
        count(*)::int as count,
        count(*) filter (where derivative_key like '%.webp')::int as webp_count,
        count(*) filter (where original_deleted_at is not null)::int as original_deleted_count
      from public.media_assets
      where owner_user_id = $1::uuid and status = 'processed'
    `,
    [userId],
  );
  return {
    count: result.rows[0]?.count ?? 0,
    webpCount: result.rows[0]?.webp_count ?? 0,
    originalDeletedCount: result.rows[0]?.original_deleted_count ?? 0,
  };
}

async function readDraftState(pool: Pool, userId: string, draftKey: string) {
  const result = await pool.query<{
    generation: number;
    server_revision: number;
    payload_sha256: string;
    payload_text: string;
  }>(
    `
      select
        draft_generation::int as generation,
        server_revision::int as server_revision,
        payload_sha256,
        payload::text as payload_text
      from public.journal_entry_drafts
      where owner_user_id = $1::uuid and draft_key = $2::text
    `,
    [userId, draftKey],
  );
  const row = result.rows[0];
  return row
    ? {
        generation: row.generation,
        serverRevision: row.server_revision,
        payloadSha256: row.payload_sha256,
        payloadText: row.payload_text,
      }
    : null;
}

async function waitForDraftQuiescence(
  pool: Pool,
  userId: string,
  draftKey: string,
) {
  await expect
    .poll(
      async () => {
        const before = await readDraftState(pool, userId, draftKey);
        if (!before) return false;
        await new Promise((resolve) => setTimeout(resolve, 750));
        const after = await readDraftState(pool, userId, draftKey);
        return (
          after?.serverRevision === before.serverRevision &&
          after?.payloadSha256 === before.payloadSha256
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function readBrowserDurability(page: Page) {
  return page.evaluate(async () => {
    const databaseNames =
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases())
            .map((database) => database.name ?? "")
            .filter((name) => name.startsWith("overgarden-offline"))
            .sort()
        : [];
    const databases = await Promise.all(
      databaseNames.map(
        (databaseName) =>
          new Promise<{
            name: string;
            stores: Array<{ name: string; count: number }>;
          }>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const storeNames = Array.from(database.objectStoreNames).sort();
              if (storeNames.length === 0) {
                database.close();
                resolve({ name: databaseName, stores: [] });
                return;
              }
              const transaction = database.transaction(storeNames, "readonly");
              const stores = storeNames.map((storeName) => ({
                name: storeName,
                count: -1,
              }));
              for (const store of stores) {
                const countRequest = transaction
                  .objectStore(store.name)
                  .count();
                countRequest.onsuccess = () => {
                  store.count = countRequest.result;
                };
              }
              transaction.onerror = () => reject(transaction.error);
              transaction.oncomplete = () => {
                database.close();
                resolve({ name: databaseName, stores });
              };
            };
          }),
      ),
    );
    const localStorageEntries = Object.keys(localStorage)
      .filter((key) => /(?:offline|draft|journal|composer|queue)/iu.test(key))
      .sort()
      .map((key) => [key, localStorage.getItem(key)] as const);
    const cacheKeys =
      "caches" in window ? (await caches.keys()).sort() : ([] as string[]);
    const serviceWorkers =
      "serviceWorker" in navigator
        ? (await navigator.serviceWorker.getRegistrations())
            .map((registration) => registration.active?.scriptURL ?? "")
            .sort()
        : [];
    return { databases, localStorageEntries, cacheKeys, serviceWorkers };
  });
}

async function cleanupSyntheticOwner(
  pool: Pool,
  owner: { email: string; userId: string },
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from public.verification where identifier = $1::text",
      [owner.email],
    );
    await client.query(
      "delete from public.analytics_events where owner_user_id = $1::uuid",
      [owner.userId],
    );
    await client.query(
      "delete from public.journal_entries where owner_user_id = $1::uuid",
      [owner.userId],
    );
    await client.query(
      "delete from public.plant_objects where owner_user_id = $1::uuid",
      [owner.userId],
    );
    await client.query(
      "delete from public.spaces where owner_user_id = $1::uuid",
      [owner.userId],
    );
    await client.query('delete from public.session where "userId" = $1::uuid', [
      owner.userId,
    ]);
    await client.query('delete from public.account where "userId" = $1::uuid', [
      owner.userId,
    ]);
    await client.query(
      'delete from public."user" where id = $1::uuid and email = $2::text',
      [owner.userId, owner.email],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function requiredLoopbackOrigin(baseURL: string | undefined) {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const url = new URL(baseURL);
  if (!isLoopbackHost(url.hostname)) {
    throw new Error("OVE-325 browser proof refuses a non-loopback origin.");
  }
  return url.origin;
}

function requiredLocalDatabaseUrl() {
  const value =
    process.env.DATABASE_URL?.trim() ||
    "postgresql://overgarden:overgarden@127.0.0.1:5432/overgarden";
  const url = new URL(value);
  if (!isLoopbackHost(url.hostname) || url.pathname !== "/overgarden") {
    throw new Error("OVE-325 browser proof requires the local OverGarden DB.");
  }
  return value;
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
    hostname.toLowerCase(),
  );
}
