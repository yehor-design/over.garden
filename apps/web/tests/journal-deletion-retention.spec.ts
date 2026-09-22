/**
 * OVE-353 browser proof: an authenticated gardener deletes one published
 * journal entry, and the externally observable result is the contract's.
 *
 * Three things are proved end to end against a real browser and a real
 * database, in the order a real owner would experience them:
 *
 *  1. the entry is gone from the owner's own journal immediately, with no
 *     archive or restore control anywhere on the page;
 *  2. the public slug answers `410` with `noindex, nofollow` while the
 *     tombstone exists;
 *  3. once the tombstone is physically purged, the same slug answers `404`.
 *
 * The purge is driven by moving the row's own `purge_after` into the past and
 * running the existing retention worker through its only cron ingress. Nothing
 * here reaches around the canonical owners.
 */

import { randomUUID } from "node:crypto";

import { signInSyntheticGardener } from "./helpers/synthetic-gardener";
import { expect, test, type BrowserContext } from "playwright/test";
import { Pool } from "pg";

const TEST_PASSWORD = "OVE353-local-password-1!";
const LOCALE_COOKIE = "overgarden_interface_locale";

test.describe.configure({ mode: "serial" });

test.describe("OVE-353 journal deletion retention", () => {
  test("deletes an owner entry, answers 410 while retained, then 404 once purged", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(120_000);
    const origin = requiredLoopbackOrigin(baseURL);
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });

    try {
      const owner = await createVerifiedCredentialSession({
        origin,
        context,
        pool,
      });
      await selectLocale(context, origin, "uk");

      const entry = await seedPublishedEntry(pool, owner.userId);
      // The entry's one address (ADR-0029 D9). This proof asked for
      // `/journal/{slug}`, which has been a redirect since entries got numbers.
      const publicPath = entry.publicPath;

      // The entry is live before the delete: the public page resolves and the
      // owner can see it in their own journal.
      const beforeDelete = await context.request.get(`${origin}${publicPath}`);
      expect(beforeDelete.status()).toBe(200);

      await page.goto(`/garden/objects/${entry.objectId}`);
      // By role and exact name: the object's page names the entry twice — in
      // its list and in the timeline beside it.
      await expect(
        page.getByRole("link", { name: entry.title, exact: true }),
      ).toBeVisible();

      // There is no archive or restore affordance to find.
      await expect(
        page.locator('[data-owner-entry-controls="archived"]'),
      ).toHaveCount(0);

      // AC-03, through the entry's own menu since `OVE-488`: the control is
      // keyboard operable, names the entry and states the window.
      const trigger = page.locator(
        `[data-entry-actions-trigger="${entry.id}"]`,
      );
      await expect(trigger).toBeVisible();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const deleteItem = page.locator('[data-entry-action="delete"]');
      await expect(deleteItem).toBeVisible();
      await deleteItem.focus();
      await page.keyboard.press("Enter");
      const dialog = page.locator(`[data-entry-delete-dialog="${entry.id}"]`);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(entry.title);
      await expect(dialog).toContainText("7");

      // WAIT-01: both wait-safe controls are reachable at submit time.
      await expect(page.locator('a[href="/garden"]').first()).toBeAttached();

      await dialog.locator(`[data-entry-delete-confirm="${entry.id}"]`).click();
      await expect(trigger).toHaveCount(0, { timeout: 20_000 });

      // 1. Gone from the owner's own journal, immediately and canonically.
      await page.goto(`/garden/objects/${entry.objectId}`);
      await expect(page.getByText(entry.title)).toHaveCount(0);
      const lifecycle = await readLifecycle(pool, entry.id);
      expect(lifecycle.state).toBe("deleted_retention");
      expect(lifecycle.retentionDays).toBe(7);
      expect(lifecycle.title).not.toBe(entry.title);

      // 2. The public slug is a tombstone while the retention window holds.
      const tombstone = await context.request.get(`${origin}${publicPath}`, {
        maxRedirects: 0,
      });
      expect(tombstone.status()).toBe(410);
      expect(tombstone.headers()["x-robots-tag"]).toContain("noindex");
      expect(tombstone.headers()["x-robots-tag"]).toContain("nofollow");
      expect(await tombstone.text()).not.toContain(entry.title);

      // 3. Make the derived effects terminal and move the horizon into the
      //    past, exactly as seven elapsed days plus a drained worker would.
      await settleDerivedEffects(pool, entry.id);
      await expirePurgeHorizon(pool, entry.id);
      await runRetentionCron(origin, context);

      await expect
        .poll(async () => (await readLifecycle(pool, entry.id)).state, {
          timeout: 20_000,
        })
        .toBe("absent");

      const purged = await context.request.get(`${origin}${publicPath}`, {
        maxRedirects: 0,
      });
      expect(purged.status()).toBe(404);
    } finally {
      await pool.end();
    }
  });
});

function requiredLoopbackOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("A loopback base URL is required.");
  const url = new URL(baseURL);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("This proof only runs against a loopback origin.");
  }
  return url.origin;
}

function requiredLocalDatabaseUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required.");
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error("This proof only runs against a local database.");
  }
  return url;
}

async function selectLocale(
  context: BrowserContext,
  origin: string,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    {
      name: LOCALE_COOKIE,
      value: locale,
      url: origin,
    },
  ]);
}

/**
 * A gardener with a session, through the one helper that knows how.
 *
 * What stood here asserted `signUp.ok()`, and sign-up answers 500 on a machine
 * with no mail provider — the rows are written before the verification mail is
 * sent — so this spec could not pass locally and is in no CI list, which is why
 * nobody noticed. The shared helper knows that, and knows about Better Auth's
 * sign-up rate limit as well.
 */
async function createVerifiedCredentialSession(input: {
  origin: string;
  context: BrowserContext;
  pool: Pool;
}) {
  const gardener = await signInSyntheticGardener({
    baseURL: input.origin,
    context: input.context,
    pool: input.pool,
    prefix: "ove353-browser",
    password: TEST_PASSWORD,
  });
  return { email: gardener.email, userId: gardener.id };
}

async function seedPublishedEntry(pool: Pool, ownerUserId: string) {
  const suffix = randomUUID().slice(0, 8);
  const title = `OVE-353 proof entry ${suffix}`;
  const publicSlug = `ove353-proof-${suffix}`;

  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name)
     values ($1::uuid, 'OVE-353 proof space') returning id::text as id`,
    [ownerUserId],
  );
  const spaceId = space.rows[0]!.id;

  const object = await pool.query<{ id: string }>(
    `insert into plant_objects
       (owner_user_id, space_id, display_name, object_kind, variety_state,
        location_visibility)
     values ($1::uuid, $2::uuid, 'OVE-353 proof object', 'plant', 'unknown',
             'hidden')
     returning id::text as id`,
    [ownerUserId, spaceId],
  );
  const objectId = object.rows[0]!.id;

  // No `public_noindex`: the column left the schema, and this insert went on
  // naming it because nothing ran this file (`OVE-462`).
  const entry = await pool.query<{ id: string; n: number }>(
    `insert into journal_entries
       (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
        entry_date, visibility, lifecycle_state, public_slug,
        published_at, client_mutation_id)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'Proof body for OVE-353.',
             'object', current_date, 'public', 'active', $5, now(), $6)
     returning id::text as id, author_entry_number as n`,
    [ownerUserId, spaceId, objectId, title, publicSlug, `ove353-${suffix}`],
  );
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
      where user_id = $1::uuid and lifecycle_state = 'current'`,
    [ownerUserId],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error("The proof's gardener holds no handle.");

  return {
    id: entry.rows[0]!.id,
    objectId,
    spaceId,
    title,
    publicSlug,
    publicPath: `/@${handle}/post/${entry.rows[0]!.n}`,
  };
}

async function readLifecycle(pool: Pool, entryId: string) {
  const result = await pool.query<{
    lifecycle_state: string;
    title: string;
    retention_days: string | null;
  }>(
    `select lifecycle_state, title,
            extract(epoch from (purge_after - deleted_at)) / 86400 as retention_days
     from journal_entries where id = $1::uuid`,
    [entryId],
  );
  const row = result.rows[0];
  if (!row)
    return { state: "absent" as const, title: null, retentionDays: null };
  return {
    state: row.lifecycle_state,
    title: row.title,
    retentionDays:
      row.retention_days === null ? null : Number(row.retention_days),
  };
}

/**
 * Marks the derived effects terminal the way the drained workers would. The
 * purge predicate reads these; it must not be reachable without them.
 */
async function settleDerivedEffects(pool: Pool, entryId: string) {
  await pool.query(
    `update media_assets set revoked_at = now(), public_unreachable_at = now(),
       updated_at = now()
     where journal_entry_id = $1::uuid`,
    [entryId],
  );
  await pool.query(
    `update public_projection_intents
     set status = 'applied', applied_state = 'absent',
         applied_generation = desired_generation, applied_at = now(),
         verified_at = now(), updated_at = now()
     where entity_kind = 'journal_entry' and entity_id = $1::uuid`,
    [entryId],
  );
}

async function expirePurgeHorizon(pool: Pool, entryId: string) {
  // Shift both stamps together so the seven-day retention check still holds.
  await pool.query(
    `update journal_entries
     set deleted_at = now() - interval '8 days',
         purge_after = now() - interval '1 day'
     where id = $1::uuid`,
    [entryId],
  );
}

async function runRetentionCron(origin: string, context: BrowserContext) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is required for the purge pass.");
  const response = await context.request.post(
    `${origin}/api/cron/media-lifecycle`,
    { headers: { authorization: `Bearer ${secret}` } },
  );
  expect(response.status()).toBe(200);
}
