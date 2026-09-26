import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "playwright/test";
import { Pool } from "pg";

import { buildAtomicTextJournalCreateRequest } from "../scripts/atomic-journal-text-request";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analytics-routes";
import { LEGAL_BUNDLE_VERSION } from "../src/lib/legal/legal-documents";
import { META_MARKETING_CONSENT_STORAGE_KEY } from "../src/lib/meta-marketing/events";
import { postPastRateLimit } from "./helpers/auth-rate-limit";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
} from "./helpers/synthetic-gardener";

/**
 * The one acceptance of the terms, the privacy policy and the cookie rules
 * (ADR-0038 D2 and D4, `OVE-526`), against a production build:
 *
 *   * the email sign-up refuses without its box and writes the receipt with
 *     the account;
 *   * an account without a receipt — a Google sign-in, or an account from
 *     before the documents — meets the acceptance screen before «Мій сад»,
 *     and every write it tries is refused on the server;
 *   * accepting records the receipt once and the cookie switches the reader
 *     moved, never more; declining signs out and deletes only a just-created
 *     account;
 *   * a changed version asks once more; the composer has no first-publication
 *     step left.
 */

const PREFIX = "ove526";
/**
 * `LEGAL_PROOF_SCREENSHOTS=1` writes the screens beside the Threads
 * references in `docs/proof/legal-acceptance/`; an ordinary run writes
 * nothing into the repository.
 */
const PROOF_DIRECTORY = process.env.LEGAL_PROOF_SCREENSHOTS
  ? path.join(process.cwd(), "..", "..", "docs", "proof", "legal-acceptance")
  : null;

async function proof(page: Page, name: string) {
  if (!PROOF_DIRECTORY) return;
  mkdirSync(PROOF_DIRECTORY, { recursive: true });
  await page.screenshot({
    path: path.join(PROOF_DIRECTORY, `${name}.png`),
    fullPage: true,
  });
}
const ANALYTICS_KEY = ANALYTICS_CONSENT_STORAGE_KEY;
const MARKETING_KEY = META_MARKETING_CONSENT_STORAGE_KEY;
const LOCALE_COOKIE = "overgarden_interface_locale";

let pool: Pool;
let passwordHash: Promise<string> | undefined;
const accounts: string[] = [];

test.beforeAll(() => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
});

test.afterAll(async () => {
  for (const id of accounts) {
    await pool.query("delete from spaces where owner_user_id = $1::uuid", [id]);
    await pool.query(
      "delete from journal_entries where owner_user_id = $1::uuid",
      [id],
    );
    await pool.query(
      "delete from plant_objects where owner_user_id = $1::uuid",
      [id],
    );
    await removeSyntheticGardener(pool, id);
  }
  await pool.end();
});

interface Account {
  id: string;
  email: string;
}

/**
 * An account as a Google sign-in leaves it, or as it stood before the
 * documents existed: signed in, with no receipt unless one is named.
 */
