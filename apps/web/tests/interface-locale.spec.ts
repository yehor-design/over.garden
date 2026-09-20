import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * One page, one interface language — in a real engine, in all three languages
 * and both markets.
 *
 * The defect this exists for was on production on 2026-09-17 and anyone could
 * see it: `/journals` with `<html lang="uk">`, Ukrainian content, Bulgarian
 * chrome, a language control the contract of the day forbade there, and a
 * banner offering the reader the language they were already reading. Every
 * unit test passed throughout.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/interface-locale.spec.ts
 *
 * Start the server **without** `--hostname 127.0.0.1` (see
 * `tests/site-shell.spec.ts` for why).
 */

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const PREFIX = "ove446";
const TEST_PASSWORD = "OVE446-local-password-1!";

const VANTAGES = [
  { locale: "uk", market: "ukraine", chrome: "Журнали" },
  { locale: "bg", market: "bulgaria", chrome: "Дневници" },
  { locale: "ru", market: "bulgaria", chrome: "Журналы" },
  // A reader in Bulgaria who chose Ukrainian keeps both: their market and
  // their language. The old model took the control away from them.
  { locale: "uk", market: "bulgaria", chrome: "Журнали" },
] as const;

async function selectVantage(
  context: BrowserContext,
  baseURL: string,
  locale: string,
  market: string,
) {
  await context.clearCookies();
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: market, url: baseURL },
  ]);
}

async function axeViolations(page: Page) {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, AXE_TAGS);
}

