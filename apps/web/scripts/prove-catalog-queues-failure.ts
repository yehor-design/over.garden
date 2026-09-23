import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Pool, type PoolClient } from "pg";
import { chromium, type Page } from "playwright";

import { OWNER_BROWSER_FIXTURE } from "../tests/helpers/owner-fixture";

/**
 * OVE-506: the owner's two work queues when one of their reads fails.
 *
 *   pnpm build
 *   OVERGARDEN_ADMIN_OWNER_USER_ID=0ce39100-1ce3-4ce3-8ce3-0ce391000391 \
 *     pnpm exec next start -p 3179            # against a LOCAL database
 *   pnpm owner:seed-browser-fixture             # the sealed owner
 *   pnpm prove:catalog-queues-failure --base-url http://localhost:3179 [--out <dir>]
 *
 * The fault is real, not a mock: a second connection holds an ACCESS
 * EXCLUSIVE lock on one table while a page is **hard-loaded** — the case a
 * postponed boundary can leave on its skeleton for ever (ADR-0023). Three
 * faults, each on a table only one part of a page reads:
 *
 * - `catalog_source_records` — every source's counts. The sources page must
 *   still name every source with its snapshot date and refresh state, the
 *   counts must fail in their own cells with a retry, and the pick figures,
 *   the misses, the precision and the unplaced records must all still read.
 * - `catalog_curation_actions` — the week's automatic decisions. The
 *   decision on screen and the open decisions must still read.
 * - `catalog_curation_queue` — the open decisions. The automatic decisions
 *   must still read.
 *
 * After each lock is released, the failed part's retry shows what it could
 * not read.
 *
 * Not in the browser gate on purpose: the gate runs two workers, and a lock
 * on a shared table would stall whatever the other worker is reading. Run it
 * alone. It refuses a database that is not on loopback. It seeds two sources
 * and one open decision of its own, so the pages have something to fail to
 * count, and removes them at the end.
 */

interface PartReceipt {
  name: string;
  state: "ready" | "failed" | "missing";
}