async function createAccount(
  options: { createdAt?: string; receipt?: string } = {},
): Promise<Account> {
  passwordHash ??= hashPassword(SYNTHETIC_GARDENER_PASSWORD);
  const id = randomUUID();
  const email = `${PREFIX}-${id}@example.test`;
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, coalesce($4::timestamptz, now()), now())`,
    [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME, options.createdAt ?? null],
  );
  accounts.push(id);
  await pool.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
    [randomUUID(), id, await passwordHash],
  );
  if (options.receipt) {
    await pool.query(
      `insert into legal_acceptances (owner_user_id, bundle_version, source)
       values ($1::uuid, $2::text, 'acceptance_screen')`,
      [id, options.receipt],
    );
  }
  return { id, email };
}

async function signIn(
  context: BrowserContext,
  baseURL: string,
  account: Account,
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL },
  ]);
  const { response, statuses } = await postPastRateLimit(() =>
    context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin: baseURL },
      data: { email: account.email, password: SYNTHETIC_GARDENER_PASSWORD },
    }),
  );
  expect(response.ok(), `sign-in answered ${statuses.join(", ")}`).toBe(true);
}

async function receipts(ownerUserId: string) {
  return (
    await pool.query<{ bundle_version: string; source: string }>(
      `select bundle_version, source from legal_acceptances
       where owner_user_id = $1::uuid order by accepted_at`,
      [ownerUserId],
    )
  ).rows;
}

function createSpace(request: APIRequestContext, baseURL: string) {
  return request.post(`${baseURL}/api/garden/spaces`, {
    headers: { origin: baseURL },
    data: {
      requestId: randomUUID(),
      displayName: `Сад ${PREFIX} ${randomUUID().slice(0, 6)}`,
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
  });
}

function publishText(
  request: APIRequestContext,
  baseURL: string,
  ownerUserId: string,
) {
  return request.post(`${baseURL}/api/garden/entries`, {
    headers: {
      origin: baseURL,
      "x-overgarden-owner-user-id": ownerUserId,
      [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]: ATOMIC_JOURNAL_CREATE_PROTOCOL,
    },
    data: buildAtomicTextJournalCreateRequest({
      publishId: randomUUID(),
      context: {
        target: "first_plant_entry",
        plantName: `Томат ${PREFIX}`,
        spaceName: `Город ${PREFIX}`,
        entryDate: "2026-09-26",
      },
      title: "Перші квіти",
      text: "Нижня китиця зацвіла.",
    }),
  });
}

test("the email sign-up refuses without its box, and writes the receipt with the account", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  // Whoever calls the endpoint: no box, no account.
  const refusedEmail = `${PREFIX}-refused-${randomUUID()}@example.test`;
  const { response: refused } = await postPastRateLimit(() =>
    request.post(`${baseURL}/api/auth/sign-up/email`, {
      headers: { origin: baseURL! },
      data: {
        email: refusedEmail,
        password: SYNTHETIC_GARDENER_PASSWORD,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    }),
  );
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({
    code: "LEGAL_ACCEPTANCE_REQUIRED",
  });
  expect(
    (await pool.query('select 1 from "user" where email = $1', [refusedEmail]))
      .rowCount,
  ).toBe(0);

  // The screen: the box is unticked and required, so the form does not go.
  const email = `${PREFIX}-form-${randomUUID()}@example.test`;
  await page.goto("/auth/sign-up", { waitUntil: "load" });
  const box = page.locator('input[name="legalAccepted"]');
  await waitForHydration(box);
  await expect(box).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await proof(page, "sign-up-390");
  await page.locator('input[name="email"]').fill(email);
  await page
    .locator('input[name="password"]')
    .fill(SYNTHETIC_GARDENER_PASSWORD);
  await page.getByRole("button", { name: "Створити акаунт" }).click();
  expect(
    await box.evaluate((node: HTMLInputElement) => node.validity.valueMissing),
  ).toBe(true);
  expect(
    (await pool.query('select 1 from "user" where email = $1', [email]))
      .rowCount,
  ).toBe(0);

  // Ticked, it goes, and the account carries its receipt from the start.
  await box.check();
  await page.getByRole("button", { name: "Створити акаунт" }).click();
  await expect
    .poll(
      async () =>
        (
          await pool.query<{ id: string }>(
            'select id::text as id from "user" where email = $1',
            [email],
          )
        ).rows[0]?.id ?? null,
      { timeout: 30_000 },
    )
    .not.toBeNull();
  const created = (
    await pool.query<{ id: string }>(
      'select id::text as id from "user" where email = $1',
      [email],
    )
  ).rows[0]!.id;
  accounts.push(created);
  await expect
    .poll(() => receipts(created))
    .toEqual([{ bundle_version: LEGAL_BUNDLE_VERSION, source: "sign_up" }]);
});

test("an account without a receipt meets the screen before «Мій сад», cannot write, and accepts once", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const account = await createAccount();
  const context = await browser.newContext({ baseURL });
  try {
    await signIn(context, baseURL!, account);

    // The proxy decides, before anything streams.
    const gated = await context.request.get(`${baseURL}/garden`, {
      maxRedirects: 0,
      headers: { accept: "text/html" },
    });
    expect(gated.status()).toBe(307);
    expect(new URL(gated.headers().location!, baseURL).pathname).toBe(
      "/auth/terms",
    );
    expect(
      new URL(gated.headers().location!, baseURL).searchParams.get("next"),
    ).toBe("/garden");

    // Every write is refused on the server, whatever the page shows.
    const space = await createSpace(context.request, baseURL!);
    expect(space.status()).toBe(403);
    expect(await space.json()).toEqual({ code: "legal_acceptance_required" });
    const entry = await publishText(context.request, baseURL!, account.id);
    expect(entry.status()).toBe(403);
    expect(
      (
        await pool.query(
          "select 1 from journal_entries where owner_user_id = $1::uuid",
          [account.id],
        )
      ).rowCount,
    ).toBe(0);
    const staging = await context.request.post(
      `${baseURL}/api/media/staging/sessions`,
      { headers: { origin: baseURL! }, data: {} },
    );
    expect(staging.status()).toBe(403);

    // The screen.
    const page = await context.newPage();
    await page.goto("/garden/spaces/new", { waitUntil: "load" });
    await expect(page).toHaveURL(
      /\/auth\/terms\?next=%2Fgarden%2Fspaces%2Fnew$/u,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Умови використання Overgarden",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Без прийняття акаунт, щойно створений через Google, буде видалено.",
      ),
    ).toBeVisible();
    const analytics = page.locator('[data-cookie-choice="analytics"]');
    const marketing = page.locator('[data-cookie-choice="marketing"]');
    await waitForHydration(analytics);
    await expect(analytics).not.toBeChecked();
    await expect(marketing).not.toBeChecked();
    // The page asks both questions itself: the guest notice does not ask
    // them over it, and keeps no room for itself.
    await expect(
      page.locator("[data-analytics-consent-banner]:visible"),
    ).toHaveCount(0);
    await scanAccessibility(page, testInfo, "legal-acceptance-uk");
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await proof(page, `acceptance-${width}`);
    }

    // One switch moved on; the other left off is recorded as off.
    await analytics.check();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_KEY),
    ).toBe("accepted");
    await page.getByRole("button", { name: "Прийняти" }).click();
    await page.waitForURL(/\/garden\/spaces\/new$/u);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), MARKETING_KEY),
    ).toBe("declined");
    expect(await receipts(account.id)).toEqual([
      { bundle_version: LEGAL_BUNDLE_VERSION, source: "acceptance_screen" },
    ]);

    // Asked once: the screen now sends the account onward, and writes go.
    const again = await context.request.get(
      `${baseURL}/auth/terms?next=%2Fgarden`,
      { maxRedirects: 0, headers: { accept: "text/html" } },
    );
    expect(again.status()).toBe(307);
    expect(new URL(again.headers().location!, baseURL).pathname).toBe(
      "/garden",
    );
    expect((await createSpace(context.request, baseURL!)).status()).toBe(201);
  } finally {
    await context.close();
  }
});

test("declining deletes a just-created account and signs it out; an older one keeps everything", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const fresh = await createAccount();
  const older = await createAccount({ createdAt: "2026-03-01T09:00:00Z" });
  await pool.query(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)`,
    [older.id, `Старий сад ${PREFIX}`],
  );

  for (const [account, deletes] of [
    [fresh, true],
    [older, false],
  ] as const) {
    const context = await browser.newContext({ baseURL });
    try {
      await signIn(context, baseURL!, account);
      const page = await context.newPage();
      await page.goto("/garden", { waitUntil: "load" });
      await expect(page).toHaveURL(/\/auth\/terms/u);
      const decline = page.getByRole("button", { name: "Не приймаю" });
      await waitForHydration(decline);
      await decline.click();
      await page.waitForURL((url) => url.pathname === "/");
      const session = await context.request.get(
        `${baseURL}/api/auth/get-session`,
      );
      expect(await session.json()).toBeNull();
      const row = await pool.query('select 1 from "user" where id = $1::uuid', [
        account.id,
      ]);
      expect(row.rowCount, deletes ? "deleted" : "kept").toBe(deletes ? 0 : 1);
      expect(await receipts(account.id)).toEqual([]);
    } finally {
      await context.close();
    }
  }
  expect(
    (
      await pool.query("select 1 from spaces where owner_user_id = $1::uuid", [
        older.id,
      ])
    ).rowCount,
  ).toBe(1);
});

