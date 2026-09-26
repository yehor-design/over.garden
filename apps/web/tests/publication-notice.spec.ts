import { expect, test } from "playwright/test";

import {
  getLegalDocument,
  LEGAL_DOCUMENT_PATHS,
} from "../src/lib/legal/legal-documents";
import { getTrustSurfaceCopy } from "../src/lib/trust-surface-copy";

test("the terms, the privacy policy and the cookie rules are readable without JavaScript in every language", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("A local server is required");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const prefix = locale === "uk" ? "" : `/${locale}`;
      const copy = getTrustSurfaceCopy(locale);
      for (const key of ["terms", "privacy", "cookies"] as const) {
        const document = getLegalDocument(locale, key);
        const response = await page.goto(
          `${baseURL}${prefix}${LEGAL_DOCUMENT_PATHS[key]}`,
        );
        expect(response?.status()).toBe(200);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: document.title,
            exact: true,
          }),
        ).toBeVisible();
        for (const section of document.sections) {
          await expect(
            page.locator(`h2[id="${section.id}"]`),
            `${locale} ${key} ${section.id}`,
          ).toHaveText(section.heading);
        }
        await expect(page.locator("main")).toContainText(document.version);
      }
      // The old disclosure is a section of the terms now: one 308, in the
      // reader's language, to the section that holds its content.
      const moved = await page.request.get(
        `${baseURL}${prefix}/first-publication-disclosure`,
        { maxRedirects: 0 },
      );
      expect(moved.status()).toBe(308);
      expect(moved.headers().location).toBe(
        `${prefix}/terms#terms-publishing`,
      );
      await page.goto(`${baseURL}${prefix}/privacy`);
      await expect(page.locator('main a[href="/support"]')).toBeVisible();
      await page.locator('main a[href="/support"]').click();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: copy.support.title,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('main a[href^="mailto:"]')).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
