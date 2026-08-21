import { expect, test, type Page } from "playwright/test";

const SHARED_DATABASE = "overgarden-offline";
const CONTROL_DATABASE = "overgarden-control-v1";
const OWNER_PREFIX = "overgarden-offline-owner-v1-";
const TERMINAL_BINDING = "A".repeat(43);
const UNRESOLVED_BINDING = "B".repeat(43);
const UNRELATED_DATABASE = "unrelated-product-state";
const UNRELATED_CACHE = "unrelated-product-cache-v1";

test.describe("OVE-323 offline runtime absence", () => {
  test("keeps a fresh browser profile free of the retired PWA surface", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect
      .poll(() => readBrowserState(page))
      .toMatchObject({
        overGardenDatabaseNames: [],
        overGardenCacheNames: [],
        legacyWorkerCount: 0,
        manifestLinkCount: 0,
        retiredIconLinkCount: 0,
      });
    await expect(page.locator("[data-legacy-device-retirement]")).toHaveCount(
      0,
    );

    for (const path of [
      "/manifest.webmanifest",
      "/sw.js",
      "/icon-192.png",
      "/icon-512.png",
    ]) {
      const retiredAsset = await page.request.get(path, { maxRedirects: 0 });
      expect(retiredAsset.status(), `${path} must not be served`).toBe(404);
    }
  });

  test("deletes only exact terminal legacy names and preserves unrelated storage", async ({
    page,
    browserName,
  }) => {
    await seedLegacyProfile(page, {
      binding: TERMINAL_BINDING,
      state: "retirement_resolved",
      // Playwright Firefox cannot install a ServiceWorker whose script request
      // is fulfilled by request routing. Chromium and WebKit exercise the real
      // unregister path; Firefox still exercises the exact IndexedDB contract.
      includeWorker: browserName !== "firefox",
    });

    await page.goto("/");
    await expect
      .poll(() => readBrowserState(page), { timeout: 5_000 })
      .toMatchObject({
        overGardenDatabaseNames: [],
        overGardenCacheNames: [],
        legacyWorkerCount: 0,
        unrelatedDatabasePresent: true,
        unrelatedCachePresent: true,
      });
    await expect(page.locator("[data-legacy-device-retirement]")).toHaveCount(
      0,
    );

    await cleanupSyntheticProfile(page);
  });

  test("retains an unresolved owner binding and leaves the page usable", async ({
    page,
    browserName,
  }) => {
    await seedLegacyProfile(page, {
      binding: UNRESOLVED_BINDING,
      state: "active",
      includeWorker: browserName !== "firefox",
    });

    const startedAt = Date.now();
    await page.goto("/");
    const banner = page.locator(
      '[data-legacy-device-retirement="deletion_blocked"]',
    );
    await expect(banner).toBeVisible({ timeout: 5_000 });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    await expect(banner.locator("[data-retirement-retry=true]")).toBeVisible();
    await expect(banner.getByRole("button")).toHaveCount(2);

    await expect
      .poll(() => readBrowserState(page))
      .toMatchObject({
        overGardenDatabaseNames: [
          CONTROL_DATABASE,
          `${OWNER_PREFIX}${UNRESOLVED_BINDING}`,
        ],
        legacyWorkerCount: 0,
        unrelatedDatabasePresent: true,
        unrelatedCachePresent: true,
      });

    await banner.locator("[data-retirement-retry=true]").click();
    await expect(banner).toBeVisible();
    await banner.getByRole("button").last().click();
    await expect(banner).toHaveCount(0);
    await expect((await page.goto("/garden"))?.status()).toBe(200);

    await cleanupSyntheticProfile(page);
  });
});

async function seedLegacyProfile(
  page: Page,
  input: {
    binding: string;
    state: "retirement_resolved" | "active";
    includeWorker: boolean;
  },
) {
  const context = page.context();
  await context.route("**/__ove323-seed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>OVE-323 browser seed</title>",
    });
  });
  // Service-worker script fetches originate outside the Page target, so the
  // browser-context route is required for a real pre-existing registration.
  await context.route("**/sw.js", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
      },
      body: [
        'self.addEventListener("install", (event) => {',
        "  event.waitUntil(self.skipWaiting());",
        "});",
        'self.addEventListener("activate", (event) => {',
        "  event.waitUntil(self.clients.claim());",
        "});",
      ].join("\n"),
    });
  });
  await page.goto("/__ove323-seed");
  await page.evaluate(
    async ({ binding, state, includeWorker, constants }) => {
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

      await openDatabase(constants.shared, (database) => {
        database.createObjectStore("rows", { keyPath: "id" });
      });
      await openDatabase(`${constants.ownerPrefix}${binding}`, (database) => {
        database.createObjectStore("rows", { keyPath: "id" });
      });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(constants.control, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("vaults", { keyPath: "binding" });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("vaults", "readwrite");
          transaction.objectStore("vaults").put({ binding, state });
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      });
      await openDatabase(constants.unrelatedDatabase, (database) => {
        database.createObjectStore("rows", { keyPath: "id" });
      });
      const unrelatedCache = await caches.open(constants.unrelatedCache);
      await unrelatedCache.put("/unrelated-receipt", new Response("ok"));
      if (includeWorker) {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
      }
    },
    {
      binding: input.binding,
      state: input.state,
      includeWorker: input.includeWorker,
      constants: {
        shared: SHARED_DATABASE,
        control: CONTROL_DATABASE,
        ownerPrefix: OWNER_PREFIX,
        unrelatedDatabase: UNRELATED_DATABASE,
        unrelatedCache: UNRELATED_CACHE,
      },
    },
  );
  await context.unroute("**/sw.js");
  await context.unroute("**/__ove323-seed");
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

async function cleanupSyntheticProfile(page: Page) {
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
              .filter(
                (name) =>
                  name === shared ||
                  name === control ||
                  name.startsWith(ownerPrefix) ||
                  name === unrelatedDatabase,
              )
          : [shared, control, unrelatedDatabase];
      await Promise.all(
        names.map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            }),
        ),
      );
      await caches.delete(unrelatedCache);
      await Promise.all(
        (await navigator.serviceWorker.getRegistrations()).map((registration) =>
          registration.unregister(),
        ),
      );
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
