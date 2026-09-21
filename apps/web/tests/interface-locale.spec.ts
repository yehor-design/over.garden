import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { waitForHydration } from "./helpers/hydration";
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
  { locale: "uk", market: "ukraine", chrome: "Стрічка" },
  { locale: "bg", market: "bulgaria", chrome: "Емисия" },
  { locale: "ru", market: "bulgaria", chrome: "Лента" },
  // A reader in Bulgaria who chose Ukrainian keeps both: their market and
  // their language. The old model took the control away from them.
  { locale: "uk", market: "bulgaria", chrome: "Стрічка" },
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

/**
 * A language, once chosen, stays chosen.
 *
 * The owner found this on 2026-09-21 on their own profile page: the language
 * control there did nothing. Three defects stacked, and no test had ever
 * pressed a language option to see any of them.
 *
 * 1. On a workspace route the choice is a Server Action that writes the
 *    cookie. The render that follows it read the language from a header the
 *    proxy had set *before* the choice, which outranked the cookie, so the page
 *    came back in the language the reader had just left.
 * 2. That page's own `/ru/…` links were then prefetched, and the proxy wrote
 *    the preference from the prefix of every request it could not tell from a
 *    landing — a router prefetch included — so each one wrote `ru` back.
 * 3. With both fixed, a gardener's pages still stayed in the old language: the
 *    transition that applies the action's render never committed. React's
 *    canary in Next 16.2.11 drops a ping that arrives from inside a render that
 *    has already suspended with delay (facebook/react#36134, backported in
 *    `patches/next@16.2.11.patch`).
 *
 * Asserted on what is deterministic: what the page says after the choice and
 * after a reload, and which responses wrote the preference at all. A prefetch's
 * `Set-Cookie` racing a reload is not something to assert (see
 * `next-strips-router-headers-before-middleware` in the proxy's history).
 */
const LOCALE_COOKIE = "overgarden_interface_locale";
const CHOICE_PREFIX = "ove472";
const CHROME = { uk: "Стрічка", bg: "Емисия", ru: "Лента" } as const;
type ChoiceLocale = keyof typeof CHROME;