test("a changed version asks once more, as a change, and never for a reader", async ({
  browser,
  baseURL,
}) => {
  const account = await createAccount({ receipt: "legal-2026-01-01" });
  const context = await browser.newContext({ baseURL });
  try {
    await signIn(context, baseURL!, account);
    const page = await context.newPage();
    await page.goto("/garden", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Ми оновили умови" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await proof(page, "acceptance-updated-390");
    // An older account that declines keeps its data.
    await expect(
      page.getByText("Без прийняття ви вийдете з акаунта."),
    ).toBeVisible();
    // Public pages stay readable without accepting anything.
    const home = await context.request.get(`${baseURL}/`, {
      maxRedirects: 0,
      headers: { accept: "text/html" },
    });
    expect(home.status()).toBe(200);
  } finally {
    await context.close();
  }
  // And a guest is never asked: the workspace offers sign-in, as it did.
  const guest = await browser.newContext({ baseURL });
  try {
    const gardenForGuest = await guest.request.get(`${baseURL}/garden`, {
      maxRedirects: 0,
      headers: { accept: "text/html" },
    });
    expect(gardenForGuest.headers().location ?? "").not.toContain(
      "/auth/terms",
    );
  } finally {
    await guest.close();
  }
});

test("the screen accepts without JavaScript", async ({ browser, baseURL }) => {
  const account = await createAccount();
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    await signIn(context, baseURL!, account);
    const page = await context.newPage();
    await page.goto("/auth/terms?next=%2Fgarden%2Fnew", { waitUntil: "load" });
    const form = page.locator('form[data-legal-acceptance-form="accept"]');
    await expect(form).toHaveCount(1);
    expect(await form.getAttribute("action")).not.toContain("javascript:");
    expect((await form.getAttribute("method"))?.toLowerCase()).toBe("post");
    await Promise.all([
      page.waitForURL(/\/garden\/new$/u),
      page.evaluate(() =>
        document
          .querySelector<HTMLFormElement>(
            'form[data-legal-acceptance-form="accept"]',
          )!
          .submit(),
      ),
    ]);
    expect(await receipts(account.id)).toEqual([
      { bundle_version: LEGAL_BUNDLE_VERSION, source: "acceptance_screen" },
    ]);
  } finally {
    await context.close();
  }
});