test.describe("one page, one interface language", () => {
  for (const vantage of VANTAGES) {
    test(`${vantage.market}/${vantage.locale}: chrome, document and control agree`, async ({
      baseURL,
      context,
      page,
    }) => {
      if (!baseURL) throw new Error("Playwright baseURL is required");
      await selectVantage(context, baseURL, vantage.locale, vantage.market);

      for (const address of ["/", "/journals"]) {
        const response = await page.goto(address, { waitUntil: "load" });
        expect(response?.status(), address).toBe(200);
        expect(
          response?.headers()["content-language"],
          `${address} Content-Language`,
        ).toBe(vantage.locale);
        await expect(
          page.locator('[data-site-shell-region="header"]'),
        ).toBeVisible();

        const reading = await page.evaluate(() => {
          const controls = [
            ...document.querySelectorAll("[data-interface-language-control]"),
          ];
          return {
            documentLanguage: document.documentElement.lang,
            controls: controls.length,
            options: controls[0]?.querySelectorAll("[data-interface-locale]")
              .length,
            chrome:
              document
                .querySelector('[data-site-shell-region="header"]')
                ?.textContent?.trim() ?? "",
          };
        });

        expect(reading.documentLanguage, `${address} html lang`).toBe(
          vantage.locale,
        );
        // Exactly one, in either market (docs/INTERFACE_LOCALE_CONTRACT.md).
        expect(reading.controls, `${address} controls`).toBe(1);
        // A public page is a static document (ADR-0032): it is prerendered
        // for every reader, so it carries no market, and the control on it
        // offers all three languages to everyone. Where the market *is*
        // decided is the proxy, which keeps it in the reader's cookie.
        const market = (await context.cookies(baseURL)).find(
          (cookie) => cookie.name === "overgarden_interface_market",
        )?.value;
        expect(market, `${address} market`).toBe(vantage.market);
        expect(reading.options, `${address} options`).toBe(3);
        expect(reading.chrome, `${address} chrome`).toContain(vantage.chrome);
      }
    });

    test(`${vantage.market}/${vantage.locale}: axe reports nothing`, async ({
      baseURL,
      context,
      page,
    }) => {
      if (!baseURL) throw new Error("Playwright baseURL is required");
      await selectVantage(context, baseURL, vantage.locale, vantage.market);
      for (const address of ["/", "/journals"]) {
        const response = await page.goto(address, { waitUntil: "load" });
        expect(response?.status(), address).toBe(200);
        await page.waitForTimeout(1_200);
        const violations = await axeViolations(page);
        expect(
          violations,
          `${vantage.market}/${vantage.locale} ${address}: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    });
  }

  test("a reader with no recognised signal lands in Ukrainian", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // Rule 3 of the contract: missing, malformed, unsupported or contradictory
    // market input fails to Ukraine. A local server sets no country header, so
    // this is the "none" vantage point exactly.
    await context.clearCookies();
    const response = await page.goto("/journals", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-language"]).toBe("uk");
    await expect(
      page.locator('[data-site-shell-region="header"]'),
    ).toBeVisible();
    const reading = await page.evaluate(() => ({
      documentLanguage: document.documentElement.lang,
      controls: document.querySelectorAll("[data-interface-language-control]")
        .length,
    }));
    const market = (await context.cookies()).find(
      (cookie) => cookie.name === "overgarden_interface_market",
    )?.value;
    expect({ ...reading, market }).toEqual({
      documentLanguage: "uk",
      controls: 1,
      market: "ukraine",
    });
  });
});

test.describe("an entry keeps the language it was written in", () => {
  let pool: Pool;
  let gardenerId: string | null = null;

  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });

  test.afterAll(async () => {
    await removeSyntheticGardener(pool, gardenerId);
    await pool.end();
  });

  test("a Bulgarian entry carries lang in a Ukrainian reader's directory", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    // Published *as a Bulgarian reader*, so `source_language` is `bg` because
    // the composer wrote it, not because a fixture said so.
    await selectVantage(context, baseURL, "bg", "bulgaria");
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: PREFIX,
      password: TEST_PASSWORD,
    });
    gardenerId = gardener.id;

    const title = `Домати след смяна на режима ${PREFIX}`;
    await page.goto("/garden", { waitUntil: "load" });
    const composer = page.locator("#first-entry-composer");
    await expect(composer).toBeVisible({ timeout: 20_000 });
    await composer.locator('input[name="plantName"]').fill(`Домат ${PREFIX}`);
    await composer.locator('input[name="plantName"]').press("Escape");
    const spaceName = composer.locator('input[name="spaceName"]');
    if ((await spaceName.count()) > 0 && !(await spaceName.inputValue())) {
      await spaceName.fill(`Градина ${PREFIX}`);
    }
    const editor = composer
      .locator(
        '[data-structured-journal-composer="true"] [contenteditable="true"]',
      )
      .first();
    await editor.click();
    await page.keyboard.type(title);
    const disclosure = composer.locator(
      'input[name="publicationDisclosureAccepted"]',
    );
    if ((await disclosure.count()) > 0) await disclosure.check();
    const [published] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().includes("/api/garden/entries") &&
          candidate.request().method() === "POST",
        { timeout: 30_000 },
      ),
      composer
        .getByRole("button", { name: /Публикувай|Опублікувати|Опубликовать/u })
        .click(),
    ]);
    expect(published.status()).toBeLessThan(400);

    // The column is what the listing reads; assert the stored fact first, so a
    // missing `lang` below cannot be blamed on the write.
    const stored = await pool.query<{ source_language: string }>(
      `select source_language from journal_entries
       where owner_user_id = $1::uuid and public_slug is not null
       order by created_at desc limit 1`,
      [gardenerId],
    );
    expect(stored.rows[0]?.source_language).toBe("bg");

    // Now read the same entry as a Ukrainian reader.
    await selectVantage(context, baseURL, "uk", "ukraine");
    const response = await page.goto("/journals", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expect(
      page.locator('[data-site-shell-region="header"]'),
    ).toBeVisible();

    const marked = await page.evaluate(() => {
      const document_ = document.documentElement.lang;
      const marked_ = [...document.querySelectorAll('[lang="bg"]')].map(
        (node) => node.textContent?.trim().slice(0, 60) ?? "",
      );
      return { document: document_, marked: marked_ };
    });
    expect(marked.document).toBe("uk");
    // The chrome is Ukrainian, the entry is Bulgarian, and the entry says so
    // (WCAG 3.1.2). This is the shape the product is for: untranslated
    // first-hand experience, read by somebody else.
    expect(
      marked.marked.some((text) => text.includes(PREFIX)),
      JSON.stringify(marked),
    ).toBe(true);
  });
});
