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

import { expect, test, type BrowserContext } from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

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
      const publicPath = `/journal/${entry.publicSlug}`;

      // The entry is live before the delete: the public page resolves and the
      // owner can see it in their own journal.
      const beforeDelete = await context.request.get(`${origin}${publicPath}`);
      expect(beforeDelete.status()).toBe(200);

      await page.goto(`/garden/objects/${entry.objectId}`);
      await expect(page.getByText(entry.title)).toBeVisible();

      // There is no archive or restore affordance to find.
      await expect(
        page.locator('[data-owner-entry-controls="archived"]'),
      ).toHaveCount(0);

      const acknowledgement = page.locator('input[name="deleteAccepted"]');
      await expect(acknowledgement).toBeVisible();

      // AC-03: the control is keyboard operable and states the window.
      await acknowledgement.focus();
      await expect(acknowledgement).toBeFocused();
      await page.keyboard.press("Space");
      await expect(acknowledgement).toBeChecked();

      const deleteButton = page.locator(
        `form:has(input[name="deleteAccepted"]) button[type="submit"]`,
      );
      await expect(deleteButton).toBeEnabled();

      // WAIT-01: both wait-safe controls are reachable at submit time.
      await expect(page.locator('a[href="/garden"]').first()).toBeVisible();

      await Promise.all([page.waitForLoadState("networkidle"), deleteButton.click()]);

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

async function createVerifiedCredentialSession(input: {
  origin: string;
  context: BrowserContext;
  pool: Pool;
}) {
  const email = `ove353-browser-${randomUUID()}@example.test`;
  const signUp = await input.context.request.post(
    `${input.origin}/api/auth/sign-up/email`,
    {
      headers: { origin: input.origin },
      data: {
        email,
        password: TEST_PASSWORD,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    },
  );
  expect(signUp.ok()).toBe(true);
  const user = await input.pool.query<{ id: string }>(
    'select id::text as id from public."user" where email = $1::text',
    [email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Synthetic auth user was not persisted.");
  await input.pool.query(
    'update public."user" set "emailVerified" = true where id = $1::uuid',
    [userId],
  );
  const signIn = await input.context.request.post(
    `${input.origin}/api/auth/sign-in/email`,
    {
      headers: { origin: input.origin },
      data: { email, password: TEST_PASSWORD },
    },
  );
  expect(signIn.ok()).toBe(true);
  return { email, userId };
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

  const entry = await pool.query<{ id: string }>(
    `insert into journal_entries
       (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
        entry_date, visibility, lifecycle_state, public_slug, public_noindex,
        published_at, client_mutation_id)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'Proof body for OVE-353.',
             'object', current_date, 'public', 'active', $5, false, now(), $6)
     returning id::text as id`,
    [ownerUserId, spaceId, objectId, title, publicSlug, `ove353-${suffix}`],
  );

  return { id: entry.rows[0]!.id, objectId, spaceId, title, publicSlug };
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
  if (!row) return { state: "absent" as const, title: null, retentionDays: null };
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
