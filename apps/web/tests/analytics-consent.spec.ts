import { expect, test, type Browser } from "playwright/test";

/**
 * The paths the product measures, and the consent that gates them.
 *
 * GA4 and GTM are wired on nine public paths and nowhere else, and "every
 * instrumented path still fires its existing events" was a criterion of the
 * editorial redesign (`OVE-453`) that nothing held afterwards: a silent
 * analytics regression is invisible until a month of data is missing.
 * ADR-0032 D7 then changed how all of it mounts — the notice is in the static
 * document's bytes and drawn by CSS from two attributes an inline script puts
 * on `<html>`, and the tags mount after hydration — so this is where the
 * contract is asked of a real browser:
 *
 * - with consent given, an instrumented path requests the tag, in every
 *   language, and no other path does;
 * - with no answer yet, the notice is drawn on an instrumented path and only
 *   there, and nothing is requested;
 * - accepting stores the answer, loads the tag and removes the notice;
 *   declining stores the answer, loads nothing and removes the notice.
 *
 * The tag hosts are intercepted and answered locally: the question is whether
 * the page *asks* for the tag, and a gate that reported to a real property
 * would be measuring itself. Run against production on 2026-09-20 (the
 * document before ADR-0032) and against the static document: identical.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/analytics-consent.spec.ts
 */

const CONSENT_STORAGE_KEY = "overgarden:analytics-consent";
const TAG_HOSTS = /googletagmanager\.com|google-analytics\.com|clarity\.ms/u;

const INSTRUMENTED = [
  "/",
  "/blog",
  "/privacy",
  "/support",
  "/first-publication-disclosure",
  "/bg",
  "/bg/blog",
  "/ru/privacy",
];
const NOT_INSTRUMENTED = ["/journals", "/catalog", "/knowledge", "/communities"];

async function open(
  browser: Browser,
  baseURL: string,
  path: string,
  consent: "accepted" | "declined" | null,
) {
  const context = await browser.newContext({
    viewport: { width: 1_280, height: 900 },
  });
  await context.addCookies([
    { name: "overgarden_interface_locale", value: "uk", url: baseURL },
  ]);
  const page = await context.newPage();
  const requested: string[] = [];
  await page.route(TAG_HOSTS, (route) => {
    requested.push(new URL(route.request().url()).hostname);
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    });
  });
  if (consent) {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [CONSENT_STORAGE_KEY, consent],
    );
  }
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response?.status(), path).toBe(200);
  return {
    context,
    page,
    requested,
    notice: page.locator('[data-analytics-consent-banner="true"]:visible'),
  };
}

test.describe("the measured paths and the consent that gates them", () => {
  test("with consent, every instrumented path asks for its tag and no other path does", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(120_000);

    for (const path of INSTRUMENTED) {
      const { context, notice, requested } = await open(
        browser,
        baseURL,
        path,
        "accepted",
      );
      await expect
        .poll(() => requested.includes("www.googletagmanager.com"), {
          message: `${path} never asked for the tag`,
          timeout: 15_000,
        })
        .toBe(true);
      await expect(notice, path).toHaveCount(0);
      await context.close();
    }

    for (const path of NOT_INSTRUMENTED) {
      const { context, page, requested } = await open(
        browser,
        baseURL,
        path,
        "accepted",
      );
      // The tags mount after hydration, so "nothing was asked for" means
      // nothing once the bundle has had its say.
      await page.waitForTimeout(2_500);
      expect(requested, `${path} is not a measured path`).toEqual([]);
      await context.close();
    }
  });

  test("with no answer, the notice is drawn where it is owed and nothing is asked for", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    const measured = await open(browser, baseURL, "/blog", null);
    await expect(measured.notice).toHaveCount(1);
    await measured.page.waitForTimeout(2_500);
    expect(measured.requested).toEqual([]);
    await measured.context.close();

    const unmeasured = await open(browser, baseURL, "/journals", null);
    await unmeasured.page.waitForTimeout(2_500);
    await expect(unmeasured.notice).toHaveCount(0);
    expect(unmeasured.requested).toEqual([]);
    await unmeasured.context.close();

    const declined = await open(browser, baseURL, "/blog", "declined");
    await declined.page.waitForTimeout(2_500);
    await expect(declined.notice).toHaveCount(0);
    expect(declined.requested).toEqual([]);
    await declined.context.close();
  });

  test("accepting loads the tag, declining loads nothing, and either answer is kept", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");

    for (const answer of ["accepted", "declined"] as const) {
      const { context, notice, page, requested } = await open(
        browser,
        baseURL,
        "/blog",
        null,
      );
      await expect(notice).toHaveCount(1);
      // The notice is in the served bytes; its buttons answer once hydrated.
      // A press that lands before that does nothing, so press until it holds.
      await expect
        .poll(
          async () => {
            if ((await notice.count()) === 0) return true;
            await notice
              .getByRole("button")
              .nth(answer === "accepted" ? 0 : 1)
              .click({ timeout: 1_000 })
              .catch(() => undefined);
            return (await notice.count()) === 0;
          },
          { timeout: 15_000, intervals: [100, 250, 500, 1_000] },
        )
        .toBe(true);

      expect(
        await page.evaluate(
          (key) => window.localStorage.getItem(key),
          CONSENT_STORAGE_KEY,
        ),
      ).toBe(answer);
      if (answer === "accepted") {
        await expect
          .poll(() => requested.includes("www.googletagmanager.com"), {
            timeout: 15_000,
          })
          .toBe(true);
      } else {
        await page.waitForTimeout(2_000);
        expect(requested).toEqual([]);
      }
      await context.close();
    }
  });
});
