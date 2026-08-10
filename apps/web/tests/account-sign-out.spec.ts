import { expect, test, type Page } from "playwright/test";

const FIXTURE_PATH = "/__visual-fixtures/account-sign-out";
const MARKER_KEY = "overgarden:session-invalidation:v1";
const OWNER_BINDING = "X".repeat(43);
const OWNER_DATABASE = `overgarden-offline-owner-v1-${OWNER_BINDING}`;

test.describe("OVE-287 immediate retain-only sign-out", () => {
  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`keeps the ${locale} public exits responsive when durable marker storage and reconciliation fail`, async ({
      page,
    }) => {
      await denyOnlyLocalExitMarkerStorage(page);
      let reconciliationRequests = 0;
      await page.route("**/api/auth/local-exit-reconcile", async (route) => {
        reconciliationRequests += 1;
        await route.abort("failed");
      });
      await openFixture(page, locale);

      await confirmLocalExit(page);

      await expect(privateSurface(page)).toHaveCount(0);
      await expect(
        page.locator('[data-local-exit-public-safe="true"]'),
      ).toBeVisible();
      await expect(
        page.locator(
          '[data-local-exit-public-safe="true"] [role="status"], [data-local-exit-public-safe="true"] [role="alert"]',
        ),
      ).toHaveCount(0);
      expect(
        await page.locator('[data-local-exit-public-safe="true"] a').count(),
      ).toBeGreaterThanOrEqual(2);
      const receipt = await browserReceipt(page);
      expect(receipt.removalDurationMs).toBeLessThanOrEqual(100);
      expect(receipt.activeVaultAtRemoval).toBe(false);
      await expect.poll(() => reconciliationRequests).toBe(1);
      await page.waitForTimeout(250);
      expect(reconciliationRequests).toBe(1);
      expect(page.url()).toContain(FIXTURE_PATH);
    });
  }

  test("retains the owner row, seals the active handle, and emits one reconciliation request", async ({
    page,
  }) => {
    let reconciliationRequests = 0;
    await page.route("**/api/auth/local-exit-reconcile", async (route) => {
      reconciliationRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      await route.fulfill({ status: 204 });
    });
    await openFixture(page, "bg");
    expect(await countRetainedDrafts(page)).toBe(1);

    await confirmLocalExit(page);
    await page.waitForURL(/\/bg$/u);

    const receipt = await browserReceipt(page);
    expect(receipt.removalDurationMs).toBeLessThanOrEqual(100);
    expect(receipt.activeVaultAtRemoval).toBe(false);
    expect(await countRetainedDrafts(page)).toBe(1);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY),
    ).toBeNull();
    expect(reconciliationRequests).toBe(1);
  });

  test("bootstraps public-only once per document, performs no retry, and stays closed after a cross-origin return", async ({
    page,
  }) => {
    await seedLocalExitMarker(page, "A");
    let reconciliationRequests = 0;
    await page.route("**/api/auth/local-exit-reconcile", async (route) => {
      reconciliationRequests += 1;
      await route.abort("failed");
    });

    await page.goto(fixtureUrl("uk"));
    await expect(
      page.locator('[data-local-exit-public-safe="true"]'),
    ).toBeVisible();
    await expect(privateSurface(page)).toHaveCount(0);
    await expect.poll(() => reconciliationRequests).toBe(1);
    await page.waitForTimeout(500);
    expect(reconciliationRequests).toBe(1);

    await page.goto("data:text/html,<title>outside-origin</title>");
    await page.goto(fixtureUrl("uk"));
    await expect(
      page.locator('[data-local-exit-public-safe="true"]'),
    ).toBeVisible();
    await expect(privateSurface(page)).toHaveCount(0);
    await expect.poll(() => reconciliationRequests).toBe(2);
  });

  test("lets generation B win over the delayed generation-A response", async ({
    page,
  }) => {
    await seedLocalExitMarker(page, "A");
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/auth/local-exit-reconcile", async (route) => {
      await responseGate;
      await route.fulfill({ status: 204 });
    });
    await page.goto(fixtureUrl("ru"));
    await expect(
      page.locator('[data-local-exit-public-safe="true"]'),
    ).toBeVisible();

    await page.evaluate(() =>
      window.__ove287AccountSignOutFixture!.replaceLocalExitGeneration(),
    );
    const generationB = await page.evaluate(
      (key) => localStorage.getItem(key),
      MARKER_KEY,
    );
    expect(generationB).toMatch(
      /^\{"v":2,"k":"local_exit","g":"[A-Za-z0-9_-]{22}"\}$/u,
    );
    releaseResponse();
    await page.waitForURL(/\/ru$/u);

    expect(
      await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY),
    ).toBe(generationB);
  });

  test("clears a lost-response marker only after serialized authoritative establishment", async ({
    page,
  }) => {
    await seedLocalExitMarker(page, "A");
    await page.route("**/api/auth/local-exit-reconcile", (route) =>
      route.abort("failed"),
    );
    await page.goto(fixtureUrl("bg"));
    await expect(
      page.locator('[data-local-exit-public-safe="true"]'),
    ).toBeVisible();

    await page.evaluate(() =>
      window.__ove287AccountSignOutFixture!.establishAuthoritativeSession(),
    );
    await page.reload();
    await page.waitForFunction(() =>
      Boolean(window.__ove287AccountSignOutFixture),
    );
    await expect(privateSurface(page)).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY),
    ).toBeNull();
  });

  test("removes a peer tab and a BFCache-restored document without reopening private UI", async ({
    context,
    page,
  }) => {
    await context.route("**/api/auth/local-exit-reconcile", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 204 });
    });
    const peer = await context.newPage();
    await Promise.all([openFixture(page, "uk"), openFixture(peer, "uk")]);
    await peer.evaluate(() =>
      window.__ove287AccountSignOutFixture!.armRemovalMeasurement(),
    );

    await confirmLocalExit(page);
    await Promise.all([page.waitForURL(/\/$/u), peer.waitForURL(/\/$/u)]);
    expect((await browserReceipt(page)).removalDurationMs).toBeLessThanOrEqual(
      100,
    );
    expect((await browserReceipt(peer)).removalDurationMs).toBeGreaterThan(0);

    await openFixture(page, "uk");
    await page.evaluate(() =>
      window.__ove287AccountSignOutFixture!.simulateLocalExitBfCacheRestore(),
    );
    await page.waitForURL(/\/$/u);
    await expect(privateSurface(page)).toHaveCount(0);
    await peer.close();
  });
});

