import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
} from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { signInOwnerFixture } from "./helpers/owner-fixture";
import {
  expectReflow,
  scanAccessibility,
  tabToControl,
} from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The owner's moderation (`OVE-500`, criteria 5 and 7–12).
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=community-moderation.spec.ts
 *
 * Every outcome is read back from the database:
 *
 * - **Who may look.** A guest is asked to sign in and an ordinary member is
 *   refused — and neither receives one byte of a report.
 * - **What a moderator decides from.** A report is the entry's title and
 *   opening, its author, what it is about, the reason in words and where the
 *   record stands.
 * - **How a decision is taken.** Removing and banning ask first and name what
 *   they take; Cancel changes nothing; a double press is one change; an
 *   action on a report somebody already decided says nothing changed; the
 *   view the owner was in is the view they come back to.
 * - **A forged form** from a member who may not moderate changes nothing.
 * - **The comment reports** show the comment, and removal asks first.
 * - **A phone and a keyboard** reach all of it, axe-clean.
 *
 * The community is the spec's own, and so are its gardeners; the owner is the
 * sealed fixture every owner spec signs in as (`owner-fixture.ts`).
 */

const PREFIX = "ove500m";
const LOCALE_COOKIE = "overgarden_interface_locale";
const CONSENT_KEY = "overgarden:analytics-consent";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-500",
);
const CONTENT_KEY = "visual-care-across-every-living-object";

interface Fixture {
  communityId: string;
  slug: string;
  writer: SyntheticGardener;
  reader: SyntheticGardener;
  removable: { contributionId: string; reportId: string; title: string };
  kept: { contributionId: string; reportId: string; title: string };
  comment: { id: string; reportId: string; body: string };
}

let pool: Pool;
let fixture: Fixture;
const gardeners: string[] = [];
let passwordHash: Promise<string> | null = null;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
  const slug = `${PREFIX}-${randomUUID().slice(0, 8)}`;
  const created = await pool.query<{ id: string }>(
    `insert into communities (slug, content_key, journal_topic_id,
                              lifecycle_state, participation_state)
     select $1::text, $2::text, journal_topic_id, 'active', 'open'
       from communities where slug = 'observation-and-care'
     returning id::text id`,
    [slug, CONTENT_KEY],
  );
  const communityId = created.rows[0]!.id;
  await pool.query(
    `insert into community_rules (community_id, rule_key, sort_order, rule_state)
     select $1::uuid, rule_key, sort_order, rule_state
       from community_rules
      where community_id = (select id from communities
                             where slug = 'observation-and-care')`,
    [communityId],
  );
  const writer = await account(`${PREFIX}-writer`);
  const reader = await account(`${PREFIX}-reader`);
  for (const gardener of [writer, reader]) {
    await pool.query(
      `insert into community_memberships (community_id, user_id, membership_state)
       values ($1::uuid, $2::uuid, 'active')`,
      [communityId, gardener.id],
    );
  }
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, 'Город')
     returning id::text id`,
    [writer.id],
  );
  const contributions: Array<{
    contributionId: string;
    reportId: string;
    title: string;
  }> = [];
  for (const [index, [title, reason]] of [
    ["Кури почали линяти раніше, ніж торік", "off_topic"],
    ["Жовте листя знизу після холодної ночі", "spam"],
  ].entries()) {
    const object = await pool.query<{ id: string }>(
      `insert into plant_objects (owner_user_id, space_id, display_name, object_kind)
       values ($1::uuid, $2::uuid, $3, $4) returning id::text id`,
      [
        writer.id,
        space.rows[0]!.id,
        index === 0 ? "Кури" : "Томат",
        index === 0 ? "animal" : "plant",
      ],
    );
    const entry = await pool.query<{ id: string }>(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, title, body,
          client_mutation_id, public_slug, published_at, entry_date,
          source_language, visibility, lifecycle_state, content_class,
          entry_scope)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(),
               current_date - $8::int, 'uk', 'public', 'active', 'real_ugc',
               'object')
       returning id::text id`,
      [
        writer.id,
        space.rows[0]!.id,
        object.rows[0]!.id,
        title,
        `${title}: записав, що змінилося і що перевірю завтра.`,
        randomUUID(),
        `${PREFIX}-entry-${randomUUID().slice(0, 8)}`,
        index,
      ],
    );
    const contribution = await pool.query<{ id: string }>(
      `insert into community_contributions
         (community_id, contributor_user_id, journal_entry_id,
          contribution_state, discussion_state)
       values ($1::uuid, $2::uuid, $3::uuid, 'active', 'open')
       returning id::text id`,
      [communityId, writer.id, entry.rows[0]!.id],
    );
    const report = await pool.query<{ id: string }>(
      `insert into community_contribution_reports
         (contribution_id, reporter_user_id, report_reason, report_state)
       values ($1::uuid, $2::uuid, $3, 'submitted')
       returning id::text id`,
      [contribution.rows[0]!.id, reader.id, reason],
    );
    contributions.push({
      contributionId: contribution.rows[0]!.id,
      reportId: report.rows[0]!.id,
      title,
    });
  }
  const body = `${PREFIX} купуйте насіння за посиланням`;
  const comment = await pool.query<{ id: string }>(
    `insert into engagement_comments
       (author_user_id, body, client_mutation_id, comment_state,
        target_kind, target_ref)
     values ($1::uuid, $2, $3, 'active', 'community_contribution', $4::text)
     returning id::text id`,
    [writer.id, body, randomUUID(), contributions[1]!.contributionId],
  );
  const commentReport = await pool.query<{ id: string }>(
    `insert into engagement_comment_reports
       (reporter_user_id, comment_id, report_reason, report_state)
     values ($1::uuid, $2::uuid, 'spam', 'submitted')
     returning id::text id`,
    [reader.id, comment.rows[0]!.id],
  );
  fixture = {
    communityId,
    slug,
    writer,
    reader,
    removable: contributions[0]!,
    kept: contributions[1]!,
    comment: {
      id: comment.rows[0]!.id,
      reportId: commentReport.rows[0]!.id,
      body,
    },
  };
});

