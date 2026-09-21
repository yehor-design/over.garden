import { expect, test, type Browser, type Locator } from "playwright/test";

import { waitForHydration } from "./helpers/hydration";

/**
 * The paths the product measures, the notice that asks first, and the answer
 * that gates both.
 *
 * GA4 and GTM are wired on nine public paths and nowhere else, and "every
 * instrumented path still fires its existing events" was a criterion of the
 * editorial redesign (`OVE-453`) that nothing held afterwards: a silent
 * analytics regression is invisible until a month of data is missing.
 * ADR-0032 D7 then changed how all of it mounts — the notice is in every
 * document's bytes and drawn by CSS from an attribute an inline script puts on
 * `<html>`, and the tags mount after hydration — so this is where the contract
 * is asked of a real browser.
 *
 * The notice is owed on **every** page until the reader answers (the owner,
 * 2026-09-21). It used to be drawn only where the tags run, so it vanished the
 * moment a reader left `/` — by a client-side navigation as surely as by a
 * document load — and a request-time screen never drew it at all.
 *
 * - with consent given, an instrumented path requests the tag, in every
 *   language, and no other path does;
 * - with no answer yet, the notice is drawn on every page, measured or not,
 *   static or request-time, stays through client-side navigations, and
 *   nothing is requested;
 * - a reader who has answered never sees it, not for one frame;
 * - accepting stores the answer, loads the tag where the path is measured and
 *   removes the notice; declining stores the answer, loads nothing and removes
 *   the notice; either answer holds on the next page, whichever page it was
 *   given on.
 *
 * The tag hosts are intercepted and answered locally: the question is whether
 * the page *asks* for the tag, and a gate that reported to a real property
 * would be measuring itself.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/analytics-consent.spec.ts
 */

