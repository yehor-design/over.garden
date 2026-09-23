import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Pool, type PoolClient } from "pg";
import { chromium, type Page } from "playwright";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { OWNER_BROWSER_FIXTURE } from "../tests/helpers/owner-fixture";

/**
 * OVE-500: the owner's moderation pages when their one read fails.
 *
 *   pnpm build && OVERGARDEN_ADMIN_OWNER_USER_ID=<fixture id> \
 *     pnpm exec next start -p 3179          # against a LOCAL database
 *   pnpm prove:community-moderation-partial-failure \
 *     --base-url http://localhost:3179 [--out <dir>]
 *
 * The faults are real, not mocks. A second connection holds an ACCESS
 * EXCLUSIVE lock on the table a page reads:
 *
 * - `community_contribution_reports`, which the communities list (its open
 *   counts) and a community's queue read;
 * - `engagement_comment_reports`, which the comment queue reads.
 *
 * Each page is a **hard load** — the case a postponed boundary can leave on
 * its skeleton for ever (ADR-0023). The proof is that it answers 200 with its
 * frame and its section tabs, a failure it names and a retry of the same
 * view, and no skeleton; and that after the lock goes, the retry shows the
 * report it could not read.
 *
 * Not in the browser gate on purpose: the gate runs two workers, and a lock on
 * a shared table would stall whatever the other worker is reading. Run it
 * alone. It refuses a database that is not on loopback, and everything it
 * writes is removed at the end.
 */

interface PageReceipt {
  path: string;
  hardLoadStatus: number | null;
  failure: string | null;
  retryHref: string | null;
  frameTitle: string | null;
  tabsDuringFailure: number;
  skeletonLeft: boolean;
  reportAfterRetry: boolean;
}

interface Receipt {
  issue: "OVE-500";
  proof: "community-moderation-partial-failure";
  baseUrl: string;
  pages: PageReceipt[];
  elapsedMs: number;
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

async function user(pool: Pool, prefix: string) {
  const id = randomUUID();
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, `${prefix}-${id}@example.test`, PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  return id;
}

async function prove(
  page: Page,
  pool: Pool,
  baseUrl: string,
  pagePath: string,
  table: string,
  reportMarker: string,
): Promise<PageReceipt> {
  let status: number | null = null;
  const lock = await lockTable(pool, table);
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
    (await page.locator("main h1").first().textContent())?.trim() ?? null;
  const tabsDuringFailure = await page
    .locator('[data-moderation-tabs="true"] a')
    .count();
  const skeletonLeft =
    (await page.locator('[data-workspace-state="loading"]:visible').count()) >
    0;
  await Promise.all([page.waitForLoadState("load"), retry.click()]);
  const reportAfterRetry = await page
    .locator(reportMarker)
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
    tabsDuringFailure,
    skeletonLeft,
    reportAfterRetry,
  };
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
  const slug = `ove500p-${randomUUID().slice(0, 8)}`;
  const users: string[] = [];
  let communityId: string | null = null;
  let commentId: string | null = null;