test("the composer asks nothing before publishing", async ({
  browser,
  baseURL,
}) => {
  const account = await createAccount({ receipt: LEGAL_BUNDLE_VERSION });
  const context = await browser.newContext({ baseURL });
  try {
    await signIn(context, baseURL!, account);
    // Something to write about: the composer opens on a plant of this garden.
    const space = await pool.query<{ id: string }>(
      `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
       returning id::text as id`,
      [account.id, `Город ${PREFIX}`],
    );
    const plant = await pool.query<{ id: string }>(
      `insert into plant_objects
         (owner_user_id, space_id, display_name, object_kind, variety_state)
       values ($1::uuid, $2::uuid, $3, 'plant', 'unknown')
       returning id::text as id`,
      [account.id, space.rows[0]!.id, `Томат ${PREFIX}`],
    );
    const page = await context.newPage();
    await page.goto(`/garden/new?object=${plant.rows[0]!.id}`, {
      waitUntil: "load",
    });
    await expect(page.locator('[data-entry-composer="true"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator('input[name="publicationDisclosureAccepted"]'),
    ).toHaveCount(0);
    const published = await publishText(context.request, baseURL!, account.id);
    expect(published.status(), await published.text()).toBe(200);
    // The retired first-publication receipt is neither needed nor written.
    expect(
      (
        await pool.query(
          "select 1 from publication_disclosure_acceptances where owner_user_id = $1::uuid",
          [account.id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await context.close();
  }
});
