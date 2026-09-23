import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";
import { chromium, type Page } from "playwright";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { removeSyntheticGardener } from "../tests/helpers/synthetic-gardener";

/**
 * OVE-501: Activity, its settings and the garden's count when their read fails.
 *
 *   pnpm build && pnpm exec next start -p 3179   # against a LOCAL database
 *   pnpm prove:notification-activity-failure \
 *     --base-url http://localhost:3179 [--out <dir>]
 *
 * The fault is real, not a mock: a second connection holds an ACCESS
 * EXCLUSIVE lock on `notification_preferences`, which the Activity list, its
 * settings and the garden's unread count all read first. Each page is a
 * **hard load** — the case a postponed boundary can leave on its skeleton for
 * ever (ADR-0023). The proof is that it answers 200 with its frame and title,
 * a failure it names and a retry of the same view, and no skeleton; that the
 * garden's rail says it does not know the count rather than saying nought;
 * and that after the lock goes, the retry shows the reminder it could not
 * read.
 *
 * Not in the browser gate on purpose: the gate runs two workers, and a lock
 * on a shared table would stall whatever the other worker is reading. Run it
 * alone. It refuses a database that is not on loopback, and everything it
 * writes is removed at the end.
 */

const PASSWORD = "OverGarden-local-password-1!";

interface PageReceipt {
  path: string;
  hardLoadStatus: number | null;
  failure: string | null;
  retryHref: string | null;
  frameTitle: string | null;
  skeletonLeft: boolean;
  contentAfterRetry: boolean;
}

interface Receipt {
  issue: "OVE-501";
  proof: "notification-activity-failure";
  baseUrl: string;
  pages: PageReceipt[];
  gardenRailDuringFailure: string | null;
  gardenRailAfter: string | null;
  elapsedMs: number;
  passed: boolean;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function lockPreferences(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("set local lock_timeout = '5s'");
  await client.query(
    "lock table notification_preferences in access exclusive mode",
  );
  return client;
}

async function release(client: PoolClient) {
  await client.query("rollback").catch(() => undefined);
  client.release();
}

async function prove(
  page: Page,
  pool: Pool,
  baseUrl: string,
  pagePath: string,
  contentMarker: string,
): Promise<PageReceipt> {
  let status: number | null = null;
  const lock = await lockPreferences(pool);
  try {
    const response = await page.goto(`${baseUrl}${pagePath}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    status = response?.status() ?? null;
    await page
      .locator("[data-section-failure]")
      .first()
      .waitFor({ timeout: 25_000 });
  } finally {
    await release(lock);
  }
  const failure = await page
    .locator("[data-section-failure]")
    .first()
    .getAttribute("data-section-failure");
  const retry = page.locator("[data-section-failure] a").first();
  const retryHref = await retry.getAttribute("href");
  const frameTitle =
    (
      await page
        .locator('[data-my-social-surface]:not([data-state="loading"]) h1')
        .first()
        .textContent()
    )?.trim() ?? null;
  const skeletonLeft =
    (await page.locator('[data-state="loading"]:visible').count()) > 0;
  await Promise.all([page.waitForLoadState("load"), retry.click()]);
  const contentAfterRetry = await page
    .locator(contentMarker)
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  return {
    path: pagePath,
    hardLoadStatus: status,
    failure,
    retryHref,
    frameTitle,
    skeletonLeft,
    contentAfterRetry,
  };
}

async function railCount(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/garden`, { waitUntil: "load", timeout: 30_000 });
  const link = page.locator(
    '[data-site-shell-context="route-owned"] a[href="/notifications"]',
  );
  await link.waitFor({ timeout: 20_000 });
  return (await link.textContent())?.trim() ?? null;
}

async function main() {
  const baseUrl = option("base-url") ?? "http://localhost:3179";
  const out = option("out") ?? path.join(process.cwd(), "test-results");
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//u.test(databaseUrl)) {
    throw new Error("Refusing: DATABASE_URL is not a loopback database.");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const browser = await chromium.launch({ headless: true });
  const started = performance.now();
  const id = randomUUID();
  const email = `ove501p-${id}@example.test`;
  let created = false;

  try {
    await pool.query(
      `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
       values ($1::uuid, $2::text, true, $3::text, now(), now())`,
      [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME],
    );
    created = true;
    await pool.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
      [randomUUID(), id, await hashPassword(PASSWORD)],
    );
    // One plant never written about: one reminder, one unread event.
    const space = await pool.query<{ id: string }>(
      `insert into spaces (owner_user_id, display_name) values ($1::uuid, 'Балкон')
       returning id::text id`,
      [id],
    );
    await pool.query(
      `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
       values ($1::uuid, $2::uuid, 'Томат', 'plant')`,
      [id, space.rows[0]!.id],
    );

    const context = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseUrl },
      { name: "overgarden_interface_market", value: "ukraine", url: baseUrl },
    ]);
    const signIn = await context.request.post(
      `${baseUrl}/api/auth/sign-in/email`,
      { headers: { origin: baseUrl }, data: { email, password: PASSWORD } },
    );
    if (!signIn.ok()) {
      throw new Error(`the member could not sign in (${signIn.status()})`);
    }
    mkdirSync(out, { recursive: true });
    const page = await context.newPage();

    const pages = [
      await prove(
        page,
        pool,
        baseUrl,
        "/notifications?filter=reminders",
        '[data-notification-row="reminder"]',
      ),
      await prove(
        page,
        pool,
        baseUrl,
        "/notifications/settings",
        '[data-notification-settings="true"]',
      ),
    ];

    const lock = await lockPreferences(pool);
    let gardenRailDuringFailure: string | null = null;
    try {
      gardenRailDuringFailure = await railCount(page, baseUrl);
    } finally {
      await release(lock);
    }
    const gardenRailAfter = await railCount(page, baseUrl);
    await page.goto(`${baseUrl}/notifications?filter=reminders`);
    await page.screenshot({
      path: path.join(out, "activity-after-retry-1440.png"),
      fullPage: true,
    });

    const receipt: Receipt = {
      issue: "OVE-501",
      proof: "notification-activity-failure",
      baseUrl,
      pages,
      gardenRailDuringFailure,
      gardenRailAfter,
      elapsedMs: Math.round(performance.now() - started),
      passed:
        pages.every(
          (entry) =>
            entry.hardLoadStatus === 200 &&
            entry.failure !== null &&
            entry.retryHref !== null &&
            entry.frameTitle !== null &&
            !entry.skeletonLeft &&
            entry.contentAfterRetry,
        ) &&
        // A count it could not read is a dash, never a nought or a number.
        gardenRailDuringFailure === "Події—" &&
        gardenRailAfter === "Події1",
    };
    writeFileSync(
      path.join(out, "notification-activity-failure-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    if (created) {
      for (const table of ["plant_objects", "spaces"]) {
        await pool.query(`delete from ${table} where owner_user_id = $1`, [id]);
      }
      await removeSyntheticGardener(pool, id);
    }
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