  try {
    const created = await pool.query<{ id: string }>(
      `insert into communities (slug, content_key, journal_topic_id,
                                lifecycle_state, participation_state)
       select $1::text, 'observation-and-care', journal_topic_id, 'active', 'open'
         from communities where slug = 'observation-and-care'
       returning id::text id`,
      [slug],
    );
    communityId = created.rows[0]!.id;
    const writer = await user(pool, "ove500p-writer");
    const reader = await user(pool, "ove500p-reader");
    users.push(writer, reader);
    for (const id of users) {
      await pool.query(
        `insert into community_memberships (community_id, user_id, membership_state)
         values ($1::uuid, $2::uuid, 'active')`,
        [communityId, id],
      );
    }
    const space = await pool.query<{ id: string }>(
      `insert into spaces (owner_user_id, display_name) values ($1::uuid, 'Город')
       returning id::text id`,
      [writer],
    );
    const object = await pool.query<{ id: string }>(
      `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
       values ($1::uuid, $2::uuid, 'Томат', 'plant') returning id::text id`,
      [writer, space.rows[0]!.id],
    );
    const entry = await pool.query<{ id: string }>(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, title, body,
          client_mutation_id, public_slug, published_at, entry_date,
          source_language, visibility, lifecycle_state, content_class,
          entry_scope)
       values ($1::uuid, $2::uuid, $3::uuid, 'Томат після зливи',
               'Листя тримається, плям немає.', $4, $5, now(), current_date,
               'uk', 'public', 'active', 'real_ugc', 'object')
       returning id::text id`,
      [
        writer,
        space.rows[0]!.id,
        object.rows[0]!.id,
        randomUUID(),
        `${slug}-entry`,
      ],
    );
    const contribution = await pool.query<{ id: string }>(
      `insert into community_contributions
         (community_id, contributor_user_id, journal_entry_id,
          contribution_state, discussion_state)
       values ($1::uuid, $2::uuid, $3::uuid, 'active', 'open')
       returning id::text id`,
      [communityId, writer, entry.rows[0]!.id],
    );
    const report = await pool.query<{ id: string }>(
      `insert into community_contribution_reports
         (contribution_id, reporter_user_id, report_reason, report_state)
       values ($1::uuid, $2::uuid, 'spam', 'submitted') returning id::text id`,
      [contribution.rows[0]!.id, reader],
    );
    const comment = await pool.query<{ id: string }>(
      `insert into engagement_comments
         (author_user_id, body, client_mutation_id, comment_state,
          target_kind, target_ref)
       values ($1::uuid, 'Купуйте насіння за посиланням', $2, 'active',
               'community_contribution', $3::text)
       returning id::text id`,
      [writer, randomUUID(), contribution.rows[0]!.id],
    );
    commentId = comment.rows[0]!.id;
    const commentReport = await pool.query<{ id: string }>(
      `insert into engagement_comment_reports
         (reporter_user_id, comment_id, report_reason, report_state)
       values ($1::uuid, $2::uuid, 'spam', 'submitted') returning id::text id`,
      [reader, commentId],
    );

    const context = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseUrl },
    ]);
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
        `the owner fixture could not sign in (${signIn.status()})`,
      );
    }
    mkdirSync(out, { recursive: true });
    const page = await context.newPage();

    const pages = [
      await prove(
        page,
        pool,
        baseUrl,
        "/account/communities",
        "community_contribution_reports",
        `[data-moderated-community="${slug}"]`,
      ),
      await prove(
        page,
        pool,
        baseUrl,
        `/account/communities/${slug}`,
        "community_contribution_reports",
        `[data-moderation-report="${report.rows[0]!.id}"]`,
      ),
      await prove(
        page,
        pool,
        baseUrl,
        "/account/moderation/comments",
        "engagement_comment_reports",
        `[data-moderation-report="${commentReport.rows[0]!.id}"]`,
      ),
    ];
    await page.goto(`${baseUrl}/account/communities/${slug}`);
    await page.screenshot({
      path: path.join(out, "community-moderation-after-retry-1440.png"),
      fullPage: true,
    });

    const receipt: Receipt = {
      issue: "OVE-500",
      proof: "community-moderation-partial-failure",
      baseUrl,
      pages,
      elapsedMs: Math.round(performance.now() - started),
      passed: pages.every(
        (entry) =>
          entry.hardLoadStatus === 200 &&
          entry.failure !== null &&
          entry.retryHref !== null &&
          entry.frameTitle !== null &&
          entry.tabsDuringFailure >= 2 &&
          !entry.skeletonLeft &&
          entry.reportAfterRetry,
      ),
    };
    writeFileSync(
      path.join(out, "community-moderation-partial-failure-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    if (commentId) {
      await pool.query(
        "delete from engagement_comment_reports where comment_id = $1::uuid",
        [commentId],
      );
      await pool.query("delete from engagement_comments where id = $1::uuid", [
        commentId,
      ]);
    }
    if (communityId) {
      await pool.query(
        `delete from community_contribution_reports where contribution_id in
           (select id from community_contributions where community_id = $1::uuid)`,
        [communityId],
      );
      await pool.query(
        "delete from community_contributions where community_id = $1::uuid",
        [communityId],
      );
      await pool.query(
        "delete from community_memberships where community_id = $1::uuid",
        [communityId],
      );
      await pool.query("delete from communities where id = $1::uuid", [
        communityId,
      ]);
    }
    for (const id of users) {
      await pool.query("delete from journal_entries where owner_user_id = $1", [
        id,
      ]);
      await pool.query("delete from plant_objects where owner_user_id = $1", [
        id,
      ]);
      await pool.query("delete from spaces where owner_user_id = $1", [id]);
      await pool.query('delete from "user" where id = $1', [id]);
    }
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