const CONSENT_STORAGE_KEY = "overgarden:analytics-consent";
const TAG_HOSTS = /googletagmanager\.com|google-analytics\.com|clarity\.ms/u;
const NOTICE = '[data-analytics-consent-banner="true"]';

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
const NOT_INSTRUMENTED = [
  "/journals",
  "/catalog",
  "/knowledge",
  "/communities",
  // A request-time document: the workspace's, the account's and sign-in's.
  "/auth/sign-in",
];

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
  // Counts the frames the notice is painted in, from the document's first:
  // "not visible once loaded" says nothing about a notice that was painted
  // before hydration and then taken away. A frame's requestAnimationFrame
  // callbacks run just before it is painted, so what they see is what the
  // reader saw.
  await page.addInitScript((selector) => {
    const counter = window as unknown as { noticeFrames: number };
    counter.noticeFrames = 0;
    const sample = () => {
      if (document.querySelector(selector)?.checkVisibility()) {
        counter.noticeFrames += 1;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, NOTICE);
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response?.status(), path).toBe(200);
  return {
    context,
    page,
    requested,
    notice: page.locator(`${NOTICE}:visible`),
    noticeFrames: () =>
      page.evaluate(
        () => (window as unknown as { noticeFrames: number }).noticeFrames,
      ),
    hydrated: () =>
      waitForHydration(page.locator('[data-site-shell-region="header"]')),
  };
}

/** The notice's buttons answer once hydrated; press until the answer holds. */
async function answer(notice: Locator, choice: "accepted" | "declined") {
  await expect
    .poll(
      async () => {
        if ((await notice.count()) === 0) return true;
        await notice
          .getByRole("button")
          .nth(choice === "accepted" ? 0 : 1)
          .click({ timeout: 1_000 })
          .catch(() => undefined);
        return (await notice.count()) === 0;
      },
      { timeout: 15_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true);
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

  test("with no answer, every page draws the notice and nothing asks for a tag", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(120_000);

    for (const path of [...INSTRUMENTED, ...NOT_INSTRUMENTED]) {
      const { context, hydrated, notice, page, requested } = await open(
        browser,
        baseURL,
        path,
        null,
      );
      await expect(notice, path).toHaveCount(1);
      // Still there once React has adopted the page and had its say.
      await hydrated();
      await page.waitForTimeout(1_000);
      await expect(notice, path).toHaveCount(1);
      expect(requested, path).toEqual([]);
      await context.close();
    }
  });

  test("a reader who has answered never sees the notice, not for one frame", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(120_000);

    // A static document and a request-time one, each measured and not.
    for (const path of ["/", "/journals", "/support", "/auth/sign-in"]) {
      for (const consent of ["accepted", "declined"] as const) {
        const { context, hydrated, noticeFrames, page } = await open(
          browser,
          baseURL,
          path,
          consent,
        );
        await hydrated();
        await page.waitForTimeout(1_000);
        expect(await noticeFrames(), `${path}, ${consent}`).toBe(0);
        await context.close();
      }
    }
  });

  test("the notice stays through client-side navigations until it is answered", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(120_000);

    const { context, hydrated, notice, page, requested } = await open(
      browser,
      baseURL,
      "/",
      null,
    );
    await expect(notice).toHaveCount(1);
    await hydrated();
    // Survives only while no document is loaded: every step below must be a
    // client-side navigation for this proof to be about the one the owner saw.
    await page.evaluate(() => {
      (window as unknown as { sameDocument: boolean }).sameDocument = true;
    });
    const sameDocument = () =>
      page.evaluate(
        () =>
          (window as unknown as { sameDocument?: boolean }).sameDocument ===
          true,
      );

    for (const [key, path] of [
      ["feed", "/"],
      ["catalogue", "/catalog"],
      ["feed", "/"],
    ] as const) {
      await page
        .locator(`[data-site-shell-nav-item="${key}"]:visible`)
        .first()
        .click();
      await expect(page).toHaveURL((url) => url.pathname === path, {
        timeout: 15_000,
      });
      await page.waitForTimeout(1_000);
      expect(await sameDocument(), `${path} loaded a document`).toBe(true);
      await expect(notice, `after navigating to ${path}`).toHaveCount(1);
    }

    // Answered on the page the reader is on; gone for every page after.
    await page
      .locator('[data-site-shell-nav-item="catalogue"]:visible')
      .first()
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/catalog");
    await answer(notice, "declined");
    await page
      .locator('[data-site-shell-nav-item="feed"]:visible')
      .first()
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.waitForTimeout(1_000);
    expect(await sameDocument()).toBe(true);
    await expect(notice).toHaveCount(0);
    expect(requested).toEqual([]);
    await context.close();
  });

  test("accepting loads the tag where the path is measured, declining loads nothing, and either answer holds on the next page", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(120_000);

    for (const [path, choice] of [
      ["/blog", "accepted"],
      ["/blog", "declined"],
      // Answered where nothing is measured: the answer is the whole site's.
      ["/journals", "accepted"],
      ["/auth/sign-in", "declined"],
    ] as const) {
      const measured = !NOT_INSTRUMENTED.includes(path);
      const { context, notice, noticeFrames, page, requested } = await open(
        browser,
        baseURL,
        path,
        null,
      );
      await expect(notice, path).toHaveCount(1);
      await answer(notice, choice);

      expect(
        await page.evaluate(
          (key) => window.localStorage.getItem(key),
          CONSENT_STORAGE_KEY,
        ),
        path,
      ).toBe(choice);
      if (choice === "accepted" && measured) {
        await expect
          .poll(() => requested.includes("www.googletagmanager.com"), {
            timeout: 15_000,
          })
          .toBe(true);
      } else {
        await page.waitForTimeout(2_000);
        expect(requested, path).toEqual([]);
      }

      // The next page, loaded as a document: measured, so it runs the tags
      // exactly when the answer was yes, and it never draws the notice.
      requested.length = 0;
      await page.goto("/blog", { waitUntil: "load" });
      if (choice === "accepted") {
        await expect
          .poll(() => requested.includes("www.googletagmanager.com"), {
            message: `accepted on ${path}, then /blog never asked for the tag`,
            timeout: 15_000,
          })
          .toBe(true);
      } else {
        await page.waitForTimeout(2_500);
        expect(requested, `declined on ${path}`).toEqual([]);
      }
      expect(await noticeFrames(), `answered on ${path}, then /blog`).toBe(0);
      await context.close();
    }
  });
});