function fixtureUrl(locale: "uk" | "bg" | "ru") {
  return `${FIXTURE_PATH}?visualAccountSignOut=true&locale=${locale}`;
}

async function openFixture(page: Page, locale: "uk" | "bg" | "ru") {
  const response = await page.goto(fixtureUrl(locale));
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() =>
    Boolean(window.__ove287AccountSignOutFixture),
  );
  await expect(
    page.locator('[data-account-sign-out-fixture-ready="true"]'),
  ).toBeVisible();
}

async function confirmLocalExit(page: Page) {
  await page.locator('[data-sign-out-control="profile"]').click();
  await page.locator('[data-sign-out-confirm-action="true"]').click();
}

function privateSurface(page: Page) {
  return page.locator('[data-account-sign-out-private="true"]');
}

async function browserReceipt(page: Page) {
  return page.evaluate(() => ({
    activeVaultAtRemoval:
      sessionStorage.getItem("overgarden:fixture:ove287:active-at-removal") ===
      "true",
    removalDurationMs: Number(
      sessionStorage.getItem("overgarden:fixture:ove287:removal-duration"),
    ),
  }));
}

async function countRetainedDrafts(page: Page) {
  return page.evaluate(async (databaseName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = database
          .transaction("drafts", "readonly")
          .objectStore("drafts")
          .count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, OWNER_DATABASE);
}

async function seedLocalExitMarker(page: Page, character: string) {
  await page.addInitScript(
    ([key, value, seededKey]) => {
      if (sessionStorage.getItem(seededKey) === "true") return;
      localStorage.setItem(key, value);
      sessionStorage.setItem(seededKey, "true");
    },
    [
      MARKER_KEY,
      `{"v":2,"k":"local_exit","g":"${character.repeat(22)}"}`,
      `overgarden:fixture:ove287:seeded:${character}`,
    ] as const,
  );
}

async function denyOnlyLocalExitMarkerStorage(page: Page) {
  await page.addInitScript((markerKey) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    const denyMarker = (storage: Storage, key: string) => {
      if (storage === localStorage && key === markerKey) {
        throw new DOMException("Synthetic marker storage denial");
      }
    };
    Storage.prototype.getItem = function (key) {
      denyMarker(this, key);
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      denyMarker(this, key);
      return setItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      denyMarker(this, key);
      return removeItem.call(this, key);
    };
  }, MARKER_KEY);
}
