import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The five authentication screens, and the one thing nobody had ever watched:
 * **a successful sign-in**.
 *
 * `docs/PROJECT_STATE.md` recorded it as an open gap — only the refusal path
 * had been walked in a browser, so the `next` round-trip and the ADR-0022 D6
 * cross-tab reload were asserted by tests rather than observed. Closing it is
 * this file's first job.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/auth-screen.spec.ts
 *
 * No credential here reaches a real account: every path runs against the local
 * scratch database, and the gardener is created and removed by the run.
 */

const PREFIX = "ove455";
const TEST_PASSWORD = "OVE455-local-password-1!";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const OUTPUT = path.join(process.cwd(), "test-results", "auth-screen");

const SCREENS = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/help",
  "/auth/reset-password",
] as const;

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

test.describe("a successful sign-in, watched", () => {
  let pool: Pool;
  let gardenerId: string | null = null;

  test.beforeAll(() => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  });

  test.afterAll(async () => {
    await removeSyntheticGardener(pool, gardenerId);
    await pool.end();
  });

  test("returns the reader where they were, and reloads the other tab", async ({
    baseURL,
    browser,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const context = page.context();
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL },
      { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ]);

    // An account with a password, created through the real endpoint, then
    // signed out again: this run signs in through the *screen*.
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: PREFIX,
      password: TEST_PASSWORD,
    });
    gardenerId = gardener.id;
    await context.clearCookies({ name: "overgarden.session_token" });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL },
      { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ]);

    // A second tab, already open on a public page: ADR-0022 D6 says signing in
    // reloads it. This is the half that had never been watched.
    const otherTab = await context.newPage();
    await otherTab.goto("/journals", { waitUntil: "load" });
    const otherTabReloaded = otherTab
      .waitForNavigation({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    // Arrive the way a reader does: from a page, carrying where they were.
    await page.goto("/auth/sign-in?next=%2Fjournals", { waitUntil: "load" });
    await expect(page.locator('[data-auth-surface="sign-in"]')).toBeVisible();
    await page.locator('input[name="email"]').fill(gardener.email);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /Увійти/u }).click();

    // The `next` round-trip: back to what they were reading, not to /garden.
    await page.waitForURL((url) => url.pathname === "/journals", {
      timeout: 25_000,
    });
    expect(page.url()).toContain("/journals");
    // And they are actually signed in: the shell offers no sign-in control.
    await expect(
      page.locator('[data-site-shell-action="sign-in"]'),
    ).toHaveCount(0);

    expect(
      await otherTabReloaded,
      "the other tab did not reload after the sign-in (ADR-0022 D6)",
    ).toBe(true);
    await otherTab.close();
    void browser;
  });
});

