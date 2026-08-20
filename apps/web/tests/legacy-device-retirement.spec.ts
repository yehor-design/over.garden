import { expect, test, type Page } from "playwright/test";

const FIXTURE_PATH = "/__visual-fixtures/legacy-device-retirement";
const OWNER_DATABASE = `overgarden-offline-owner-v1-${"B".repeat(43)}`;

test.describe("OVE-322 returning-device retirement", () => {
  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`keeps the ${locale} workspace nonblocking and exposes safe account exit`, async ({
      page,
    }) => {
      await openFixture(page, locale, "slow");
      await expect(retirement(page)).toBeVisible();
      await expect(page.locator("[data-retirement-window-copy]")).toContainText(
        "OVE-323 production",
      );

      await page.locator("[data-retirement-transfer]").click();
      await expect(page.locator("[data-retirement-cancel]")).toBeVisible();
      const interactionDuration = await page.evaluate(() => {
        const started = performance.now();
        const action = document.querySelector<HTMLButtonElement>(
          '[data-testid="retirement-independent-action"]',
        );
        action?.click();
        return performance.now() - started;
      });
      expect(interactionDuration).toBeLessThanOrEqual(100);
      await expect(page.getByTestId("retirement-independent-count")).toHaveText(
        "1",
      );

      await page.locator("[data-retirement-sign-out]").click();
      await expect(
        page.locator('[data-sign-out-confirmation="true"]'),
      ).toBeVisible();
      await page
        .locator('[data-sign-out-confirmation="true"]')
        .getByRole("button")
        .first()
        .click();
      await page.locator("[data-retirement-cancel]").click();
      await expect(retirement(page)).toHaveAttribute(
        "data-legacy-device-retirement",
        "offered",
      );
      const snapshot = await fixtureSnapshot(page);
      expect(snapshot.deleteSuccesses).toBe(0);
      expect(snapshot.lateDeletes).toBe(0);
    });
  }

  test("transfers, verifies, deletes exact known state, and proves two absence reads", async ({
    page,
  }) => {
    await openFixture(page, "uk", "happy");
    await page.locator("[data-retirement-transfer]").click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "completed",
    );

    const snapshot = await fixtureSnapshot(page);
    expect(snapshot).toMatchObject({
      absenceReads: 2,
      deleteAttempts: 1,
      deleteSuccesses: 1,
      lateDeletes: 0,
      sourcePresent: false,
      transferAttempts: 1,
    });
    const residue = await browserResidue(page);
    expect(residue.ownerDatabasePresent).toBe(false);
    expect(residue.unrelatedDatabasePresent).toBe(true);
    expect(residue.legacyWorkerPresent).toBe(false);
    expect(residue.unrelatedCachePresent).toBe(true);
    expect(residue.unrelatedLocalStorage).toBe("preserve");
    expect(residue.unrelatedCookie).toBe(true);
  });

  test("requires two keyboard-safe discard confirmations and preserves unrelated origin state", async ({
    page,
  }) => {
    await openFixture(page, "uk", "happy");
    await page.locator("[data-retirement-discard]").click();
    const dialog = page.locator("[data-retirement-discard-dialog]");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Не видаляти" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    expect((await fixtureSnapshot(page)).deleteAttempts).toBe(0);
    await expect(dialog).toContainText("ще раз");
    await page.getByRole("button", { name: "Видалити безповоротно" }).click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "completed",
    );
    const residue = await browserResidue(page);
    expect(residue.unrelatedDatabasePresent).toBe(true);
    expect(residue.unrelatedCachePresent).toBe(true);
    expect(residue.unrelatedLocalStorage).toBe("preserve");
    expect(residue.unrelatedCookie).toBe(true);
  });

  test("reports blocked deletion without success, then recovers after the exact handle closes", async ({
    page,
  }) => {
    await openFixture(page, "bg", "blocked");
    await page.locator("[data-retirement-transfer]").click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "deletion_blocked",
    );
    expect((await fixtureSnapshot(page)).deleteSuccesses).toBe(0);

    await page.evaluate(() =>
      window.__ove322LegacyRetirementFixture?.closeBlockedHandle(),
    );
    await page.locator("[data-retirement-retry]").click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "offered",
    );
    await page.locator("[data-retirement-transfer]").click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "completed",
    );
  });

  test("fails closed when database enumeration cannot prove absence", async ({
    page,
  }) => {
    await openFixture(page, "ru", "unavailable");
    await page.locator("[data-retirement-transfer]").click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "deletion_blocked",
    );
    await expect(retirement(page)).not.toHaveAttribute(
      "data-legacy-device-retirement",
      "completed",
    );
    expect((await fixtureSnapshot(page)).absenceReads).toBe(0);
  });

  test("redacts another-account content and performs no delete", async ({
    page,
  }) => {
    await openFixture(page, "uk", "another");
    await page.locator("[data-retirement-transfer]").click();
    await expect(retirement(page)).toHaveAttribute(
      "data-legacy-device-retirement",
      "another_account",
    );
    expect((await fixtureSnapshot(page)).deleteAttempts).toBe(0);
    await expect(retirement(page)).not.toContainText(
      /owner|00000000|synthetic-0/i,
    );
  });
});

function retirement(page: Page) {
  return page.locator("[data-legacy-device-retirement]");
}

async function openFixture(
  page: Page,
  locale: "uk" | "bg" | "ru",
  scenario: "happy" | "blocked" | "unavailable" | "slow" | "another",
) {
  const query = new URLSearchParams({ locale, scenario });
  const response = await page.goto(`${FIXTURE_PATH}?${query}`);
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() =>
    Boolean(window.__ove322LegacyRetirementFixture),
  );
  await expect(
    page.locator('[data-legacy-retirement-fixture="true"]'),
  ).toBeVisible();
}

function fixtureSnapshot(page: Page) {
  return page.evaluate(() => {
    const fixture = window.__ove322LegacyRetirementFixture;
    if (!fixture) throw new Error("Retirement fixture is unavailable.");
    return fixture.snapshot();
  });
}

function browserResidue(page: Page) {
  return page.evaluate(
    async ({ ownerDatabase }) => {
      const factory = indexedDB as IDBFactory & {
        databases?: () => Promise<IDBDatabaseInfo[]>;
      };
      if (typeof factory.databases !== "function") {
        throw new Error("Database enumeration is unavailable.");
      }
      const names = (await factory.databases()).map(({ name }) => name);
      const registrations = await navigator.serviceWorker.getRegistrations();
      return {
        ownerDatabasePresent: names.includes(ownerDatabase),
        unrelatedDatabasePresent: names.includes("ove322-unrelated-app"),
        legacyWorkerPresent: registrations.some((registration) =>
          [registration.active, registration.installing, registration.waiting]
            .filter(Boolean)
            .some((worker) => new URL(worker!.scriptURL).pathname === "/sw.js"),
        ),
        unrelatedCachePresent: (await caches.keys()).includes(
          "ove322-unrelated-cache",
        ),
        unrelatedLocalStorage: localStorage.getItem(
          "ove322-unrelated-local-storage",
        ),
        unrelatedCookie: document.cookie.includes(
          "ove322_unrelated_cookie=preserve",
        ),
      };
    },
    { ownerDatabase: OWNER_DATABASE },
  );
}
