import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import { chromium } from "playwright";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

/**
 * OVE-489: one group of My garden fails, the other still lists what it holds.
 *
 *   pnpm build && pnpm exec next start -p 3179    # against a LOCAL database
 *   pnpm prove:garden-collection-partial-failure \
 *     --base-url http://localhost:3179 [--out <dir>]
 *
 * The fault is real, not a mock: a second connection holds an ACCESS
 * EXCLUSIVE lock on `catalog_items`, which only the plants-and-animals read
 * touches. That read waits out its own statement timeout and settles as
 * `query_timeout`; the spaces read and the context rail never touch the table.
 * The script then releases the lock and presses the group's own retry.
 *
 * It is not in the browser gate on purpose: the gate runs two workers, and a
 * lock on a shared catalogue table would stall whatever the other worker is
 * reading. Run it alone. It refuses a database that is not on loopback, and
 * its gardener is synthetic and removed at the end.
 */

interface Receipt {
  issue: "OVE-489";
  proof: "garden-collection-partial-failure";
  baseUrl: string;
  objectsFailure: string | null;
  objectsRetryHref: string | null;
  spacesListedDuringFailure: number;
  setupClaimedDuringFailure: boolean;
  composerOfferedDuringFailure: boolean;
  objectsListedAfterRetry: number;
  hardLoadStatus: number | null;
  elapsedMs: number;
  passed: boolean;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
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
  const email = `ove489-partial-${randomUUID()}@example.test`;
  const password = "OVE489-local-password-1!";
  let userId: string | null = null;
  const started = performance.now();

  try {
    const context = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseUrl },
    ]);
    const signUp = await context.request.post(
      `${baseUrl}/api/auth/sign-up/email`,
      {
        headers: { origin: baseUrl },
        data: { email, password, name: PRIVATE_AUTH_COMPATIBILITY_NAME },
      },
    );
    // Sign-up can answer 500 on a machine without an email provider after the
    // account is written (the verification mail is what fails), so the row is
    // the evidence, as in the gate's synthetic gardener.
    userId =
      (
        await pool.query<{ id: string }>(
          'select id::text as id from "user" where email = $1',
          [email],
        )
      ).rows[0]?.id ?? null;
    if (!userId) {
      throw new Error(
        `the synthetic gardener was not persisted (sign-up ${signUp.status()})`,
      );
    }
    await pool.query('update "user" set "emailVerified" = true where id = $1', [
      userId,
    ]);
    const signIn = await context.request.post(
      `${baseUrl}/api/auth/sign-in/email`,
      { headers: { origin: baseUrl }, data: { email, password } },
    );
    if (!signIn.ok()) throw new Error(`sign-in answered ${signIn.status()}`);

    const spaces = ["Балкон", "Теплиця", "Город"].map((name) => ({
      id: randomUUID(),
      name,
    }));
    await pool.query(
      `insert into spaces (id, owner_user_id, display_name)
       select id, $1::uuid, name from unnest($2::uuid[], $3::text[]) as f(id, name)`,
      [userId, spaces.map((s) => s.id), spaces.map((s) => s.name)],
    );
    await pool.query(
      `insert into plant_objects (owner_user_id, space_id, display_name, object_kind, variety_state)
       select $1::uuid, ($2::uuid[])[1 + (i % 3)], 'Рослина ' || i, 'plant', 'unknown'
       from generate_series(1, 30) as i`,
      [userId, spaces.map((s) => s.id)],
    );

    const page = await context.newPage();
    const lock = await pool.connect();
    let hardLoadStatus: number | null = null;
    try {
      await lock.query("begin");
      await lock.query("set local lock_timeout = '5s'");
      await lock.query("lock table catalog_items in access exclusive mode");
      const response = await page.goto(`${baseUrl}/garden`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      hardLoadStatus = response?.status() ?? null;
      await page
        .locator("#garden-objects[data-section-failure]")
        .waitFor({ timeout: 20_000 });
    } finally {
      await lock.query("rollback").catch(() => undefined);
      lock.release();
    }

    const failure = page.locator("#garden-objects[data-section-failure]");
    const objectsFailure = await failure.getAttribute("data-section-failure");
    const retry = failure.locator("a").first();
    const objectsRetryHref = await retry.getAttribute("href");
    const spacesListedDuringFailure = await page
      .locator('[data-garden-collection-list="space"] > li')
      .count();
    const setupClaimedDuringFailure =
      (await page.locator('[data-garden-setup="true"]').count()) > 0;
    const composerOfferedDuringFailure =
      (await page.locator("#first-entry-composer").count()) > 0;
    mkdirSync(out, { recursive: true });
    await page.screenshot({
      path: path.join(out, "garden-partial-failure-1440.png"),
      fullPage: true,
    });

    await Promise.all([page.waitForLoadState("load"), retry.click()]);
    await page
      .locator('[data-garden-collection-list="object"] > li')
      .first()
      .waitFor({ timeout: 20_000 });
    const objectsListedAfterRetry = await page
      .locator('[data-garden-collection-list="object"] > li')
      .count();
    await page.screenshot({
      path: path.join(out, "garden-partial-failure-retried-1440.png"),
      fullPage: true,
    });

    const receipt: Receipt = {
      issue: "OVE-489",
      proof: "garden-collection-partial-failure",
      baseUrl,
      objectsFailure,
      objectsRetryHref,
      spacesListedDuringFailure,
      setupClaimedDuringFailure,
      composerOfferedDuringFailure,
      objectsListedAfterRetry,
      hardLoadStatus,
      elapsedMs: Math.round(performance.now() - started),
      passed:
        hardLoadStatus === 200 &&
        objectsFailure === "query_timeout" &&
        spacesListedDuringFailure === 3 &&
        !setupClaimedDuringFailure &&
        !composerOfferedDuringFailure &&
        objectsListedAfterRetry === 24,
    };
    writeFileSync(
      path.join(out, "garden-partial-failure-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    if (userId) {
      for (const table of ["journal_entries", "plant_objects", "spaces"]) {
        await pool.query(`delete from ${table} where owner_user_id = $1`, [
          userId,
        ]);
      }
      await pool.query('delete from "user" where id = $1', [userId]);
    }
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