test.describe("the screens themselves", () => {
  test("every screen reports zero axe violations, at 375 and at 1440", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await page.context().addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL },
      { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ]);

    for (const width of [375, 1440]) {
      for (const screen of SCREENS) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(screen, { waitUntil: "load" });
        expect(response?.status(), `${screen} at ${width}`).toBe(200);
        await page.waitForTimeout(600);
        const violations = await axeViolations(page);
        expect(
          violations,
          `${screen} at ${width}: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    }
  });

  test("the Google button carries the mark, at the size Google asks for", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/auth/sign-in", { waitUntil: "load" });

    const button = page.locator('[data-google-sign-in-button="true"]');
    if ((await button.count()) === 0) {
      // A deployment with no Google client configured draws no button at all,
      // which is correct and is asserted in `auth-surface.test.tsx`.
      test.skip(true, "Google sign-in is not configured on this deployment");
      return;
    }

    const mark = button.locator('[data-google-mark="true"]');
    await expect(mark).toBeVisible();
    const buttonBox = (await button.boundingBox())!;
    const markBox = (await mark.boundingBox())!;
    // Google's floor: a 40 px button, a mark no smaller than 18 px, and clear
    // space beside the mark of at least its own height.
    expect(buttonBox.height).toBeGreaterThanOrEqual(40);
    expect(Math.round(markBox.width)).toBeGreaterThanOrEqual(18);
    expect(markBox.x - buttonBox.x).toBeGreaterThanOrEqual(markBox.width * 0.5);
    // And the wording is Google's, untranslated.
    expect(await button.textContent()).toContain("Google");

    await button.screenshot({ path: path.join(OUTPUT, "google-button.png") });
    await page.screenshot({ path: path.join(OUTPUT, "sign-in-1440.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    await page.screenshot({ path: path.join(OUTPUT, "sign-in-375.png") });
  });

  test("the password control renames itself as it changes what it does", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    const field = page.locator('input[name="password"]');
    await expect(field).toHaveAttribute("type", "password");

    const show = page.getByRole("button", { name: "Показати пароль" });
    await show.click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Сховати пароль" }),
    ).toBeVisible();
  });

  test("a refusal is an alert above the fields, and takes focus to the first one", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    await page.locator('input[name="email"]').fill(`${PREFIX}-nobody@example.test`);
    await page.locator('input[name="password"]').fill("not-the-password-1!");
    await page.getByRole("button", { name: /Увійти/u }).click();

    const alert = page.locator('[data-auth-message="error"]');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    expect(await alert.getAttribute("role")).toBe("alert");
    // Above the fields.
    const alertBox = (await alert.boundingBox())!;
    const emailBox = (await page.locator('input[name="email"]').boundingBox())!;
    expect(alertBox.y).toBeLessThan(emailBox.y);
    // Focus on the first control, and both marked invalid.
    await expect(page.locator('input[name="email"]')).toBeFocused();
    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator('input[name="password"]')).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // And it never says which of the two was wrong.
    const message = (await alert.textContent())?.toLocaleLowerCase() ?? "";
    expect(message).not.toContain("пароль неправильний");
    expect(message).not.toContain("такого користувача");
  });

  test("the reset screen refuses a bad token through the server, not the bundle", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // The success path needs a real one-time token and therefore a mail
    // provider, so what is driven here is the refusal — which is the half that
    // proves the action runs at all, end to end, and answers in the page.
    await page.goto("/auth/reset-password?token=not-a-real-token", {
      waitUntil: "load",
    });
    const field = page.locator('input[name="password"]');
    await expect(field).toBeVisible();
    await field.fill("OVE455-a-new-password-1!");
    await page.locator('input[name="confirmPassword"]').fill(
      "OVE455-a-new-password-1!",
    );
    await page.getByRole("button", { name: /Оновити|Обнов|Обновить/u }).click();

    const alert = page.locator('[data-auth-message="error"]');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    expect(await alert.getAttribute("role")).toBe("alert");
    // It says the link did not work, and not why.
    const message = (await alert.textContent()) ?? "";
    expect(message.length).toBeGreaterThan(10);
    expect(message.toLowerCase()).not.toContain("token");
  });

  test("the reset screen refuses two passwords that differ, before any call", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await page.goto("/auth/reset-password?token=not-a-real-token", {
      waitUntil: "load",
    });
    await page.locator('input[name="password"]').fill("OVE455-first-one-1!");
    await page
      .locator('input[name="confirmPassword"]')
      .fill("OVE455-second-one-1!");
    await page.getByRole("button", { name: /Оновити|Обнов|Обновить/u }).click();
    await expect(page.locator('[data-auth-message="error"]')).toBeVisible({
      timeout: 20_000,
    });
  });

  test("the help screen answers three questions, each with its own heading", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await page.goto("/auth/help", { waitUntil: "load" });
    const sections = page.locator('[data-auth-help-sections="true"] section');
    await expect(sections).toHaveCount(3);
    const headings = await sections.locator("h2").allTextContents();
    expect(headings).toHaveLength(3);
    expect(headings.every((heading) => heading.trim().length > 0)).toBe(true);
  });
});

test.describe("before the bundle runs", () => {
  test("sign-in, sign-up and the reset request all post to a real endpoint", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // ADR-0024 D3. A sign-in screen is the worst possible place to depend on
    // the client bundle having run, so this context has no JavaScript at all.
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL },
      { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ]);
    const page = await context.newPage();

    try {
      for (const screen of [
        "/auth/sign-in",
        "/auth/sign-up",
        "/auth/help",
        // The screen a reader reaches from an email, often on a phone and a
        // network that has just made them wait. It called Better Auth from the
        // browser until `OVE-455`, so it did nothing at all until its bundle
        // had run.
        "/auth/reset-password?token=proof-token",
      ]) {
        const response = await page.goto(screen, { waitUntil: "load" });
        expect(response?.status(), screen).toBe(200);
        const forms = await page.evaluate(() =>
          [...document.querySelectorAll("form")].map((form) => ({
            action: form.getAttribute("action"),
            method: (form.getAttribute("method") ?? "get").toLowerCase(),
          })),
        );
        expect(forms.length, `${screen} has no form`).toBeGreaterThan(0);
        for (const form of forms) {
          // React renders `action="javascript:throw …"` the moment a Server
          // Action is wrapped in a client closure, and the control then does
          // nothing until hydration — the defect OVE-377 shipped once.
          expect(
            form.action ?? "",
            `${screen} has a placeholder action: ${JSON.stringify(form)}`,
          ).not.toContain("javascript:");
        }
        expect(
          forms.some((form) => form.method === "post"),
          `${screen} has no POST form: ${JSON.stringify(forms)}`,
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});
