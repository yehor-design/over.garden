import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";
import { Pool } from "pg";

import { hashPassword } from "better-auth/crypto";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { OWNER_BROWSER_FIXTURE } from "./helpers/owner-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
} from "./helpers/synthetic-gardener";
import { acceptLegalDocuments } from "./helpers/legal-acceptance";

/**
 * `OVE-505`: the consent notice, the privacy pages, and erasure as a member
 * asks for it and as the owner carries it out.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=consent-and-erasure.spec.ts
 *
 * Every mutation is made through the page's own controls and read back from
 * the local database. The erasure is real, of a synthetic gardener written
 * into the local database for this run; nothing leaves it.
 */

const PREFIX = "ove505";
const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const CONSENT_KEY = "overgarden:analytics-consent";
const NOTICE = "[data-analytics-consent-banner]";
const TAB_BAR = '[data-site-shell-region="mobile-navigation"]';
const OWNER_PAGE = "/garden/privacy/erasure-requests";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-505",
);

type Locale = "uk" | "bg" | "ru";

interface Gardener {
  id: string;
  email: string;
  handle: string;
}

let pool: Pool;
let passwordHash: Promise<string> | null = null;
const gardenerIds: string[] = [];
const requestIds: string[] = [];
const erasedSubjectIds: string[] = [];
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
});

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (!pool) return;
  // An erased gardener's garden, entries and removal intents now belong to a
  // synthetic subject id, which the request row names after the erasure.
  const owners = [...gardenerIds, ...erasedSubjectIds];
  for (const [table, column] of [
    ["public_projection_intents", "owner_user_id"],
    ["journal_entries", "owner_user_id"],
    ["plant_objects", "owner_user_id"],
    ["spaces", "owner_user_id"],
  ] as const) {
    await pool.query(`delete from ${table} where ${column} = any($1::uuid[])`, [
      owners,
    ]);
  }
  await pool.query(`delete from erasure_requests where id = any($1::uuid[])`, [
    requestIds,
  ]);
  for (const id of gardenerIds) await removeSyntheticGardener(pool, id);
  await pool.end();
});

async function createGardener(label: string): Promise<Gardener> {
  passwordHash ??= hashPassword(SYNTHETIC_GARDENER_PASSWORD);
  const id = randomUUID();
  const email = `${PREFIX}-${label}-${id}@example.test`;
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  await acceptLegalDocuments(pool, id);
  gardenerIds.push(id);
  await pool.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
    [randomUUID(), id, await passwordHash],
  );
  const profile = await pool.query<{ handle: string }>(
    `select handle from user_public_profiles where user_id = $1::uuid`,
    [id],
  );
  return { id, email, handle: profile.rows[0]!.handle };
}

