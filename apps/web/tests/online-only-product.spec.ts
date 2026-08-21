import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request as PlaywrightRequest,
} from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import {
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";

const TEST_PASSWORD = "OVE326-local-password-1!";
const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const SHARED_DATABASE = "overgarden-offline";
const CONTROL_DATABASE = "overgarden-control-v1";
const OWNER_PREFIX = "overgarden-offline-owner-v1-";
const TERMINAL_BINDING = "T".repeat(43);
const UNRELATED_DATABASE = "unrelated-ove326-state";
const UNRELATED_CACHE = "unrelated-ove326-cache";
const DELETE_SEAM_KEY = "__ove326DeleteSeam";

test.describe.configure({ mode: "serial" });

test.describe("OVE-326 online-only product", () => {
  test("keeps all locales free of a cached shell and rejects a network-down mutation", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(120_000);
    const origin = requiredLoopbackOrigin(baseURL);
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const owner = await createVerifiedCredentialSession({
      origin,
      context,
      pool,
    });

    try {
      for (const locale of ["uk", "bg", "ru"] as const) {
        await selectLocale(context, origin, locale);
        const response = await page.goto("/garden");
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await assertRetiredBrowserSurfaceAbsentTwice(page);
        await assertRetiredAssetsAbsent(page);

        const countBefore = await ownerJournalCount(pool, owner.userId);
        let mutationRequestFailed = 0;
        let navigationRequestFailed = 0;
        const onRequestFailed = (request: PlaywrightRequest) => {
          const url = new URL(request.url());
          if (
            request.method() === "POST" &&
            url.pathname === "/api/garden/entries"
          ) {
            mutationRequestFailed += 1;
          }
          if (request.isNavigationRequest() && url.pathname === "/garden") {
            navigationRequestFailed += 1;
          }
        };
        page.on("requestfailed", onRequestFailed);
        await context.setOffline(true);
        const mutationResult = await page.evaluate(
          async ({ header, protocol, mutationId }) => {
            try {
              await fetch("/api/garden/entries", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  [header]: protocol,
                },
                body: JSON.stringify({
                  target: "first_plant_entry",
                  title: "Synthetic network-down probe",
                  clientMutationId: mutationId,
                }),
              });
              return "unexpected_response";
            } catch {
              return "network_rejected";
            }
          },
          {
            header: ONLINE_JOURNAL_PROTOCOL_HEADER,
            protocol: ONLINE_JOURNAL_PROTOCOL,
            mutationId: `ove326-${locale}-${randomUUID()}`,
          },
        );
        expect(mutationResult).toBe("network_rejected");
        await expect.poll(() => mutationRequestFailed).toBe(1);

        const reloadOutcome = await page
          .reload({ waitUntil: "domcontentloaded", timeout: 5_000 })
          .then(
            () => "fail_closed_document" as const,
            () => "network_rejected" as const,
          );
        if (reloadOutcome === "network_rejected") {
          expect(navigationRequestFailed).toBeGreaterThanOrEqual(1);
        } else {
          await expect(
            page.locator('[data-session-convergence-gate="blocked"]'),
          ).toBeVisible();
          await expect(
            page.locator('[data-garden-workspace="operational-home"]'),
          ).toHaveCount(0);
        }
        await context.setOffline(false);
        page.off("requestfailed", onRequestFailed);
        await expect((await page.goto("/garden"))?.status()).toBe(200);
        await expect(ownerJournalCount(pool, owner.userId)).resolves.toBe(
          countBefore,
        );
        await assertRetiredBrowserSurfaceAbsentTwice(page);
      }
    } finally {
      await context.setOffline(false).catch(() => undefined);
      await cleanupSyntheticOwner(pool, owner).catch(() => undefined);
      await pool.end();
    }
  });

  test("keeps localized retry and sign-out usable after bounded deletion timeout", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(120_000);
    const origin = requiredLoopbackOrigin(baseURL);
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const owner = await createVerifiedCredentialSession({
      origin,
      context,
      pool,
    });

    try {
      await seedSharedLegacyDatabase(page);
      await expect
        .poll(() => readBrowserState(page))
        .toMatchObject({ overGardenDatabaseNames: [SHARED_DATABASE] });
      await context.addInitScript(
        ({ databaseName, seamKey }) => {
          const factory = indexedDB as IDBFactory & {
            deleteDatabase(name: string): IDBOpenDBRequest;
          };
          const prototype = Object.getPrototypeOf(factory) as IDBFactory;
          const nativeDelete = prototype.deleteDatabase;
          const seam = { installed: true, calls: [] as string[] };
          Reflect.set(globalThis, seamKey, seam);
          Object.defineProperty(prototype, "deleteDatabase", {
            configurable: true,
            value(name: string) {
              seam.calls.push(name);
              if (name !== databaseName) return nativeDelete.call(this, name);
              return {
                error: null,
                onblocked: null,
                onerror: null,
                onsuccess: null,
                readyState: "pending",
                result: undefined,
                source: null,
                transaction: null,
                addEventListener() {},
                dispatchEvent() {
                  return true;
                },
                removeEventListener() {},
              } as unknown as IDBOpenDBRequest;
            },
          });
        },
        { databaseName: SHARED_DATABASE, seamKey: DELETE_SEAM_KEY },
      );

      for (const locale of ["uk", "bg", "ru"] as const) {
        await selectLocale(context, origin, locale);
        const startedAt = Date.now();
        await expect((await page.goto("/garden"))?.status()).toBe(200);
        await expect
          .poll(() => readDeleteSeamCalls(page), { timeout: 5_000 })
          .toContain(SHARED_DATABASE);
        const banner = page.locator("[data-legacy-device-retirement]");
        await expect(banner).toBeVisible({ timeout: 5_000 });
        await expect(banner).toHaveAttribute(
          "data-legacy-device-retirement",
          "deletion_blocked",
        );
        expect(Date.now() - startedAt).toBeLessThan(5_000);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(banner.getByRole("status")).not.toHaveText("");
        const retry = banner.locator("[data-retirement-retry=true]");
        const signOut = banner.locator("[data-retirement-sign-out=true]");
        await expect(retry).toBeEnabled();
        await expect(signOut).toBeEnabled();

        await retry.focus();
        await expect(retry).toBeFocused();
        await retry.press("Enter");
        await expect(
          banner.locator("[data-retirement-cancel=true]"),
        ).toBeEnabled();
        await expect(signOut).toBeEnabled();
        await expect(retry).toBeEnabled({ timeout: 5_000 });
        await expect(signOut).toBeEnabled();

        await signOut.click();
        await expect(
          page.locator('[data-sign-out-confirmation="true"]'),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
          page.locator('[data-sign-out-confirmation="true"]'),
        ).toHaveCount(0);
      }
    } finally {
      await cleanupSyntheticOwner(pool, owner).catch(() => undefined);
      await pool.end();
    }
  });

  test("converges two returning tabs on exact-name deletion and preserves unrelated storage", async ({
    context,
    page,
  }) => {
    test.setTimeout(60_000);
    await seedTerminalLegacyProfile(page);
    const peer = await context.newPage();

    try {
      await Promise.all([page.goto("/"), peer.goto("/")]);
      for (const candidate of [page, peer]) {
        await expect
          .poll(() => readBrowserState(candidate), { timeout: 8_000 })
          .toMatchObject({
            overGardenDatabaseNames: [],
            overGardenCacheNames: [],
            legacyWorkerCount: 0,
            unrelatedDatabasePresent: true,
            unrelatedCachePresent: true,
          });
        await assertRetiredBrowserSurfaceAbsentTwice(candidate);
      }
    } finally {
      await peer.close();
      await cleanupBrowserStorage(page).catch(() => undefined);
    }
  });
});

