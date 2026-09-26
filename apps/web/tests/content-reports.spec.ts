import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";

import { OWNER_REPORTS_PATH } from "../src/lib/moderation/report-contract";
import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInOwnerFixture } from "./helpers/owner-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";

/**
 * The complaint procedure (ADR-0038 D5, `OVE-526`; DSA Art. 16 and 17),
 * against a production build: a reader without an account reports an entry
 * from its page and is sent a receipt; the owner removes the entry; the
 * author is sent a statement of reasons and the reporter the decision. The
 * letters are read from the outbox, where they wait when no mail provider is
 * configured — a local run and CI have none.
 *
 * Serial: every report here comes from one network address, and the form
 * allows five an hour from one.
 */

const PREFIX = "ove526-report";
const LOCALE_COOKIE = "overgarden_interface_locale";
const PROOF_DIRECTORY = process.env.LEGAL_PROOF_SCREENSHOTS
  ? path.join(process.cwd(), "..", "..", "docs", "proof", "content-reports")
  : null;

test.describe.configure({ mode: "serial" });

let pool: Pool;
let fixture: PublishedEntryFixture | null = null;

async function proof(page: Page, name: string) {
  if (!PROOF_DIRECTORY) return;
  mkdirSync(PROOF_DIRECTORY, { recursive: true });
  await page.screenshot({
    path: path.join(PROOF_DIRECTORY, `${name}.png`),
    fullPage: true,
  });
}

function reporterEmail(label: string) {
  return `${PREFIX}-${label}@example.test`;
}

async function reports() {
  return (
    await pool.query<{
      id: string;
      state: string;
      target_kind: string;
      target_id: string;
      reporter_email: string;
      decision_ground: string | null;
    }>(
      `select id::text, state, target_kind, target_id::text, reporter_email, decision_ground
       from content_reports where reporter_email like $1 order by created_at`,
      [`${PREFIX}-%`],
    )
  ).rows;
}

async function messages(reportId: string) {
  return (
    await pool.query<{
      kind: string;
      recipient_email: string;
      subject: string;
      body_text: string;
      state: string;
    }>(
      `select kind, recipient_email, subject, body_text, state
       from moderation_messages where content_report_id = $1::uuid order by created_at`,
      [reportId],
    )
  ).rows;
}

async function clearReports() {
  await pool.query("delete from content_reports where reporter_email like $1", [
    `${PREFIX}-%`,
  ]);
}

test.beforeAll(async () => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  await clearReports();
  fixture = await seedPublishedEntryFixture(pool, PREFIX, {
    title: "Перші квіти на балконі",
    body: "Нижня китиця зацвіла після тижня тепла.",
  });
});

test.afterAll(async () => {
  await clearReports();
  await cleanupPublishedEntryFixture(pool, fixture);
  await pool.end();
});

async function fillReport(page: Page, label: string) {
  await page
    .getByRole("radio", { name: "Образи, погрози чи цькування" })
    .check();
  await page
    .getByLabel("Що саме не так?")
    .fill("У записі погрози сусідам, це не спостереження за рослиною.");
  await page.getByLabel("Ваше ім'я").fill("Ірина");
  await page.getByLabel("Ваш email").fill(reporterEmail(label));
  await page.getByRole("checkbox", { name: /добросовісно/u }).check();
}