test.afterAll(async () => {
  if (fixture) {
    await pool.query(
      `delete from engagement_moderation_audit_log where comment_id = $1::uuid`,
      [fixture.comment.id],
    );
    await pool.query(
      `delete from engagement_comment_reports where comment_id = $1::uuid`,
      [fixture.comment.id],
    );
    await pool.query(`delete from engagement_comments where id = $1::uuid`, [
      fixture.comment.id,
    ]);
    await pool.query(
      `delete from community_moderation_audit_log where community_id = $1::uuid`,
      [fixture.communityId],
    );
    await pool.query(
      `delete from community_contribution_reports where contribution_id in
         (select id from community_contributions where community_id = $1::uuid)`,
      [fixture.communityId],
    );
    await pool.query(
      `delete from community_contributions where community_id = $1::uuid`,
      [fixture.communityId],
    );
    await pool.query(
      `delete from community_memberships where community_id = $1::uuid`,
      [fixture.communityId],
    );
    await pool.query(
      `delete from community_rules where community_id = $1::uuid`,
      [fixture.communityId],
    );
    await pool.query(`delete from communities where id = $1::uuid`, [
      fixture.communityId,
    ]);
  }
  for (const id of gardeners) {
    for (const [table, column] of [
      ["journal_entries", "owner_user_id"],
      ["plant_objects", "owner_user_id"],
      ["spaces", "owner_user_id"],
    ] as const) {
      await pool.query(`delete from ${table} where ${column} = $1::uuid`, [id]);
    }
    await removeSyntheticGardener(pool, id);
  }
  await pool.end();
});