/** A garden worth erasing: one space, one object, one public entry. */
async function seedGarden(owner: Gardener) {
  const run = randomUUID().slice(0, 6);
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
     returning id::text id`,
    [owner.id, `Сад ${PREFIX} ${run}`],
  );
  const object = await pool.query<{ id: string }>(
    `insert into plant_objects
       (owner_user_id, space_id, display_name, object_kind, public_slug,
        variety_text, variety_state)
     values ($1::uuid, $2::uuid, $3, 'plant', $4, null, 'unknown')
     returning id::text id`,
    [owner.id, space.rows[0]!.id, `Томат ${PREFIX}`, `${PREFIX}-tomat-${run}`],
  );
  await pool.query(
    `insert into journal_entries
       (owner_user_id, space_id, plant_object_id, title, body,
        client_mutation_id, public_slug, published_at, entry_date,
        source_language, visibility, lifecycle_state, content_class,
        entry_scope)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(),
             current_date, 'uk', 'public', 'active', 'real_ugc', 'object')`,
    [
      owner.id,
      space.rows[0]!.id,
      object.rows[0]!.id,
      `Перший запис ${PREFIX}`,
      "Листя рівне.",
      randomUUID(),
      `${PREFIX}-entry-${run}`,
    ],
  );
}

async function readerContext(
  browser: Browser,
  baseURL: string,
  options: {
    locale?: Locale;
    viewport?: { width: number; height: number };
    consent?: "accepted" | "declined" | null;
  } = {},
) {
  const locale = options.locale ?? "uk";
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
  });
  contexts.push(context);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: MARKET_COOKIE,
      value: locale === "bg" ? "bulgaria" : "ukraine",
      url: baseURL,
    },
  ]);
  // The measurement tags never leave this machine.
  await context.route(
    /googletagmanager\.com|google-analytics\.com|clarity\.ms/,
    (route) => route.fulfill({ status: 204, body: "" }),
  );
  const consent = options.consent === undefined ? "declined" : options.consent;
  if (consent) {
    await context.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key!, value!);
        } catch {
          // Storage may be blocked; the notice is then simply drawn.
        }
      },
      [CONSENT_KEY, consent],
    );
  }
  return context;
}

async function signInOnScreen(page: Page, email: string, password: string) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="password"]') });
  await waitForHydration(form.locator('button[type="submit"]'));
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
}

async function expectNoSidewaysScroll(page: Page, label: string) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
    label,
  ).toBeLessThanOrEqual(0);
}

/**
 * Tabs through the page until focus reaches the tab bar or the notice — the
 * two things fixed at the bottom of the screen — and names every control that
 * was left, even partly, beneath either.
 */
async function tabUntilChrome(page: Page, maxPresses = 150) {
  const covered: string[] = [];
  let reached = 0;
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    const seen = await page.evaluate(
      (chrome) => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) return null;
        const target = active.getBoundingClientRect();
        if (target.width === 0 || target.height === 0) return null;
        const under: string[] = [];
        for (const [name, selector] of Object.entries(chrome)) {
          const element = document.querySelector(selector);
          if (!element) continue;
          if (element.contains(active)) return { inChrome: true, under };
          const box = element.getBoundingClientRect();
          if (box.height === 0) continue;
          const down =
            Math.min(target.bottom, box.bottom) - Math.max(target.top, box.top);
          const across =
            Math.min(target.right, box.right) - Math.max(target.left, box.left);
          if (down > 0 && across > 0) {
            under.push(`${name} ${Math.round(down)} px`);
          }
        }
        return {
          inChrome: false,
          under,
          label: `${active.tagName} ${(active.textContent ?? active.getAttribute("aria-label") ?? "").trim().slice(0, 40)}`,
        };
      },
      { "tab bar": TAB_BAR, notice: NOTICE },
    );
    if (!seen) continue;
    if (seen.inChrome) break;
    reached += 1;
    if (seen.under.length)
      covered.push(`${seen.label} → ${seen.under.join(", ")}`);
  }
  return { reached, covered };
}

/** Two painted frames: a sticky row settles where it sticks. */
async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await nextFrames(page);
}

/** What of the tab bar and the notice lies over this control, if anything. */
async function underChrome(page: Page, control: Locator) {
  const target = await control.boundingBox();
  if (!target) throw new Error("The control is not rendered.");
  return page.evaluate(
    ({ chrome, box }) =>
      Object.entries(chrome).flatMap(([name, selector]) => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        if (!rect || rect.height === 0) return [];
        const down =
          Math.min(box.y + box.height, rect.bottom) - Math.max(box.y, rect.top);
        const across =
          Math.min(box.x + box.width, rect.right) - Math.max(box.x, rect.left);
        return down > 0 && across > 0 ? [`${name} ${Math.round(down)} px`] : [];
      }),
    { chrome: { "tab bar": TAB_BAR, notice: NOTICE }, box: target },
  );
}

async function focusedInsideOutcome(page: Page, outcome: string) {
  return page.evaluate(
    (name) =>
      document
        .querySelector(`[data-action-outcome="${name}"]`)
        ?.contains(document.activeElement) ?? false,
    outcome,
  );
}

test.describe("consent: one question, two equal answers, never in the way (OVE-505)", () => {
  test("every page asks the same short question, with a way to the details", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!, {
      viewport: { width: 320, height: 640 },
      consent: null,
    });
    const page = await context.newPage();
    for (const address of ["/", "/journals", "/privacy", "/support"]) {
      await page.goto(address, { waitUntil: "load" });
      const notice = page.locator(`${NOTICE}:visible`);
      await expect(notice, address).toHaveCount(1);
      // A named region, not a dialog: it takes and holds no focus.
      await expect(
        page.getByRole("region", { name: "Згода на аналітику" }),
      ).toBeVisible();
      expect(await notice.getAttribute("role"), address).toBeNull();
      // One question: who measures, and which pages. Microsoft is named only
      // where this deployment runs Clarity.
      await expect(notice.locator("#analytics-consent-message")).toHaveText(
        /^Дозволите Google (і Microsoft )?вимірювати відвідування головної, статей і довідкових сторінок\? Докладніше$/u,
      );
      await expect(
        notice.getByRole("link", { name: "Докладніше" }),
      ).toHaveAttribute("href", "/privacy#privacy-choices");
      // The two answers weigh the same.
      const answers = notice.locator("[data-analytics-consent-answer]");
      await expect(answers).toHaveCount(2);
      const [accept, decline] = await answers.evaluateAll((buttons) =>
        buttons.map((button) => {
          const style = getComputedStyle(button);
          return {
            text: button.textContent?.trim(),
            className: button.className,
            background: style.backgroundColor,
            color: style.color,
            border: style.borderTopColor,
            height: button.getBoundingClientRect().height,
          };
        }),
      );
      expect(accept!.text).toBe("Дозволити");
      expect(decline!.text).toBe("Не дозволяти");
      expect(accept!.className).toBe(decline!.className);
      expect(accept!.background).toBe(decline!.background);
      expect(accept!.border).toBe(decline!.border);
      expect(Math.abs(accept!.height - decline!.height)).toBeLessThan(1);
      await expectNoSidewaysScroll(page, address);
    }
    await page.goto("/", { waitUntil: "load" });
    await page.screenshot({
      path: path.join(SCREENSHOTS, "consent-320.png"),
    });
  });

  for (const viewport of [
    { width: 320, height: 640, label: "320 px" },
    // 1280 × 900 at 200 % zoom.
    { width: 640, height: 450, label: "200% zoom" },
  ]) {
    for (const consent of [null, "declined"] as const) {
      test(`at ${viewport.label}, ${consent ? "once answered" : "while an answer is owed"}, nothing the keyboard reaches is left under the tab bar or the notice`, async ({
        browser,
        baseURL,
      }) => {
        test.setTimeout(120_000);
        const context = await readerContext(browser, baseURL!, {
          viewport: { width: viewport.width, height: viewport.height },
          consent,
        });
        const page = await context.newPage();
        for (const address of ["/journals", "/", "/support"]) {
          await page.goto(address, { waitUntil: "load" });
          await expect(page.locator(`${NOTICE}:visible`)).toHaveCount(
            consent ? 0 : 1,
          );
          await waitForHydration(page.locator("main").first());
          const { reached, covered } = await tabUntilChrome(page);
          expect(reached, address).toBeGreaterThan(10);
          expect(covered, `${address}: ${covered.join(" | ")}`).toEqual([]);
        }
      });
    }
  }

  test("with a phone's bottom inset, the notice sits above the tab bar and focus stays clear of both", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await readerContext(browser, baseURL!, {
      viewport: { width: 320, height: 640 },
      consent: null,
    });
    const page = await context.newPage();
    // A home indicator's 34 px, as an iPhone reports it to a page that
    // covers the screen. Chromium applies it to `env()` either way.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { bottom: 34, bottomMax: 34 },
    });
    await page.goto("/journals", { waitUntil: "load" });
    await waitForHydration(page.locator("main").first());
    const [notice, tabBar] = await page.evaluate(
      ([noticeSelector, tabBarSelector]) =>
        [noticeSelector!, tabBarSelector!].map((selector) => {
          const box = document.querySelector(selector)!.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, height: box.height };
        }),
      [NOTICE, TAB_BAR],
    );
    // The bar pads itself by the inset; the notice clears the padded bar.
    expect(tabBar!.height).toBeGreaterThanOrEqual(56 + 34);
    expect(notice!.bottom).toBeLessThanOrEqual(tabBar!.top);
    const { reached, covered } = await tabUntilChrome(page);
    expect(reached).toBeGreaterThan(10);
    expect(covered, covered.join(" | ")).toEqual([]);
    await scrollToTop(page);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "consent-320-bottom-inset.png"),
    });
  });

  test("both answers are reachable by keyboard, and an answer holds on the next page", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!, {
      viewport: { width: 320, height: 640 },
      consent: null,
    });
    const page = await context.newPage();
    await page.goto("/support", { waitUntil: "load" });
    const decline = page.locator('[data-analytics-consent-answer="declined"]');
    await waitForHydration(decline);
    let focused = false;
    for (let press = 0; press < 150 && !focused; press += 1) {
      await page.keyboard.press("Tab");
      focused = await decline.evaluate(
        (element) => element === document.activeElement,
      );
    }
    expect(focused).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator(`${NOTICE}:visible`)).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute(
      "data-analytics-consent",
      "declined",
    );
    await expect(
      page.locator("[data-analytics-consent-spacer]:visible"),
    ).toHaveCount(0);
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator(`${NOTICE}:visible`)).toHaveCount(0);
  });

  test("the privacy page says the answer, changes it, and keeps the storage detail folded", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!, { consent: null });
    const page = await context.newPage();
    await page.goto("/privacy#privacy-choices", { waitUntil: "load" });
    const analytics = page.locator('[data-privacy-choice="analytics"]');
    await expect(analytics).toContainText("Не вибрано");
    await expect(analytics.locator("details[open]")).toHaveCount(0);
    const allow = analytics.getByRole("button", {
      name: "Дозволити аналітику",
    });
    await waitForHydration(allow);
    await allow.click();
    await expect(analytics).toContainText("Дозволено");
    await expect(page.locator(`${NOTICE}:visible`)).toHaveCount(0);
    // Reader-first order: what becomes public, how long it is kept, the
    // reader's own choices, and only then the version and its review note.
    const order = await page.evaluate(() =>
      [
        "privacy-public",
        "privacy-retention",
        "privacy-choices",
        "privacy-version",
      ].map(
        (id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1,
      ),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await page.screenshot({
      path: path.join(SCREENSHOTS, "privacy-choices-1280.png"),
    });
  });
});

test.describe("erasure, asked for and carried out (OVE-505)", () => {
  let member: Gardener;
  let memberContext: BrowserContext;
  let ownerContext: BrowserContext;
  let requestId: string;

  test("a member tells one entry from the account, and a request is read back", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    member = await createGardener("member");
    await seedGarden(member);
    memberContext = await readerContext(browser, baseURL!);
    const page = await memberContext.newPage();
    await page.goto("/auth/sign-in?next=%2Ferasure", { waitUntil: "load" });
    await signInOnScreen(page, member.email, SYNTHETIC_GARDENER_PASSWORD);
    await page.waitForURL("**/erasure", { timeout: 30_000 });

    const choices = page.locator("#erasure-choices");
    await expect(choices).toContainText("Один запис");
    await expect(choices).toContainText("Для цього запит не потрібен");
    await expect(
      choices.getByRole("link", { name: "До мого саду" }),
    ).toHaveAttribute("href", "/garden");
    await expect(choices).toContainText("Копії поза OverGarden");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "erasure-member-1280.png"),
      fullPage: true,
    });

    // The server's own guard: the conditions unaccepted, nothing is sent.
    const submit = page.getByRole("button", {
      name: "Надіслати запит на видалення",
    });
    await waitForHydration(submit);
    await page
      .locator('input[name="erasureAcknowledgementAccepted"]')
      .evaluate((input) => input.removeAttribute("required"));
    await submit.click();
    await page.waitForURL("**/erasure?result=acknowledgement-required");
    const refused = page.locator(
      '[data-action-outcome="acknowledgement-required"]',
    );
    await expect(refused).toContainText("Запит не надіслано");
    await expect(refused.getByRole("alert")).toBeVisible();
    const none = await pool.query(
      `select count(*)::int as count from erasure_requests where requester_user_id = $1::uuid`,
      [member.id],
    );
    expect(none.rows[0]!.count).toBe(0);

    // Accepted and sent: the request is read back with its reference.
    await page
      .getByText(
        "Я розумію, що це лише надсилає запит на операторський розгляд",
      )
      .click();
    await page
      .getByRole("button", { name: "Надіслати запит на видалення" })
      .click();
    await page.waitForURL("**/erasure?result=received");
    const stored = await pool.query<{ id: string; status: string }>(
      `select id::text, status from erasure_requests where requester_user_id = $1::uuid`,
      [member.id],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.status).toBe("submitted");
    requestId = stored.rows[0]!.id;
    requestIds.push(requestId);
    const reference = `request-${requestId.replaceAll("-", "").slice(-8)}`;
    const received = page.locator('[data-action-outcome="received"]');
    await expect(received).toContainText("Запит отримано");
    await expect(received).toContainText(reference);
    await expect.poll(() => focusedInsideOutcome(page, "received")).toBe(true);
    await expect(
      page.locator('[data-erasure-request-status="submitted"]'),
    ).toContainText("Що далі");
    // An open request offers no second form.
    await expect(
      page.locator('input[name="erasureAcknowledgementAccepted"]'),
    ).toHaveCount(0);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "erasure-received-1280.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "erasure-received-uk-1280");
    await page.setViewportSize({ width: 320, height: 900 });
    await expectNoSidewaysScroll(page, "erasure received 320");
    await scanAccessibility(page, testInfo, "erasure-received-uk-320");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "erasure-received-320.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    // The owner's page is not a member's.
    const denied = await page.goto(OWNER_PAGE, { waitUntil: "load" });
    expect(denied?.status()).toBe(200);
    await expect(
      page.locator('[data-operator-access-state="denied"]'),
    ).toBeVisible();
    await expect(page.locator("[data-erasure-request]")).toHaveCount(0);
  });

  test("on a phone, a setup step's Next and the composer's Publish stay above the tab bar and the notice", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    // The member's own session, on a phone, before any answer.
    const state = await memberContext.storageState();
    state.origins = state.origins.map((origin) => ({
      ...origin,
      localStorage: origin.localStorage.filter(
        (item) => item.name !== CONSENT_KEY,
      ),
    }));
    const phone = await browser.newContext({
      viewport: { width: 320, height: 640 },
      storageState: state,
    });
    contexts.push(phone);
    await phone.route(
      /googletagmanager\.com|google-analytics\.com|clarity\.ms/,
      (route) => route.fulfill({ status: 204, body: "" }),
    );
    const page = await phone.newPage();

    // A setup flow is a full-screen stepper (DESIGN.md §5.24): the tab bar is
    // gone under it, its "Next" sits at the bottom of the screen, and the
    // notice floats above it — answerable, never on it. "Next" once opened
    // underneath the bar at 320 px.
    await page.goto("/garden/objects/new", { waitUntil: "load" });
    await expect(page.locator(`${NOTICE}:visible`)).toHaveCount(1);
    const next = page.getByRole("button", { name: "Далі" }).first();
    await waitForHydration(next);
    expect(await underChrome(page, next), "Next at load").toEqual([]);
    await expect(page.locator(TAB_BAR)).toBeHidden();
    // Tab stays in the frame — close, the answer, "Next" — and then reaches
    // the notice rather than the page under the frame.
    const walk = await tabUntilChrome(page);
    expect(walk.reached).toBeGreaterThanOrEqual(3);
    expect(walk.covered, walk.covered.join(" | ")).toEqual([]);
    await scrollToTop(page);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "setup-next-320-notice.png"),
    });

    // The composer has no tab bar; its publish row sticks above the notice,
    // at the start of the form and wherever it is scrolled to.
    await page.goto("/garden/new", { waitUntil: "load" });
    const publish = page.locator("[data-entry-composer-publish]");
    await expect(publish).toBeVisible();
    await waitForHydration(publish);
    expect(await underChrome(page, publish), "Publish at load").toEqual([]);
    await publish.evaluate((button) => {
      const form = button.closest("form")!;
      window.scrollTo(
        0,
        window.scrollY + form.getBoundingClientRect().top - 80,
      );
    });
    await nextFrames(page);
    expect(await underChrome(page, publish), "Publish, stuck").toEqual([]);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "composer-publish-320-notice.png"),
    });
  });

  test("the owner reads the request as a task and carries it to its end", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(150_000);
    ownerContext = await readerContext(browser, baseURL!);
    const page = await ownerContext.newPage();
    await page.goto(`/auth/sign-in?next=${encodeURIComponent(OWNER_PAGE)}`, {
      waitUntil: "load",
    });
    await signInOnScreen(
      page,
      OWNER_BROWSER_FIXTURE.email,
      OWNER_BROWSER_FIXTURE.password,
    );
    await page.waitForURL(`**${OWNER_PAGE}`, { timeout: 30_000 });

    const card = page.locator(`[data-erasure-request="${requestId}"]`);
    await expect(card).toContainText(`@${member.handle}`);
    await expect(card).toContainText("Почніть розгляд.");
    // The account id and the data-class definitions are diagnostics, folded
    // away.
    await expect(card.locator("details")).toHaveCount(2);
    await expect(card.locator("details[open]")).toHaveCount(0);
    await expect(card.getByText(member.id)).toBeHidden();

    const startReview = card.getByRole("button", { name: "Почати розгляд" });
    await waitForHydration(startReview);
    await startReview.click();
    await page.waitForURL(`**${OWNER_PAGE}?request=${requestId}&result=done`);
    const saved = page.locator('[data-action-outcome="done"]');
    await expect(saved).toContainText("Збережено");
    await expect(saved).toContainText("На розгляді оператора");
    await expect.poll(() => focusedInsideOutcome(page, "done")).toBe(true);

    const reviewing = page.locator(`[data-erasure-request="${requestId}"]`);
    await expect(reviewing).toContainText(
      "Перегляньте попередній звіт нижче й позначте його переглянутим.",
    );
    await reviewing
      .getByRole("button", { name: "Позначити звіт переглянутим" })
      .click();
    await page.waitForURL(`**${OWNER_PAGE}?request=${requestId}&result=done`);
    const decided = page.locator(`[data-erasure-request="${requestId}"]`);
    await expect(decided).toContainText("Сотріть дані");
    // What erasing covers, from the preview, before anything is pressed.
    await expect(decided.locator("[data-erasure-scope]")).toContainText(
      "простори: 1, живі об'єкти: 1, записи: 1",
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "erasure-owner-decide-1280.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "erasure-owner-decide-uk-1280");
    await page.setViewportSize({ width: 320, height: 900 });
    await expectNoSidewaysScroll(page, "owner decide 320");
    await scanAccessibility(page, testInfo, "erasure-owner-decide-uk-320");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "erasure-owner-decide-320.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    // A mistyped phrase erases nothing, and says so.
    const phrase = decided.locator('input[name="maintainerApprovalText"]');
    await phrase.fill("APPROVE");
    const erase = decided.locator(
      `[data-confirm-submit="erasure-execute-${requestId}"]`,
    );
    await waitForHydration(erase);
    await erase.click();
    const dialog = page.locator(
      `[data-confirm-submit-dialog="erasure-execute-${requestId}"]`,
    );
    await expect(dialog).toContainText("записи: 1");
    await dialog.locator('button[type="submit"]').click();
    await page.waitForURL(
      `**${OWNER_PAGE}?request=${requestId}&result=approval`,
    );
    await expect(
      page.locator('[data-action-outcome="approval"]'),
    ).toContainText("Нічого не стерто");
    const untouched = await pool.query<{ status: string; users: number }>(
      `select status,
              (select count(*)::int from "user" where id = $2::uuid) as users
         from erasure_requests where id = $1::uuid`,
      [requestId, member.id],
    );
    expect(untouched.rows[0]).toEqual({ status: "reviewing", users: 1 });

    // The phrase as shown: the account is erased, and the state is honest.
    const card2 = page.locator(`[data-erasure-request="${requestId}"]`);
    const expected = `APPROVE request-${requestId.replaceAll("-", "").slice(-8)} IRREVERSIBLE ERASURE`;
    await card2.locator('input[name="maintainerApprovalText"]').fill(expected);
    await card2
      .locator(`[data-confirm-submit="erasure-execute-${requestId}"]`)
      .click();
    await page
      .locator(
        `[data-confirm-submit-dialog="erasure-execute-${requestId}"] button[type="submit"]`,
      )
      .click();
    await page.waitForURL(`**${OWNER_PAGE}?request=${requestId}&result=done`, {
      timeout: 60_000,
    });
    const erased = await pool.query<{
      status: string;
      handled_status: string;
      requester_user_id: string;
      users: number;
    }>(
      `select status, handled_status, requester_user_id::text,
              (select count(*)::int from "user" where id = $2::uuid) as users
         from erasure_requests where id = $1::uuid`,
      [requestId, member.id],
    );
    const row = erased.rows[0]!;
    erasedSubjectIds.push(row.requester_user_id);
    expect(row.status).toBe("handled");
    expect(["completed", "cleanup_pending"]).toContain(row.handled_status);
    expect(row.users).toBe(0);
    const finalCard = page.locator(`[data-erasure-request="${requestId}"]`);
    await expect(finalCard).toHaveAttribute(
      "data-erasure-request-state",
      row.handled_status,
    );
    await expect(finalCard).toContainText("уже стерто");
    if (row.handled_status === "cleanup_pending") {
      await expect(finalCard).toContainText("Продовжити очищення");
    } else {
      await expect(finalCard).toContainText("Нічого робити не треба.");
    }
  });

  test("a stalled cleanup can be resumed, and is completed only once nothing is owed", async () => {
    test.setTimeout(90_000);
    const stalled = randomUUID();
    const subject = randomUUID();
    requestIds.push(stalled);
    erasedSubjectIds.push(subject);
    await pool.query(
      `insert into erasure_requests
         (id, requester_user_id, status, handled_status, handled_at,
          dry_run_reviewed_at, submitted_at)
       values ($1::uuid, $2::uuid, 'handled', 'cleanup_pending', now(), now(),
               now() - interval '1 day')`,
      [stalled, subject],
    );
    const page = await ownerContext.newPage();
    await page.goto(OWNER_PAGE, { waitUntil: "load" });
    const card = page.locator(`[data-erasure-request="${stalled}"]`);
    await expect(card).toHaveAttribute(
      "data-erasure-request-state",
      "cleanup_pending",
    );
    await expect(card).toContainText(
      "очищення фото й пошуку ще не підтверджене",
    );
    const expected = `APPROVE request-${stalled.replaceAll("-", "").slice(-8)} IRREVERSIBLE ERASURE`;
    await card.locator('input[name="maintainerApprovalText"]').fill(expected);
    const resume = card.getByRole("button", { name: "Продовжити очищення" });
    await waitForHydration(resume);
    await resume.click();
    await page.waitForURL(`**${OWNER_PAGE}?request=${stalled}&result=done`);
    // Nothing was owed for this request, so it converges — and only then is
    // it completed.
    const after = await pool.query<{ handled_status: string }>(
      `select handled_status from erasure_requests where id = $1::uuid`,
      [stalled],
    );
    expect(after.rows[0]!.handled_status).toBe("completed");
    await expect(page.locator('[data-action-outcome="done"]')).toContainText(
      "Виконано",
    );
    await page.close();
  });

  test("axe finds nothing on the erasure pages and the privacy pages, in UK, BG and RU at 320 and 1280 px", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(300_000);
    const pages: Array<[string, BrowserContext | null, string]> = [
      ["owner", ownerContext, OWNER_PAGE],
      ["privacy", null, "/privacy"],
      ["support", null, "/support"],
      ["terms", null, "/terms"],
      ["cookies", null, "/cookies"],
      ["erasure", null, "/erasure"],
    ];
    for (const locale of ["uk", "bg", "ru"] as const) {
      for (const width of [320, 1280] as const) {
        for (const [label, signedIn, address] of pages) {
          // A reader who has not answered: the notice is on the page, so it
          // is scanned with it, in the page's language.
          const context =
            signedIn ??
            (await readerContext(browser, baseURL!, {
              locale,
              viewport: { width, height: 900 },
              consent: null,
            }));
          if (signedIn) {
            await context.addCookies([
              { name: LOCALE_COOKIE, value: locale, url: baseURL! },
            ]);
          }
          const page = await context.newPage();
          await page.setViewportSize({ width, height: 900 });
          await page.goto(
            locale === "uk" || signedIn || address === "/erasure"
              ? address
              : `/${locale}${address}`,
            { waitUntil: "load" },
          );
          await expect(page.locator("h1").first()).toBeVisible();
          if (signedIn) {
            // The requests stream in beneath the heading: scan them, not
            // their skeleton.
            await expect(
              page.locator("[data-erasure-request]").first(),
            ).toBeVisible();
          } else {
            await expect(page.locator(`${NOTICE}:visible`)).toHaveCount(1);
          }
          await expectNoSidewaysScroll(page, `${label} ${locale} ${width}`);
          await scanAccessibility(
            page,
            testInfo,
            `${label}-${locale}-${width}`,
          );
          if (width === 320 && locale !== "uk") {
            await page.screenshot({
              path: path.join(SCREENSHOTS, `${label}-${locale}-320.png`),
              fullPage: true,
            });
          }
          await page.close();
        }
      }
    }
    await ownerContext.addCookies([
      { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
    ]);
  });
});