async function assertRetiredAssetsAbsent(page: Page) {
  for (const pathname of [
    "/manifest.webmanifest",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png",
  ]) {
    const response = await page.request.get(pathname, { maxRedirects: 0 });
    expect(response.status(), `${pathname} must remain absent`).toBe(404);
  }
}

async function assertRetiredBrowserSurfaceAbsentTwice(page: Page) {
  const first = await readBrowserState(page);
  await page.waitForTimeout(25);
  const second = await readBrowserState(page);
  for (const receipt of [first, second]) {
    expect(receipt).toMatchObject({
      overGardenDatabaseNames: [],
      overGardenCacheNames: [],
      legacyWorkerCount: 0,
      manifestLinkCount: 0,
      retiredIconLinkCount: 0,
    });
  }
}

async function readDeleteSeamCalls(page: Page) {
  return page.evaluate((seamKey) => {
    const value = Reflect.get(globalThis, seamKey) as
      | { installed?: unknown; calls?: unknown }
      | undefined;
    if (value?.installed !== true || !Array.isArray(value.calls)) return [];
    return value.calls.filter(
      (candidate): candidate is string => typeof candidate === "string",
    );
  }, DELETE_SEAM_KEY);
}

async function readBrowserState(page: Page) {
  return page.evaluate(
    async ({
      shared,
      control,
      ownerPrefix,
      unrelatedDatabase,
      unrelatedCache,
    }) => {
      const databaseNames =
        typeof indexedDB.databases === "function"
          ? (await indexedDB.databases())
              .map(({ name }) => name ?? "")
              .filter(Boolean)
              .sort()
          : [];
      const cacheNames = (await caches.keys()).sort();
      const registrations = await navigator.serviceWorker.getRegistrations();
      const workerUrls = registrations.flatMap((registration) =>
        [
          registration.active?.scriptURL,
          registration.installing?.scriptURL,
          registration.waiting?.scriptURL,
        ].filter((value): value is string => typeof value === "string"),
      );
      return {
        overGardenDatabaseNames: databaseNames.filter(
          (name) =>
            name === shared || name === control || name.startsWith(ownerPrefix),
        ),
        overGardenCacheNames: cacheNames.filter((name) =>
          /^overgarden(?:$|[-_.:])/iu.test(name),
        ),
        legacyWorkerCount: workerUrls.filter(
          (value) => new URL(value).pathname === "/sw.js",
        ).length,
        unrelatedDatabasePresent: databaseNames.includes(unrelatedDatabase),
        unrelatedCachePresent: cacheNames.includes(unrelatedCache),
        manifestLinkCount: document.querySelectorAll('link[rel="manifest"]')
          .length,
        retiredIconLinkCount: document.querySelectorAll(
          'link[href*="icon-192.png"], link[href*="icon-512.png"]',
        ).length,
      };
    },
    {
      shared: SHARED_DATABASE,
      control: CONTROL_DATABASE,
      ownerPrefix: OWNER_PREFIX,
      unrelatedDatabase: UNRELATED_DATABASE,
      unrelatedCache: UNRELATED_CACHE,
    },
  );
}