function recordLanguageWrites(page: Page) {
  const writes: Array<{ path: string; by: string; value: string }> = [];
  const pending: Array<Promise<void>> = [];
  page.on("response", (response) => {
    pending.push(
      response
        .allHeaders()
        .then((headers) => {
          const line = (headers["set-cookie"] ?? "")
            .split("\n")
            .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`));
          if (!line) return;
          const request = response.request();
          writes.push({
            path: new URL(response.url()).pathname,
            by: request.headers()["next-action"]
              ? "action"
              : request.resourceType(),
            value: line.split(";")[0]!.split("=")[1]!,
          });
        })
        // A response still arriving when the test closes its page cannot be
        // read any more; it must not fail the test in place of what it proved.
        .catch(() => undefined),
    );
  });
  return {
    async all() {
      await Promise.all(pending);
      return writes;
    },
    /** Everything that wrote the preference and was not a choice. */
    async notChoices() {
      await Promise.all(pending);
      return writes.filter(
        (write) => write.by !== "document" && write.by !== "action",
      );
    },
  };
}

async function chooseLanguage(page: Page, locale: ChoiceLocale) {
  const control = page.locator("[data-interface-language-control]");
  await expect(control).toHaveCount(1);
  const summary = control.locator("summary");
  const option = control.locator(
    `[data-interface-language-option][data-interface-locale="${locale}"]`,
  );
  await waitForHydration(summary);
  await waitForHydration(option);
  // A reader chooses from a page that has settled, and that is when the
  // stalled transition (3 above) reproduced: pressed the instant the control
  // hydrated, it committed often enough to pass against the broken build.
  await page.waitForLoadState("networkidle");
  await summary.click();
  await option.click();
}

async function expectLanguage(page: Page, locale: ChoiceLocale) {
  await expect(
    page.locator(
      `[data-interface-language-option][data-interface-locale="${locale}"]`,
    ),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-site-shell-region="header"]')).toContainText(
    CHROME[locale],
  );
}

test.describe("a language, once chosen, stays chosen", () => {
  let pool: Pool;
  let gardenerId: string | null = null;

  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });

  test.afterAll(async () => {
    await removeSyntheticGardener(pool, gardenerId);
    await pool.end();
  });

  test("a guest's choice on a workspace route re-renders the page, and holds", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectVantage(context, baseURL, "ru", "bulgaria");
    const writes = recordLanguageWrites(page);

    await page.goto("/garden", { waitUntil: "load" });
    await expectLanguage(page, "ru");
    await chooseLanguage(page, "uk");
    // No reload: the action's own render is the answer, and it used to be
    // Russian.
    await expectLanguage(page, "uk");

    await page.reload({ waitUntil: "load" });
    await expectLanguage(page, "uk");
    expect(await writes.notChoices()).toEqual([]);
    expect(await writes.all()).toContainEqual({
      path: "/garden",
      by: "action",
      value: "uk",
    });
  });

  test("a gardener's workspace and both profile pages keep the language chosen", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(90_000);
    await selectVantage(context, baseURL, "ru", "bulgaria");
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: CHOICE_PREFIX,
    });
    gardenerId = gardener.id;
    const writes = recordLanguageWrites(page);

    // The workspace's own page, which is the heaviest re-render there is.
    // With the server fixed, it still came back Russian nine times in ten: the
    // action's render suspended with delay, a Flight chunk pinged the root
    // synchronously from inside that render, and React 19.3's canary of
    // 2026-03-17 dropped the ping, so the transition waited for ever. Next
    // 16.2.11 carries that canary; `patches/next@16.2.11.patch` backports the
    // one-line fix (facebook/react#36134).
    await page.goto("/garden", { waitUntil: "load" });
    await expectLanguage(page, "ru");
    await chooseLanguage(page, "uk");
    await expectLanguage(page, "uk");

    // The workspace profile, where the owner found it: a form over a Server
    // Action, because the address names no language. The choice made on the
    // page before is the one this page opens in.
    await page.goto("/garden/profile", { waitUntil: "load" });
    await expect(page.locator("h1")).toHaveText("Мій публічний профіль");
    await chooseLanguage(page, "bg");
    await expect(page.locator("h1")).toHaveText("Моят публичен профил");
    await expectLanguage(page, "bg");
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("h1")).toHaveText("Моят публичен профил");

    // The public one: a link to the prefixed spelling of the same page, which
    // the proxy folds back to its one address where the language has one.
    const profile = `/@${gardener.handle}`;
    await page.goto(profile, { waitUntil: "load" });
    await expectLanguage(page, "bg");
    await expect(
      page.locator(
        '[data-interface-language-option][data-interface-locale="uk"]',
      ),
    ).toHaveAttribute("href", `/uk${profile}`);
    await chooseLanguage(page, "uk");
    await expect(page).toHaveURL(new RegExp(`${profile}$`));
    await expectLanguage(page, "uk");
    await page.reload({ waitUntil: "load" });
    await expectLanguage(page, "uk");

    expect(await writes.notChoices()).toEqual([]);
  });

  test("a prefixed address the router fetches is never a choice", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectVantage(context, baseURL, "uk", "bulgaria");
    const writes = recordLanguageWrites(page);
    await page.goto("/journals", { waitUntil: "load" });
    await expectLanguage(page, "uk");

    // What a router prefetch of a Russian link is by the time it reaches the
    // proxy: Next strips its own headers first, and the browser's
    // `Sec-Fetch-Dest: empty` is what is left of it.
    const status = await page.evaluate(() =>
      fetch("/ru/journals", { headers: { rsc: "1" } }).then(
        (response) => response.status,
      ),
    );
    expect(status).toBe(200);
    expect(await writes.notChoices()).toEqual([]);
    await page.reload({ waitUntil: "load" });
    await expectLanguage(page, "uk");

    // The same address *loaded* is a choice, and is written down.
    await page.goto("/ru/journals", { waitUntil: "load" });
    await expectLanguage(page, "ru");
    expect(await writes.all()).toContainEqual({
      path: "/ru/journals",
      by: "document",
      value: "ru",
    });
  });
});