test("a reader without an account reports an entry from its page and is sent a receipt", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
  ]);
  const page = await context.newPage();
  try {
    await page.goto(fixture!.entryPath, { waitUntil: "load" });
    const link = page.locator('[data-report-link="true"]');
    await expect(link).toHaveAttribute(
      "href",
      `/report?address=${encodeURIComponent(fixture!.entryPath)}`,
    );
    await link.click();
    await page.waitForURL(/\/report\?address=/u);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Чому ви скаржитеся на цей запис?",
      }),
    ).toBeVisible();
    await expect(page.getByText("Перші квіти на балконі")).toBeVisible();
    await waitForHydration(
      page.getByRole("button", { name: "Надіслати скаргу" }),
    );
    await scanAccessibility(page, testInfo, "report-form-uk");
    await proof(page, "report-form");

    // Unticked, the good-faith statement stops the form in the browser.
    await fillReport(page, "guest");
    await page.getByRole("checkbox", { name: /добросовісно/u }).uncheck();
    await page.getByRole("button", { name: "Надіслати скаргу" }).click();
    expect(await reports()).toHaveLength(0);

    await page.getByRole("checkbox", { name: /добросовісно/u }).check();
    await page.getByRole("button", { name: "Надіслати скаргу" }).click();
    await expect(
      page.getByRole("heading", { name: "Скаргу отримано" }),
    ).toBeFocused();
    await proof(page, "report-received");

    const [report] = await reports();
    expect(report).toMatchObject({
      state: "received",
      target_kind: "entry",
      target_id: fixture!.entryId,
      reporter_email: reporterEmail("guest"),
    });
    const [receipt] = await messages(report!.id);
    expect(receipt).toMatchObject({
      kind: "report_receipt",
      recipient_email: reporterEmail("guest"),
      subject: "Ми отримали вашу скаргу",
    });
    expect(receipt!.body_text).toContain(fixture!.entryPath);
    expect(receipt!.body_text).toContain("Образи, погрози чи цькування");
    // No mail provider here: the letter waits in the outbox, unsent.
    expect(["pending", "sent"]).toContain(receipt!.state);
  } finally {
    await context.close();
  }
});

test("the form files a report without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
  ]);
  const page = await context.newPage();
  try {
    await page.goto(
      `/report?address=${encodeURIComponent(fixture!.entryPath)}`,
      {
        waitUntil: "load",
      },
    );
    const form = page.locator('form[data-report-form="true"]');
    await expect(form).toHaveCount(1);
    expect(await form.getAttribute("action")).not.toContain("javascript:");
    expect((await form.getAttribute("method"))?.toLowerCase()).toBe("post");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/report"),
      ),
      page.evaluate((email) => {
        const element = document.querySelector<HTMLFormElement>(
          'form[data-report-form="true"]',
        )!;
        element
          .querySelector<HTMLInputElement>(
            'input[name="reason"][value="spam"]',
          )!
          .click();
        element.querySelector<HTMLTextAreaElement>(
          'textarea[name="explanation"]',
        )!.value = "Реклама чужого магазину замість спостереження.";
        element.querySelector<HTMLInputElement>('input[name="name"]')!.value =
          "Олег";
        element.querySelector<HTMLInputElement>('input[name="email"]')!.value =
          email;
        element.querySelector<HTMLInputElement>(
          'input[name="goodFaith"]',
        )!.checked = true;
        element.submit();
      }, reporterEmail("nojs")),
    ]);
    await expect
      .poll(async () => (await reports()).map((row) => row.reporter_email))
      .toContain(reporterEmail("nojs"));
  } finally {
    await context.close();
  }
});