interface FaultReceipt {
  lockedTable: string;
  path: string;
  hardLoadStatus: number | null;
  failedParts: PartReceipt[];
  readableParts: PartReceipt[];
  failureClasses: string[];
  retryHrefs: string[];
  skeletonLeft: boolean;
  freshnessBesideFailure: boolean | null;
  contentAfterRetry: boolean;
  passed: boolean;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

async function partState(
  page: Page,
  name: string,
  ready: string,
  failed: string,
): Promise<PartReceipt> {
  if ((await page.locator(`${failed}:visible`).count()) > 0) {
    return { name, state: "failed" };
  }
  if ((await page.locator(`${ready}:visible`).count()) > 0) {
    return { name, state: "ready" };
  }
  return { name, state: "missing" };
}

async function proveSources(
  page: Page,
  pool: Pool,
  baseUrl: string,
  out: string,
): Promise<FaultReceipt> {
  const pagePath = "/garden/catalog/sources";
  const table = "catalog_source_records";
  let status: number | null = null;
  const lock = await lockTable(pool, table);
  try {
    const response = await page.goto(`${baseUrl}${pagePath}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    status = response?.status() ?? null;
    await page
      .locator('[data-catalog-source-coverage="failed"]:visible')
      .first()
      .waitFor({ timeout: 25_000 });
    // Every other part has its own deadline; let the slowest settle.
    await page
      .locator(
        "[data-catalog-unplaced-section]:visible, [data-section-failure]:visible",
      )
      .last()
      .waitFor({ timeout: 25_000 });
  } finally {
    await release(lock);
  }
  const rows = page.locator("[data-catalog-source]:visible");
  const rowCount = await rows.count();
  const failedCells = await page
    .locator('[data-catalog-source-coverage="failed"]:visible')
    .count();
  let freshness = rowCount > 0;
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const fetched = await row
      .locator("[data-catalog-source-fetched-at]")
      .count();
    const refresh = await row
      .locator("[data-catalog-source-refresh-status]")
      .count();
    if (fetched === 0 || refresh === 0) freshness = false;
  }
  const failureClasses = await page
    .locator('[data-catalog-source-coverage="failed"]:visible')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute("data-section-failure") ?? ""),
    );
  const retryHrefs = await page
    .locator(
      '[data-catalog-source-coverage="failed"] a[data-workspace-retry]:visible',
    )
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  const readableParts = [
    await partState(
      page,
      "sources",
      "[data-catalog-sources-section]",
      '[aria-labelledby="catalog-sources-heading"] > [data-section-failure]',
    ),
    await partState(
      page,
      "health",
      "[data-catalog-health]",
      '[aria-labelledby="catalog-health-heading"] > [data-section-failure]',
    ),
    await partState(
      page,
      "misses",
      "[data-catalog-health-misses-section]",
      '[aria-labelledby="catalog-misses-heading"] > [data-section-failure]',
    ),
    await partState(
      page,
      "precision",
      "[data-catalog-health-precision-section]",
      '[aria-labelledby="catalog-precision-heading"] > [data-section-failure]',
    ),
    await partState(
      page,
      "unplaced",
      "[data-catalog-unplaced-section]",
      '[aria-labelledby="catalog-unplaced-heading"] > [data-section-failure]',
    ),
  ];
  const skeletonLeft =
    (await page.locator('[data-workspace-section="loading"]:visible').count()) >
    0;
  await page.screenshot({
    path: path.join(out, "sources-counts-failed-1440.png"),
    fullPage: true,
  });

  const retry = page
    .locator(
      '[data-catalog-source-coverage="failed"] a[data-workspace-retry]:visible',
    )
    .first();
  await retry.click();
  const contentAfterRetry = await expectEventually(async () => {
    const failed = await page
      .locator('[data-catalog-source-coverage="failed"]:visible')
      .count();
    const ready = await page
      .locator('[data-catalog-source-coverage="ready"]:visible')
      .count();
    return failed === 0 && ready === rowCount;
  });

  const receipt: Omit<FaultReceipt, "passed"> = {
    lockedTable: table,
    path: pagePath,
    hardLoadStatus: status,
    failedParts: [
      {
        name: `source counts (${failedCells} of ${rowCount})`,
        state: failedCells === rowCount && rowCount > 0 ? "failed" : "missing",
      },
    ],
    readableParts,
    failureClasses: [...new Set(failureClasses)],
    retryHrefs: [...new Set(retryHrefs)],
    skeletonLeft,
    freshnessBesideFailure: freshness,
    contentAfterRetry,
  };
  return {
    ...receipt,
    passed:
      status === 200 &&
      rowCount > 0 &&
      failedCells === rowCount &&
      freshness &&
      readableParts.every((part) => part.state === "ready") &&
      failureClasses.every((failure) => failure === "query_timeout") &&
      // The page itself: an anchor on the same page would only scroll
      // before hydration, and read nothing again.
      retryHrefs.every((href) => href === pagePath) &&
      !skeletonLeft &&
      contentAfterRetry,
  };
}

async function proveQueue(
  page: Page,
  pool: Pool,
  baseUrl: string,
  out: string,
  input: {
    table: string;
    failedName: string;
    failedSelector: string;
    readableName: string;
    readableSelector: string;
    screenshot: string;
  },
): Promise<FaultReceipt> {
  const pagePath = "/garden/catalog/queue";
  let status: number | null = null;
  const lock = await lockTable(pool, input.table);
  try {
    const response = await page.goto(`${baseUrl}${pagePath}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    status = response?.status() ?? null;
    await page
      .locator("[data-section-failure]:visible")
      .first()
      .waitFor({ timeout: 25_000 });
    await page
      .locator(`${input.readableSelector}:visible`)
      .first()
      .waitFor({ timeout: 25_000 });
  } finally {
    await release(lock);
  }
  const failures = page.locator("[data-section-failure]:visible");
  const failureClasses = await failures.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-section-failure") ?? ""),
  );
  const retryHrefs = await page
    .locator("[data-section-failure] a[data-workspace-retry]:visible")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  const failedHere =
    (await page
      .locator(`${input.failedSelector} [data-section-failure]:visible`)
      .count()) > 0;
  const readable: PartReceipt = {
    name: input.readableName,
    state:
      (await page.locator(`${input.readableSelector}:visible`).count()) > 0
        ? "ready"
        : "missing",
  };
  const skeletonLeft =
    (await page.locator('[data-workspace-section="loading"]:visible').count()) >
    0;
  await page.screenshot({
    path: path.join(out, input.screenshot),
    fullPage: true,
  });

  await page
    .locator("[data-section-failure] a[data-workspace-retry]:visible")
    .first()
    .click();
  const contentAfterRetry = await expectEventually(
    async () =>
      (await page.locator("[data-section-failure]:visible").count()) === 0,
  );
  return {
    lockedTable: input.table,
    path: pagePath,
    hardLoadStatus: status,
    failedParts: [
      { name: input.failedName, state: failedHere ? "failed" : "missing" },
    ],
    readableParts: [readable],
    failureClasses: [...new Set(failureClasses)],
    retryHrefs: [...new Set(retryHrefs)],
    skeletonLeft,
    freshnessBesideFailure: null,
    contentAfterRetry,
    passed:
      status === 200 &&
      failedHere &&
      readable.state === "ready" &&
      failureClasses.length === 1 &&
      failureClasses[0] === "query_timeout" &&
      retryHrefs.every((href) => href.startsWith(pagePath)) &&
      !skeletonLeft &&
      contentAfterRetry,
  };
}

async function expectEventually(check: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
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
  const run = randomUUID().slice(0, 8);
  const sourceSlugs = [`ove506-proof-a-${run}`, `ove506-proof-b-${run}`];
  const queueItemId = randomUUID();
  try {
    for (const [index, slug] of sourceSlugs.entries()) {
      const snapshot = randomUUID();
      await pool.query(
        `insert into catalog_source_snapshots (id, source_slug, source_name, source_category,
           source_version, source_url, license, parser_version, payload_sha256,
           fetched_at, verified_at, status)
         values ($1, $2, $3, 'taxonomy', 'ove506-proof', 'https://example.test/source',
                 'CC BY 4.0', 'ove506', $4, now() - interval '2 days', now() - interval '2 days',
                 'imported')`,
        [snapshot, slug, `OVE-506 proof source ${index + 1}`, "0".repeat(64)],
      );
      for (const key of ["one", "two"]) {
        await pool.query(
          `insert into catalog_source_records (source_snapshot_id, source_record_id,
             raw_payload, raw_payload_sha256)
           values ($1, $2, '{}'::jsonb, $3)`,
          [snapshot, `${slug}-${key}`, "a".repeat(64)],
        );
      }
    }
    await pool.query(
      `insert into catalog_curation_queue (id, item_type, subject_label, proposal,
         reasons, impact_score, state)
       values ($1, 'label_link', $2, '{"source_slug":"catalog_search_miss","object_kind":"plant"}'::jsonb,
               array['search_miss'], 1, 'open')`,
      [queueItemId, `ove506-proof ${run}`],
    );

    const context = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseUrl },
      { name: "overgarden_interface_market", value: "ukraine", url: baseUrl },
    ]);
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("overgarden:analytics-consent", "declined");
      } catch {
        // The notice is then simply drawn.
      }
    });
    const signIn = await context.request.post(
      `${baseUrl}/api/auth/sign-in/email`,
      {
        headers: { origin: baseUrl },
        data: {
          email: OWNER_BROWSER_FIXTURE.email,
          password: OWNER_BROWSER_FIXTURE.password,
        },
      },
    );
    if (!signIn.ok()) {
      throw new Error(
        `the sealed owner could not sign in (${signIn.status()})`,
      );
    }
    mkdirSync(out, { recursive: true });

    const faults: FaultReceipt[] = [];
    faults.push(
      await proveSources(await context.newPage(), pool, baseUrl, out),
    );
    faults.push(
      await proveQueue(await context.newPage(), pool, baseUrl, out, {
        table: "catalog_curation_actions",
        failedName: "automatic decisions",
        failedSelector: '[aria-labelledby="catalog-automatic-heading"]',
        readableName: "open decisions",
        readableSelector: "[data-catalog-queue]",
        screenshot: "queue-automatic-failed-1440.png",
      }),
    );
    faults.push(
      await proveQueue(await context.newPage(), pool, baseUrl, out, {
        table: "catalog_curation_queue",
        failedName: "open decisions",
        failedSelector: "main",
        readableName: "automatic decisions",
        readableSelector: "[data-catalog-automatic]",
        screenshot: "queue-decisions-failed-1440.png",
      }),
    );

    const receipt = {
      issue: "OVE-506",
      proof: "catalog-queues-failure",
      baseUrl,
      faults,
      elapsedMs: Math.round(performance.now() - started),
      passed: faults.every((fault) => fault.passed),
    };
    writeFileSync(
      path.join(out, "catalog-queues-failure-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    await pool
      .query(
        "delete from catalog_curation_queue where id = $1::uuid and state = 'open'",
        [queueItemId],
      )
      .catch(() => undefined);
    await pool
      .query(
        "delete from catalog_source_snapshots where source_slug = any($1::text[])",
        [sourceSlugs],
      )
      .catch(() => undefined);
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
