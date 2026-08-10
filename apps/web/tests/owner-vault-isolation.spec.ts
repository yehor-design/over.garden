import { expect, test } from "playwright/test";

test.describe("OVE-288 physical owner-vault isolation", () => {
  test("isolates two owners, retains sign-out, degrades offline only, and erases exactly one owner", async ({
    page,
  }) => {
    await page.goto("/__visual-fixtures/owner-vault?locale=uk");
    await page.getByRole("button", { name: "Reset fixture" }).click();
    await expect(page.locator("[data-owner-a-count]")).toHaveText("0");
    await expect(page.locator("[data-owner-b-count]")).toHaveText("0");

    await page.getByRole("button", { name: "Seed isolated owners" }).click();
    await expect(page.locator("[data-owner-a-count]")).toHaveText("1");
    await expect(page.locator("[data-owner-b-count]")).toHaveText("1");

    await page.reload();
    await expect(page.locator("[data-owner-a-count]")).toHaveText("1");
    await expect(page.locator("[data-owner-b-count]")).toHaveText("1");
    await page
      .getByRole("button", { name: "Retain owner A across sign-out" })
      .click();
    await expect(page.locator("[data-owner-a-count]")).toHaveText("1");

    await page.getByRole("button", { name: "Deny offline binding" }).click();
    await expect(page.locator("[data-owner-vault-offline-state]")).toHaveText(
      "degraded",
    );
    await page
      .getByRole("button", { name: "Server-backed private action" })
      .click();
    await expect(page.locator("[data-server-action-count]")).toHaveText("1");

    await page.getByRole("button", { name: "Seed isolated owners" }).click();
    await page
      .getByRole("button", {
        name: "Очистити локальні дані цього пристрою",
      })
      .click();
    await expect(page.locator("[data-owner-vault-erasure-state]")).toHaveText(
      "erased_confirmed",
    );
    await expect(page.locator("[data-owner-a-count]")).toHaveText("0");
    await expect(page.locator("[data-owner-b-count]")).toHaveText("1");
  });

  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`names current-device scope without remote claims in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/__visual-fixtures/owner-vault?locale=${locale}`);
      const scope = page.locator("[data-owner-vault-localized-scope]");
      await expect(scope).toBeVisible();
      await expect(scope).toContainText(/брауз/i);
      await expect(scope).toContainText(/пристро|устройств/i);
    });
  }
});