async function seedSharedLegacyDatabase(page: Page) {
  const context = page.context();
  await context.route("**/__ove326-seed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>OVE-326 browser seed</title>",
    });
  });
  await page.goto("/__ove326-seed");
  await page.evaluate(async (databaseName) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("rows", { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
  }, SHARED_DATABASE);
  await context.unroute("**/__ove326-seed");
}

async function seedTerminalLegacyProfile(page: Page) {
  const context = page.context();
  await context.route("**/__ove326-seed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>OVE-326 browser seed</title>",
    });
  });
  await page.goto("/__ove326-seed");
  await page.evaluate(
    async ({
      shared,
      control,
      ownerName,
      binding,
      unrelatedDatabase,
      unrelatedCache,
    }) => {
      const openDatabase = (
        name: string,
        upgrade: (database: IDBDatabase) => void,
      ) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => upgrade(request.result);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
        });
      await openDatabase(shared, (database) => {
        database.createObjectStore("rows", { keyPath: "id" });
      });
      await openDatabase(ownerName, (database) => {
        database.createObjectStore("rows", { keyPath: "id" });
      });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(control, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("vaults", { keyPath: "binding" });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("vaults", "readwrite");
          transaction.objectStore("vaults").put({
            binding,
            state: "retirement_resolved",
          });
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      });
      await openDatabase(unrelatedDatabase, (database) => {
        database.createObjectStore("rows", { keyPath: "id" });
      });
      const cache = await caches.open(unrelatedCache);
      await cache.put("/unrelated-ove326", new Response("ok"));
    },
    {
      shared: SHARED_DATABASE,
      control: CONTROL_DATABASE,
      ownerName: `${OWNER_PREFIX}${TERMINAL_BINDING}`,
      binding: TERMINAL_BINDING,
      unrelatedDatabase: UNRELATED_DATABASE,
      unrelatedCache: UNRELATED_CACHE,
    },
  );
  await context.unroute("**/__ove326-seed");
}

async function cleanupBrowserStorage(page: Page) {
  await page.evaluate(
    async ({
      shared,
      control,
      ownerPrefix,
      unrelatedDatabase,
      unrelatedCache,
    }) => {
      const names =
        typeof indexedDB.databases === "function"
          ? (await indexedDB.databases())
              .map(({ name }) => name ?? "")
              .filter(Boolean)
          : [];
      const deleteName = (name: string) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        });
      await Promise.all(
        names
          .filter(
            (name) =>
              name === shared ||
              name === control ||
              name.startsWith(ownerPrefix) ||
              name === unrelatedDatabase,
          )
          .map(deleteName),
      );
      await caches.delete(unrelatedCache);
    },
    {
      shared: SHARED_DATABASE,
      control: CONTROL_DATABASE,
      ownerPrefix: OWNER_PREFIX,
      unrelatedDatabase: UNRELATED_DATABASE,
      unrelatedCache: UNRELATED_CACHE,
    },
  );
}

async function createVerifiedCredentialSession(input: {
  origin: string;
  context: BrowserContext;
  pool: Pool;
}) {
  const email = `ove326-browser-${randomUUID()}@example.test`;
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

async function ownerJournalCount(pool: Pool, userId: string) {
  const result = await pool.query<{ count: number }>(
    "select count(*)::int as count from journal_entries where owner_user_id = $1::uuid",
    [userId],
  );
  return result.rows[0]?.count ?? 0;
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
    throw new Error("OVE-326 browser proof refuses a non-loopback origin.");
  }
  return url.origin;
}

function requiredLocalDatabaseUrl() {
  const value =
    process.env.DATABASE_URL?.trim() ||
    "postgresql://overgarden:overgarden@127.0.0.1:5432/overgarden";
  const url = new URL(value);
  if (!isLoopbackHost(url.hostname) || url.pathname !== "/overgarden") {
    throw new Error("OVE-326 browser proof requires the local OverGarden DB.");
  }
  return value;
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(
    hostname.toLowerCase(),
  );
}