async function account(prefix: string): Promise<SyntheticGardener> {
  passwordHash ??= hashPassword(SYNTHETIC_GARDENER_PASSWORD);
  const id = randomUUID();
  const email = `${prefix}-${id}@example.test`;
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  gardeners.push(id);
  await pool.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
    [randomUUID(), id, await passwordHash],
  );
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
      where user_id = $1::uuid and lifecycle_state = 'current'`,
    [id],
  );
  return { id, email, handle: claimed.rows[0]!.handle };
}

async function context(
  browser: Browser,
  baseURL: string,
  viewport = { width: 1280, height: 900 },
) {
  const created = await browser.newContext({ viewport });
  await created.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL },
  ]);
  await created.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "declined");
    } catch {
      // Storage may be blocked; the banner is then simply drawn.
    }
  }, CONSENT_KEY);
  return created;
}

async function ownerContext(
  browser: Browser,
  baseURL: string,
  viewport?: { width: number; height: number },
) {
  const created = await context(browser, baseURL, viewport);
  await signInOwnerFixture({ request: created.request, baseURL });
  return created;
}

async function signIn(
  request: APIRequestContext,
  baseURL: string,
  gardener: SyntheticGardener,
) {
  for (const delay of [0, 1_500, 4_000, 9_000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin: baseURL },
      data: { email: gardener.email, password: SYNTHETIC_GARDENER_PASSWORD },
    });
    if (response.ok()) return;
    if (response.status() !== 429) break;
  }
  throw new Error(`${gardener.email} could not sign in`);
}

function encodeMultipart(fields: Array<[string, string]>) {
  const boundary = `----overgarden${randomUUID().replace(/-/gu, "")}`;
  const body = fields
    .map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    )
    .join("");
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.from(`${body}--${boundary}--\r\n`, "utf8"),
  };
}

/** The fields of the `<form>` with this id, as a browser posts it. */
function formById(html: string, id: string) {
  const form = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gu)]
    .map((match) => match[0])
    .find((candidate) => candidate.includes(`id="${id}"`));
  if (!form) return null;
  const fields: Array<[string, string]> = [
    ...form.matchAll(/<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/gu),
  ].map((match) => [match[1]!, decodeHtml(match[2]!)]);
  for (const match of form.matchAll(/<input[^>]*\bname="(\$ACTION_[^"]+)"/gu)) {
    if (!fields.some(([name]) => name === match[1]))
      fields.push([match[1]!, ""]);
  }
  return fields;
}

/** React escapes the action's reference; the endpoint wants it back. */
function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

async function post(
  request: APIRequestContext,
  baseURL: string,
  pagePath: string,
  fields: Array<[string, string]>,
) {
  const encoded = encodeMultipart(fields);
  return request.post(`${baseURL}${pagePath}`, {
    headers: { "content-type": encoded.contentType, origin: baseURL },
    data: encoded.body,
    maxRedirects: 0,
  });
}

function redirectOf(response: { headers: () => Record<string, string> }) {
  const headers = response.headers();
  return headers["x-action-redirect"] ?? headers.location ?? "";
}

async function contribution(id: string) {
  const row = await pool.query<{
    contribution_state: string;
    discussion_state: string;
    removed_by_user_id: string | null;
  }>(
    `select contribution_state, discussion_state, removed_by_user_id::text
       from community_contributions where id = $1::uuid`,
    [id],
  );
  return row.rows[0]!;
}

async function auditCount(targetId: string, action: string) {
  const row = await pool.query<{ n: number }>(
    `select count(*)::int n from community_moderation_audit_log
      where target_id = $1::uuid and action = $2`,
    [targetId, action],
  );
  return row.rows[0]!.n;
}

test.describe("the owner's moderation", () => {
  test("a guest is asked to sign in, and an ordinary member gets no byte of a report", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const pages = [
      "/account/communities",
      `/account/communities/${fixture.slug}`,
      `/account/communities/${fixture.slug}/settings`,
      "/account/moderation/comments",
    ];
    const guest = await context(browser, baseURL!);
    for (const pagePath of pages) {
      const html = await (
        await guest.request.get(`${baseURL}${pagePath}`)
      ).text();
      expect(html, pagePath).toContain(
        'data-operator-access-state="sign-in-required"',
      );
      expect(html).not.toContain(fixture.removable.title);
      expect(html).not.toContain(fixture.comment.body);
    }
    await guest.close();

    const member = await context(browser, baseURL!);
    await signIn(member.request, baseURL!, fixture.reader);
    for (const pagePath of pages) {
      const html = await (
        await member.request.get(`${baseURL}${pagePath}`)
      ).text();
      expect(html, pagePath).toContain('data-operator-access-state="denied"');
      expect(html).not.toContain(fixture.removable.title);
      expect(html).not.toContain(fixture.kept.title);
      expect(html).not.toContain(fixture.comment.body);
      expect(html).not.toContain("data-private-moderation-queue");
    }
    await member.close();
  });

  test("the owner decides from the report's context, and removal asks first", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const owner = await ownerContext(browser, baseURL!);
    const page = await owner.newPage();

    // Every community the owner may moderate, each with the work waiting.
    await page.goto("/account/communities", { waitUntil: "load" });
    const card = page.locator(`[data-moderated-community="${fixture.slug}"]`);
    await expect(card).toContainText("Відкритих скарг: 2");
    await card.getByRole("link").first().click();
    await page.waitForURL(
      (target) => target.pathname === `/account/communities/${fixture.slug}`,
    );

    // What a decision needs: the entry, its author and subject, the reason
    // in words and the record's state now.
    const report = page.locator(
      `[data-moderation-report="${fixture.removable.reportId}"]`,
    );
    await expect(report.locator("h3")).toHaveText(fixture.removable.title);
    await expect(report).toContainText("Не за темою");
    await expect(report).toContainText(`@${fixture.writer.handle}`);
    await expect(report).toContainText("Кури (тварина)");
    await expect(report.locator("[data-moderation-excerpt]")).toContainText(
      "записав, що змінилося",
    );
    await expect(
      report.locator('[data-moderation-contribution-state="active"]'),
    ).toHaveText("запис показується в спільноті");
    await scanAccessibility(page, testInfo, "moderation-queue-uk-1280");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "moderation-queue-1280.png"),
      fullPage: true,
    });

    // Removal asks first, by keyboard, and Cancel changes nothing.
    const remove = report.locator(
      '[data-moderation-action="remove-contribution"]',
    );
    await waitForHydration(remove);
    await tabToControl(page, remove);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      `Прибрати «${fixture.removable.title}» зі спільноти?`,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(
      (await contribution(fixture.removable.contributionId)).contribution_state,
    ).toBe("active");

    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Прибрати", exact: true }).click();
    await page.waitForURL(
      (target) =>
        target.searchParams.get("report") === fixture.removable.reportId &&
        target.searchParams.get("result") === "done",
      { timeout: 20_000 },
    );
    // The outcome, read back from the record, in the report's own card.
    const outcome = page.locator(
      `[data-moderation-report="${fixture.removable.reportId}"] [data-action-outcome="done"]`,
    );
    await expect(outcome).toContainText("Збережено");
    await expect(outcome).toContainText("запис прибрано зі спільноти");
    const stored = await contribution(fixture.removable.contributionId);
    expect(stored.contribution_state).toBe("removed");
    expect(stored.removed_by_user_id).toBe(
      "0ce39100-1ce3-4ce3-8ce3-0ce391000391",
    );
    expect(
      await auditCount(fixture.removable.contributionId, "remove_contribution"),
    ).toBe(1);
    // The other report is untouched and still in the list.
    await expect(
      page.locator(`[data-moderation-report="${fixture.kept.reportId}"]`),
    ).toBeVisible();
    await owner.close();
  });

  test("a double press is one change, and a decided report says nothing changed", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const owner = await ownerContext(browser, baseURL!);
    const page = await owner.newPage();
    const queuePath = `/account/communities/${fixture.slug}`;
    await page.goto(queuePath, { waitUntil: "load" });
    const report = page.locator(
      `[data-moderation-report="${fixture.kept.reportId}"]`,
    );
    const close = report.locator('[data-moderation-action="close-discussion"]');
    await waitForHydration(close);
    await close.dblclick();
    await page.waitForURL(
      (target) => target.searchParams.get("result") === "done",
      { timeout: 20_000 },
    );
    await expect
      .poll(() => contribution(fixture.kept.contributionId))
      .toMatchObject({ discussion_state: "closed" });
    expect(
      await auditCount(fixture.kept.contributionId, "close_discussion"),
    ).toBe(1);

    // The form a second tab still holds: dismiss the report.
    const html = await (
      await owner.request.get(`${baseURL}${queuePath}`)
    ).text();
    const dismiss = formById(
      html,
      `moderation-dismiss-report-${fixture.kept.reportId}`,
    );
    expect(dismiss, "the owner's page rendered no dismiss form").not.toBeNull();
    const first = await post(owner.request, baseURL!, queuePath, dismiss!);
    expect(redirectOf(first)).toContain("result=done");
    const again = await post(owner.request, baseURL!, queuePath, dismiss!);
    expect(redirectOf(again)).toContain("result=stale");
    const reportRow = await pool.query<{ report_state: string }>(
      `select report_state from community_contribution_reports where id = $1::uuid`,
      [fixture.kept.reportId],
    );
    expect(reportRow.rows[0]!.report_state).toBe("dismissed");

    // The owner reads the stale outcome in words, above the list the report
    // has left, and the view they were in is the view they are in.
    await page.goto(
      `${queuePath}${new URL(redirectOf(again), baseURL).search}`,
      {
        waitUntil: "load",
      },
    );
    await expect(
      page.locator('#moderation-outcome [data-action-outcome="stale"]'),
    ).toContainText("Нічого не змінено");
    await expect(page.locator('[data-moderation-view="open"]')).toHaveAttribute(
      "aria-current",
      "page",
    );

    // The resolved view holds it, and an action there comes back there.
    await page.locator('[data-moderation-view="resolved"]').click();
    await page.waitForURL(
      (target) => target.searchParams.get("view") === "resolved",
    );
    const resolved = page.locator(
      `[data-moderation-report="${fixture.kept.reportId}"]`,
    );
    await expect(resolved).toContainText("Відхилена");
    const reopen = resolved.locator(
      '[data-moderation-action="open-discussion"]',
    );
    await waitForHydration(reopen);
    await reopen.click();
    await page.waitForURL(
      (target) =>
        target.searchParams.get("view") === "resolved" &&
        target.searchParams.get("result") === "done",
      { timeout: 20_000 },
    );
    await expect
      .poll(() => contribution(fixture.kept.contributionId))
      .toMatchObject({ discussion_state: "open" });
    await owner.close();
  });

  test("a forged moderation form from an ordinary member changes nothing", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const owner = await ownerContext(browser, baseURL!);
    // The ban form of the report on the kept entry, in whichever view holds
    // the report now.
    let ban: Array<[string, string]> | null = null;
    for (const view of ["", "?view=resolved"]) {
      const html = await (
        await owner.request.get(
          `${baseURL}/account/communities/${fixture.slug}${view}`,
        )
      ).text();
      ban ??= formById(html, `moderation-ban-member-${fixture.kept.reportId}`);
    }
    expect(ban, "the owner's page rendered no ban form").not.toBeNull();
    await owner.close();

    const member = await context(browser, baseURL!);
    await signIn(member.request, baseURL!, fixture.reader);
    const forged = ban!.filter(([name]) => name !== "ownerUserId");
    const response = await post(
      member.request,
      baseURL!,
      `/account/communities/${fixture.slug}`,
      forged,
    );
    expect(redirectOf(response)).toContain("result=denied");
    const membership = await pool.query<{ membership_state: string }>(
      `select membership_state from community_memberships
        where community_id = $1::uuid and user_id = $2::uuid`,
      [fixture.communityId, fixture.writer.id],
    );
    expect(membership.rows[0]!.membership_state).toBe("active");
    const audit = await pool.query<{ n: number }>(
      `select count(*)::int n from community_moderation_audit_log
        where community_id = $1::uuid and actor_user_id = $2::uuid`,
      [fixture.communityId, fixture.reader.id],
    );
    expect(audit.rows[0]!.n).toBe(0);
    await member.close();
  });

  test("closing a community to new entries asks first and says what it does", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const owner = await ownerContext(browser, baseURL!);
    const page = await owner.newPage();
    await page.goto(`/account/communities/${fixture.slug}/settings`, {
      waitUntil: "load",
    });
    const section = page.locator("#community-participation");
    await expect(section).toContainText(
      "Зараз спільнота приймає нових учасників і записи.",
    );
    const close = section.locator(
      '[data-moderation-action="close-participation"]',
    );
    await waitForHydration(close);
    await close.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Закрити прийом нових записів?");
    await dialog.getByRole("button", { name: "Закрити прийом" }).click();
    await page.waitForURL(
      (target) => target.searchParams.get("result") === "done",
      { timeout: 20_000 },
    );
    await expect(section).toContainText(
      "Зараз нові учасники й записи не приймаються",
    );
    const closed = await pool.query<{ participation_state: string }>(
      `select participation_state from communities where id = $1::uuid`,
      [fixture.communityId],
    );
    expect(closed.rows[0]!.participation_state).toBe("closed");

    // The public page stops offering the step it can no longer honour.
    const publicHtml = await (
      await owner.request.get(`${baseURL}/communities/${fixture.slug}`)
    ).text();
    expect(publicHtml).not.toContain('id="community-contribute"');
    expect(publicHtml).toContain("Нові внески тимчасово закриті модератором.");

    const reopen = section.locator(
      '[data-moderation-action="open-participation"]',
    );
    await waitForHydration(reopen);
    await reopen.click();
    await expect
      .poll(
        async () =>
          (
            await pool.query<{ participation_state: string }>(
              `select participation_state from communities where id = $1::uuid`,
              [fixture.communityId],
            )
          ).rows[0]!.participation_state,
        { timeout: 20_000 },
      )
      .toBe("open");
    await owner.close();
  });

  test("a comment report shows the comment, and removing it asks first", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    const owner = await ownerContext(browser, baseURL!);
    const page = await owner.newPage();
    await page.goto("/account/moderation/comments", { waitUntil: "load" });
    const report = page.locator(
      `[data-moderation-report="${fixture.comment.reportId}"]`,
    );
    await expect(report.locator("[data-moderation-excerpt]")).toHaveText(
      fixture.comment.body,
    );
    await expect(report).toContainText(`@${fixture.writer.handle}`);
    await expect(report).toContainText("Коментар в обговоренні спільноти");
    await expect(report.locator("h3 a")).toHaveAttribute(
      "href",
      `/communities/${fixture.slug}/discussions/${fixture.kept.contributionId}`,
    );
    await scanAccessibility(page, testInfo, "comment-moderation-uk-1280");

    const remove = report.locator('[data-moderation-action="remove"]');
    await waitForHydration(remove);
    await remove.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Прибрати цей коментар?");
    await dialog.getByRole("button", { name: "Прибрати", exact: true }).click();
    await page.waitForURL(
      (target) =>
        target.searchParams.get("report") === fixture.comment.reportId &&
        target.searchParams.get("result") === "done",
      { timeout: 20_000 },
    );
    await expect(
      page.locator('#moderation-outcome [data-action-outcome="done"]'),
    ).toContainText("Збережено");
    const comment = await pool.query<{ comment_state: string }>(
      `select comment_state from engagement_comments where id = $1::uuid`,
      [fixture.comment.id],
    );
    expect(comment.rows[0]!.comment_state).toBe("removed");
    await owner.close();
  });

  test("at 320 px, in three languages, the populated moderation pages fit, and axe finds nothing", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    // 320 CSS px is the reflow width (WCAG 1.4.10): a 1280 px screen at 400%.
    const owner = await ownerContext(browser, baseURL!, {
      width: 320,
      height: 720,
    });
    const page = await owner.newPage();
    for (const [locale, label, pagePath] of [
      ["uk", "communities", "/account/communities"],
      ["uk", "queue", `/account/communities/${fixture.slug}`],
      ["uk", "resolved", `/account/communities/${fixture.slug}?view=resolved`],
      ["uk", "settings", `/account/communities/${fixture.slug}/settings`],
      ["uk", "comments", "/account/moderation/comments?view=resolved"],
      // The longest labels: "Затваряне на сигнала: взети са мерки",
      // "Отклонить жалобу", the Bulgarian and Russian community names.
      ["bg", "resolved", `/account/communities/${fixture.slug}?view=resolved`],
      ["ru", "resolved", `/account/communities/${fixture.slug}?view=resolved`],
      ["bg", "settings", `/account/communities/${fixture.slug}/settings`],
      ["ru", "comments", "/account/moderation/comments?view=resolved"],
    ] as const) {
      await owner.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: baseURL! },
      ]);
      await page.goto(pagePath, { waitUntil: "load" });
      // The finished page, not the loading frame a streamed response can
      // still hold beside it.
      await expect(
        page
          .locator('[data-operator-access-state="allowed"]')
          .filter({ hasNot: page.locator('[data-workspace-state="loading"]') })
          .filter({ visible: true }),
      ).toHaveCount(1);
      // The workspace speaks the reader's interface language on its `<main>`.
      await expect(
        page.locator("main[data-workspace-surface]:visible").first(),
      ).toHaveAttribute("lang", locale);
      await expectReflow(page);
      await scanAccessibility(
        page,
        testInfo,
        `moderation-${label}-${locale}-320`,
      );
      if (label === "resolved") {
        await page.screenshot({
          path: path.join(SCREENSHOTS, `moderation-resolved-${locale}-320.png`),
          fullPage: true,
        });
      }
    }
    await owner.close();
  });
});