test("the owner removes the entry; the author is sent a statement of reasons, the reporter the decision", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
  ]);
  await signInOwnerFixture({ request: context.request, baseURL: baseURL! });
  const page = await context.newPage();
  try {
    const [guest, noJs] = await reports();
    await page.goto(OWNER_REPORTS_PATH, { waitUntil: "load" });
    const card = page.locator(`[data-content-report="${guest!.id}"]`);
    await expect(card).toContainText(fixture!.entryPath);
    await expect(card).toContainText(reporterEmail("guest"));
    await scanAccessibility(page, testInfo, "content-reports-owner-uk");
    await proof(page, "owner-reports");

    await waitForHydration(
      card.getByRole("button", { name: "Ухвалити рішення" }),
    );
    await card.getByRole("radio", { name: "Видалити запис" }).check();
    await card
      .getByLabel("Факти, які ви врахували")
      .fill("У записі погрози сусідам; це не спостереження за рослиною.");
    await card.getByRole("button", { name: "Ухвалити рішення" }).click();
    await expect(page.locator('[data-report-outcome="done"]')).toBeVisible();

    const decided = (await reports()).find((row) => row.id === guest!.id)!;
    expect(decided).toMatchObject({
      state: "removed",
      decision_ground: "terms-content",
    });
    const entry = await pool.query<{ lifecycle_state: string }>(
      "select lifecycle_state from journal_entries where id = $1::uuid",
      [fixture!.entryId],
    );
    expect(entry.rows[0]?.lifecycle_state).toBe("deleted_retention");
    const gone = await context.request.get(`${baseURL}${fixture!.entryPath}`, {
      maxRedirects: 0,
    });
    expect(gone.status()).not.toBe(200);

    const letters = await messages(guest!.id);
    const decision = letters.find(
      (letter) => letter.kind === "report_decision",
    )!;
    expect(decision.recipient_email).toBe(reporterEmail("guest"));
    expect(decision.body_text).toContain("Рішення: вміст прибрано.");
    expect(decision.body_text).toContain("погрози сусідам");
    const statement = letters.find(
      (letter) => letter.kind === "statement_of_reasons",
    )!;
    const author = await pool.query<{ email: string }>(
      'select email from "user" where id = $1::uuid',
      [fixture!.ownerUserId],
    );
    expect(statement.recipient_email).toBe(author.rows[0]!.email);
    // What was restricted, the facts, the ground, that a person decided, and
    // how to contest it (DSA Art. 17).
    expect(statement.body_text).toContain(fixture!.entryPath);
    expect(statement.body_text).toContain("погрози сусідам");
    expect(statement.body_text).toContain("terms#terms-content");
    expect(statement.body_text).toContain("автоматизація не використовувалася");
    expect(statement.body_text).toMatch(/Оскаржити рішення можна/u);

    // The second report is kept: the reporter is told, the author is not.
    await page.goto(OWNER_REPORTS_PATH, { waitUntil: "load" });
    const second = page.locator(`[data-content-report="${noJs!.id}"]`);
    await waitForHydration(
      second.getByRole("button", { name: "Ухвалити рішення" }),
    );
    await second.getByRole("radio", { name: "Залишити" }).check();
    await second
      .getByLabel("Факти, які ви врахували")
      .fill("Запис уже прибрано за іншою скаргою.");
    await second.getByRole("button", { name: "Ухвалити рішення" }).click();
    await expect(page.locator('[data-report-outcome="done"]')).toBeVisible();
    const kept = await messages(noJs!.id);
    expect(kept.map((letter) => letter.kind).sort()).toEqual([
      "report_decision",
      "report_receipt",
    ]);
    expect(
      kept.find((letter) => letter.kind === "report_decision")!.body_text,
    ).toContain("Рішення: вміст залишено.");
  } finally {
    await context.close();
  }
});

test("one network address may send five reports an hour", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL! },
  ]);
  const page = await context.newPage();
  try {
    // The author's profile is still public; the entry is gone.
    const address = `/@${fixture!.handle}`;
    const already = (await reports()).length;
    for (let sent = already; sent <= 5; sent += 1) {
      await page.goto(`/report?address=${encodeURIComponent(address)}`, {
        waitUntil: "load",
      });
      await waitForHydration(
        page.getByRole("button", { name: "Надіслати скаргу" }),
      );
      await fillReport(page, `limit-${sent}`);
      await page.getByRole("button", { name: "Надіслати скаргу" }).click();
      if (sent < 5) {
        await expect(
          page.getByRole("heading", { name: "Скаргу отримано" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText("Забагато скарг з цієї мережі. Спробуйте за годину."),
        ).toBeVisible();
      }
    }
    expect(await reports()).toHaveLength(5);
  } finally {
    await context.close();
  }
});
