import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Pool, type PoolClient } from "pg";
import { chromium, type BrowserContext } from "playwright";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

/**
 * OVE-503: one section of an account page fails, the rest of it still works.
 *
 *   pnpm build && pnpm exec next start -p 3179    # against a LOCAL database
 *   pnpm prove:account-pages-partial-failure \
 *     --base-url http://localhost:3179 [--out <dir>]
 *
 * The faults are real, not mocks. A second connection holds an ACCESS
 * EXCLUSIVE lock on one table at a time:
 *
 * - `profile_blocks`, which only the settings page's blocked list reads — the
 *   list settles as a failure with its own retry, while the language and the
 *   data sections render beside it; after the lock goes, the retry lists the
 *   blocked profile;
 * - `account`, which only the security page's sign-in methods read — they
 *   settle as a failure, while sign-out stays usable beside them.
 *
 * Each is a **hard load**, the case a postponed boundary can leave on its
 * skeleton for ever (ADR-0023): the proof is that it does not.
 *
 * Not in the browser gate on purpose: the gate runs two workers, and a lock on
 * a shared table would stall whatever the other worker is reading. Run it
 * alone. It refuses a database that is not on loopback, and its gardeners are
 * synthetic and removed at the end.
 */

interface Receipt {
  issue: "OVE-503";
  proof: "account-pages-partial-failure";
  baseUrl: string;
  settings: {
    hardLoadStatus: number | null;
    blockedFailure: string | null;
    languageOfferedDuringFailure: boolean;
    dataLinksDuringFailure: number;
    skeletonLeft: boolean;
    blockedListedAfterRetry: number;
  };
  security: {
    hardLoadStatus: number | null;
    methodsFailure: string | null;
    signOutDuringFailure: boolean;
    skeletonLeft: boolean;
  };
  elapsedMs: number;
  passed: boolean;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function signUp(
  pool: Pool,
  context: BrowserContext,
  baseUrl: string,
  prefix: string,
) {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const password = "OVE503-local-password-1!";
  const response = await context.request.post(
    `${baseUrl}/api/auth/sign-up/email`,
    {
      headers: { origin: baseUrl },
      data: {
        email,
        password,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
        // The sign-up form's ticked box (ADR-0038 D2).
        legalAccepted: true,
      },
    },
  );
  // Sign-up can answer 500 on a machine without an email provider after the
  // account is written; the row is the evidence, as in the gate's fixture.
  const id =
    (
      await pool.query<{ id: string }>(
        'select id::text as id from "user" where email = $1',
        [email],
      )
    ).rows[0]?.id ?? null;
  if (!id) {
    throw new Error(
      `${prefix} was not persisted (sign-up ${response.status()})`,
    );
  }
  await pool.query('update "user" set "emailVerified" = true where id = $1', [
    id,
  ]);
  const signIn = await context.request.post(
    `${baseUrl}/api/auth/sign-in/email`,
    { headers: { origin: baseUrl }, data: { email, password } },
  );
  if (!signIn.ok()) throw new Error(`sign-in answered ${signIn.status()}`);
  return id;
}

async function lockTable(pool: Pool, table: string): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("set local lock_timeout = '5s'");
  await client.query(`lock table ${table} in access exclusive mode`);
  return client;
}

async function release(client: PoolClient) {
  await client.query("rollback").catch(() => undefined);
  client.release();
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
  const users: string[] = [];
  const started = performance.now();

  try {
    const context = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseUrl },
    ]);
    // The blocked gardener signs up in a context of its own; the reader's
    // session is the last one written to `context`.
    const blockedContext = await browser.newContext();
    const blockedId = await signUp(
      pool,
      blockedContext,
      baseUrl,
      "ove503-blocked",
    );
    users.push(blockedId);
    await blockedContext.close();
    const readerId = await signUp(pool, context, baseUrl, "ove503-partial");
    users.push(readerId);
    await pool.query(
      `insert into profile_blocks (blocker_user_id, blocked_user_id, block_state)
       values ($1::uuid, $2::uuid, 'active')`,
      [readerId, blockedId],
    );
    mkdirSync(out, { recursive: true });
    const page = await context.newPage();

    // The settings page with its blocked list unreadable.
    let settingsStatus: number | null = null;
    const blocksLock = await lockTable(pool, "profile_blocks");
    try {
      const response = await page.goto(`${baseUrl}/account/settings`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      settingsStatus = response?.status() ?? null;
      await page
        .locator("#blocked-profiles [data-section-failure]")
        .waitFor({ timeout: 20_000 });
    } finally {
      await release(blocksLock);
    }
    const blockedFailure = await page
      .locator("#blocked-profiles [data-section-failure]")
      .getAttribute("data-section-failure");
    const languageOfferedDuringFailure =
      (await page
        .locator("[data-interface-language-setting] button")
        .count()) === 3;
    const dataLinksDuringFailure = await page
      .locator(
        '#account-data a[href="/privacy"], #account-data a[href="/erasure"]',
      )
      .count();
    const settingsSkeletonLeft =
      (await page.locator('[data-workspace-state="loading"]').count()) > 0;
    await page.screenshot({
      path: path.join(out, "account-settings-partial-failure-1440.png"),
      fullPage: true,
    });
    await Promise.all([
      page.waitForLoadState("load"),
      page
        .locator("#blocked-profiles [data-section-failure] a")
        .first()
        .click(),
    ]);
    await page
      .locator('#blocked-profiles button[aria-label^="Розблокувати"]')
      .first()
      .waitFor({ timeout: 20_000 });
    const blockedListedAfterRetry = await page
      .locator('#blocked-profiles button[aria-label^="Розблокувати"]')
      .count();

    // The security page with its sign-in methods unreadable.
    let securityStatus: number | null = null;
    const accountLock = await lockTable(pool, "public.account");
    try {
      const response = await page.goto(`${baseUrl}/account/security`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      securityStatus = response?.status() ?? null;
      await page
        .locator(
          '#account-methods [data-section-failure], [data-testid="account-method-retry"]',
        )
        .first()
        .waitFor({ timeout: 20_000 });
    } finally {
      await release(accountLock);
    }
    const methodsFailure =
      (await page
        .locator("#account-methods [data-section-failure]")
        .first()
        .getAttribute("data-section-failure")
        .catch(() => null)) ??
      ((await page.locator('[data-testid="account-method-retry"]').count()) > 0
        ? "retry"
        : null);
    const signOutDuringFailure = await page
      .locator('[data-sign-out-control="profile"]')
      .isVisible();
    const securitySkeletonLeft =
      (await page.locator('[data-workspace-state="loading"]').count()) > 0;
    await page.screenshot({
      path: path.join(out, "account-security-partial-failure-1440.png"),
      fullPage: true,
    });

    const receipt: Receipt = {
      issue: "OVE-503",
      proof: "account-pages-partial-failure",
      baseUrl,
      settings: {
        hardLoadStatus: settingsStatus,
        blockedFailure,
        languageOfferedDuringFailure,
        dataLinksDuringFailure,
        skeletonLeft: settingsSkeletonLeft,
        blockedListedAfterRetry,
      },
      security: {
        hardLoadStatus: securityStatus,
        methodsFailure,
        signOutDuringFailure,
        skeletonLeft: securitySkeletonLeft,
      },
      elapsedMs: Math.round(performance.now() - started),
      passed:
        settingsStatus === 200 &&
        blockedFailure === "query_timeout" &&
        languageOfferedDuringFailure &&
        dataLinksDuringFailure === 2 &&
        !settingsSkeletonLeft &&
        blockedListedAfterRetry === 1 &&
        securityStatus === 200 &&
        methodsFailure !== null &&
        signOutDuringFailure &&
        !securitySkeletonLeft,
    };
    writeFileSync(
      path.join(out, "account-pages-partial-failure-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    for (const id of users) {
      await pool.query(
        "delete from profile_blocks where blocker_user_id = $1 or blocked_user_id = $1",
        [id],
      );
      await pool.query('delete from "user" where id = $1', [id]);
    }
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
