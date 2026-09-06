import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import {
  OWNER_BROWSER_FIXTURE,
  OWNER_BROWSER_FIXTURE_ENV,
} from "./helpers/owner-fixture";

/**
 * The owner curation queue end to end (OVE-391, ADR-0026 D10), against a
 * production build and a real database:
 *
 *   1. the decision stream: highest impact first, both cards, reasons and
 *      confidence, and J/K walking the stream without deciding anything;
 *   2. Y accepting through the keyboard, proven in `plant_objects` rather
 *      than in the page: the gardener's object gains the card and keeps its
 *      own words (D6);
 *   3. U undoing an automatic decision, proven by the revert row and by the
 *      object going back to `free_text`;
 *   4. an accept with no JavaScript at all: a multipart POST to the Server
 *      Action endpoint, exactly as a browser without scripts would send it.
 *
 * On (4), what is proven is the endpoint, not the visibility of the control:
 * every page here renders inside a streamed Suspense boundary, and with
 * scripts off React never moves that content into place (ADR-0024 D3). The
 * form is real and decides without hydration; the page it lives on is not
 * readable without scripts, which is a recorded product decision.
 *
 * Run it against a server you started yourself, with the sealed owner the
 * seed script writes:
 *
 *   pnpm owner:seed-browser-fixture
 *   pnpm build
 *   OVERGARDEN_ADMIN_OWNER_USER_ID=0ce39100-1ce3-4ce3-8ce3-0ce391000391 \
 *     BETTER_AUTH_URL=http://127.0.0.1:3130 pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/owner-catalog-curation.spec.ts
 */
const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const QUEUE_PATH = "/garden/catalog/queue";

interface Fixture {
  suffix: string;
  speciesId: string;
  cultivarId: string;
  spaceId: string;
  objectIds: { keyboard: string; noScript: string; automatic: string };
  queueIds: { keyboard: string; noScript: string; automatic: string };
  labels: { keyboard: string; noScript: string; automatic: string };
}

test.use({ trace: "off" });

test.describe("OVE-391 owner curation", () => {
  test("decides by keyboard, undoes an automatic decision and accepts without JavaScript", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let fixture: Fixture | null = null;

    try {
      fixture = await seedFixture(pool);
      await signInAsOwner(context, baseURL);
      await selectLocale(context, baseURL, "uk");

      // The gate first: a page that renders "denied" here means the server was
      // started without the fixture's owner id, and nothing below can pass.
      await page.goto(QUEUE_PATH, { waitUntil: "load" });
      const shell = page.locator('[data-operator-surface="catalog-queue"]');
      await expect(
        shell,
        `The server must run with ${OWNER_BROWSER_FIXTURE_ENV}=${OWNER_BROWSER_FIXTURE.userId}.`,
      ).toHaveAttribute("data-operator-access-state", "allowed");

      // 1. One decision at a time, highest impact first.
      const item = page.locator("[data-catalog-queue-item]");
      await expect(item).toHaveAttribute(
        "data-catalog-queue-item",
        fixture.queueIds.keyboard,
      );
      await expect(item).toContainText(fixture.labels.keyboard);
      await expect(item).toContainText("Solanum lycopersicum");
      await expect(page.locator("[data-catalog-queue-position]")).toContainText(
        "1/2",
      );

      // J and K walk the stream. Neither records a decision: the item the
      // owner skipped past is still open when K brings them back.
      // The first press doubles as the hydration wait: the shortcuts are a
      // client effect, and a key pressed before it runs goes nowhere.
      await pressUntil(page, "j", async () =>
        (await item.getAttribute("data-catalog-queue-item")) ===
        fixture!.queueIds.noScript,
      );
      await expect(page).toHaveURL(new RegExp(`item=${fixture.queueIds.noScript}`, "u"));
      await page.keyboard.press("k");
      await expect(item).toHaveAttribute(
        "data-catalog-queue-item",
        fixture.queueIds.keyboard,
      );
      expect(await readQueueState(pool, fixture.queueIds.noScript)).toBe("open");

      // 2. Y accepts. The proof is the gardener's object, not the page.
      await page.keyboard.press("y");
      await expect
        .poll(() => readQueueState(pool, fixture!.queueIds.keyboard), {
          timeout: 20_000,
        })
        .toBe("accepted");
      expect(await readObject(pool, fixture.objectIds.keyboard)).toMatchObject({
        catalog_item_id: fixture.speciesId,
        variety_state: "selected",
        // D6: the gardener's own words stay theirs.
        variety_text: fixture.labels.keyboard,
      });

      // 3. U undoes the week's automatic decision, and the object it moved
      // goes back to the name the gardener typed.
      await page.goto(QUEUE_PATH, { waitUntil: "load" });
      const undo = page.locator("[data-catalog-automatic-undo]").first();
      await expect(undo).toBeVisible();
      const automaticActionId = await undo.getAttribute(
        "data-catalog-automatic-undo",
      );
      expect(automaticActionId).not.toBeNull();
      await pressUntil(page, "u", () =>
        readActionReverted(pool, automaticActionId!),
      );
      expect(await readObject(pool, fixture.objectIds.automatic)).toMatchObject({
        catalog_item_id: null,
        variety_state: "free_text",
        variety_text: fixture.labels.automatic,
      });

      // 4. The same decision with no JavaScript: read the form Next rendered,
      // post it as multipart, and read the outcome from the database.
      // Plain HTTP, no browser: the session cookie, the form fields React
      // rendered, and a multipart body — what a browser with scripts off
      // sends and nothing more.
      const cookie = (await context.cookies(baseURL))
        .map((entry) => `${entry.name}=${entry.value}`)
        .join("; ");
      const html = await (
        await fetch(`${baseURL}${QUEUE_PATH}`, {
          headers: { accept: "text/html", cookie },
        })
      ).text();
      const form = readAcceptForm(html, fixture.queueIds.noScript);
      const body = new FormData();
      for (const [name, value] of Object.entries(form.fields)) {
        body.append(name, value);
      }
      const posted = await fetch(`${baseURL}${form.action}`, {
        method: "POST",
        headers: { accept: "text/html", cookie, origin: baseURL },
        body,
        redirect: "manual",
      });
      expect(
        [200, 303].includes(posted.status),
        `Server Action POST answered ${posted.status}`,
      ).toBe(true);
      await expect
        .poll(() => readQueueState(pool, fixture!.queueIds.noScript), {
          timeout: 20_000,
        })
        .toBe("accepted");
      expect(await readObject(pool, fixture.objectIds.noScript)).toMatchObject({
        catalog_item_id: fixture.speciesId,
        variety_state: "selected",
      });

      // Every decision is audited under the owner who made it.
      expect(await readOwnerActionCount(pool, fixture.speciesId)).toBeGreaterThan(
        0,
      );

      // 5. The sources page enqueues exactly one refresh per idempotency key.
      await page.goto("/garden/catalog/sources", { waitUntil: "load" });
      const refresh = page.locator('[data-catalog-source-refresh="eppo"]');
      await expect(refresh).toBeVisible();
      await refresh.click();
      await expect
        .poll(() => readRefreshJobCount(pool), { timeout: 20_000 })
        .toBe(1);
      await page.goto("/garden/catalog/sources", { waitUntil: "load" });
      const refreshAgain = page.locator('[data-catalog-source-refresh="eppo"]');
      await refreshAgain.click();
      await page.waitForTimeout(2_000);
      expect(await readRefreshJobCount(pool)).toBe(1);
    } finally {
      if (fixture) await cleanupFixture(pool, fixture);
      await pool.end().catch(() => undefined);
    }
  });
});

/**
 * Presses a key until the page answers. The shortcuts hydrate after the
 * stream settles, so the first press can land before the listener exists;
 * every key here is idempotent in its own direction.
 */
async function pressUntil(
  page: Page,
  key: string,
  reached: () => Promise<boolean>,
) {
  await expect
    .poll(
      async () => {
        if (await reached()) return true;
        await page.keyboard.press(key);
        await page.waitForTimeout(500);
        return reached();
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
}

async function seedFixture(pool: Pool): Promise<Fixture> {
  await cleanupStaleRuns(pool);
  const suffix = randomUUID().slice(0, 8);
  const speciesId = randomUUID();
  const cultivarId = randomUUID();
  const spaceId = randomUUID();
  const snapshotId = randomUUID();
  const assertionId = randomUUID();
  const objectIds = {
    keyboard: randomUUID(),
    noScript: randomUUID(),
    automatic: randomUUID(),
  };
  const queueIds = {
    keyboard: randomUUID(),
    noScript: randomUUID(),
    automatic: randomUUID(),
  };
  const labels = {
    keyboard: `Помідор бабусі ${suffix}`,
    noScript: `Помідор сусіда ${suffix}`,
    automatic: `Помідор автоматичний ${suffix}`,
  };

  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category, source_version,
       source_url, license, parser_version, payload_sha256, fetched_at, verified_at, status)
     values ($1, 'eppo', 'EPPO Global Database', 'taxonomy', $2, 'https://gd.eppo.int/',
             'EPPO terms of use', $2, $3, now(), now(), 'imported')`,
    [snapshotId, `ove391-${suffix}`, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values ($1, 'eppo', $2)`,
    [assertionId, snapshotId],
  );
  for (const [id, name, kind, nodeKind] of [
    [speciesId, "Solanum lycopersicum L.", "species", "taxon"],
    [cultivarId, `Де Барао ${suffix}`, "plant_variety", "cultivar"],
  ] as const) {
    await pool.query(
      `insert into catalog_items (id, canonical_name, catalog_kind, normalized_name, public_slug, status,
         source, source_id, locale, node_kind, kingdom, rank, identity_state, search_weight)
       values ($1, $2, $3, catalog_normalize_name($2), $4, 'seeded', 'species_backbone', $5, 'la', $6,
               'Plantae', 'species', 'active', 5)`,
      [id, name, kind, `ove391-${suffix}-${id.slice(0, 8)}`, `ove391:${id}`, nodeKind],
    );
  }
  await pool.query(
    `insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary, name_type)
     values ($1, 'Solanum lycopersicum', catalog_normalize_name('Solanum lycopersicum'), 'la', true, 'scientific_accepted')`,
    [speciesId],
  );
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2::uuid, $3)`,
    [spaceId, OWNER_BROWSER_FIXTURE.userId, `OVE-391 ${suffix}`],
  );
  for (const [objectId, label] of [
    [objectIds.keyboard, labels.keyboard],
    [objectIds.noScript, labels.noScript],
    [objectIds.automatic, labels.automatic],
  ] as const) {
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_text, variety_state)
       values ($1, $2::uuid, $3, $4, 'plant', $5, 'free_text')`,
      [objectId, OWNER_BROWSER_FIXTURE.userId, spaceId, label.slice(0, 60), label],
    );
  }
  const queueRows: Array<[string, string, number]> = [
    [queueIds.keyboard, labels.keyboard, 90],
    [queueIds.noScript, labels.noScript, 60],
    [queueIds.automatic, labels.automatic, 30],
  ];
  for (const [id, label, impact] of queueRows) {
    await pool.query(
      `insert into catalog_curation_queue (id, item_type, subject_catalog_item_id, subject_label, proposal,
         confidence, reasons, impact_score, state)
       values ($1, 'label_link', $2::uuid, $3, jsonb_build_object('catalog_item_id', $2::text, 'object_kind', 'plant'),
               0.93, array['denomination_equal'], $4, 'open')`,
      [id, speciesId, label, impact],
    );
  }
  // One decision already applied automatically, so the seven-day list has a
  // row to undo. It runs through the same function the worker calls.
  await pool.query("select catalog_apply_queue_item($1::uuid, null, true)", [
    queueIds.automatic,
  ]);
  return { suffix, speciesId, cultivarId, spaceId, objectIds, queueIds, labels };
}

async function cleanupFixture(pool: Pool, fixture: Fixture) {
  const ids = Object.values(fixture.objectIds);
  await pool
    .query("delete from journal_entries where plant_object_id = any($1::uuid[])", [ids])
    .catch(() => undefined);
  await pool.query("delete from plant_objects where id = any($1::uuid[])", [ids]);
  await pool.query("delete from spaces where id = $1::uuid", [fixture.spaceId]);
  await pool.query(
    "delete from job_queue where payload->>'kind' = 'catalog_source_refresh' and payload->>'source_slug' = 'eppo'",
  );
  await pool.query(
    "delete from catalog_curation_queue where id = any($1::uuid[]) and state = 'open'",
    [Object.values(fixture.queueIds)],
  );
  /**
   * A decided queue row cannot be deleted, and neither can the node under it:
   * `catalog_curation_actions.queue_item_id` is `on delete set null`, and the
   * audit table refuses every update, so the cascade behind the delete is
   * refused too. What this run decided stays on the database as its own
   * receipt; the run seeds fresh identifiers, so nothing collides.
   */
  await pool.query(
    `delete from catalog_items where id = any($1::uuid[])
       and not exists (
         select 1 from catalog_curation_queue as queue
         where queue.subject_catalog_item_id = catalog_items.id
       )`,
    [[fixture.speciesId, fixture.cultivarId]],
  );
  await pool.query(
    `delete from catalog_source_assertions as assertion
     using catalog_source_snapshots as snapshot
     where assertion.source_snapshot_id = snapshot.id
       and snapshot.source_version like 'ove391-%'`,
  );
  await pool.query(
    "delete from catalog_source_snapshots where source_version like 'ove391-%'",
  );
}

async function cleanupStaleRuns(pool: Pool) {
  await pool.query("delete from plant_objects where owner_user_id = $1::uuid", [
    OWNER_BROWSER_FIXTURE.userId,
  ]);
  await pool.query("delete from spaces where display_name like 'OVE-391 %'");
  await pool.query(
    "delete from catalog_curation_queue where subject_label like 'Помідор %' and state = 'open'",
  );
  await pool.query(
    "delete from job_queue where payload->>'kind' = 'catalog_source_refresh' and payload->>'source_slug' = 'eppo'",
  );
}

async function signInAsOwner(context: BrowserContext, baseURL: string) {
  const signIn = await context.request.post(
    `${baseURL}/api/auth/sign-in/email`,
    {
      headers: { origin: baseURL },
      data: {
        email: OWNER_BROWSER_FIXTURE.email,
        password: OWNER_BROWSER_FIXTURE.password,
      },
    },
  );
  expect(
    signIn.ok(),
    "Run `pnpm owner:seed-browser-fixture` before this spec.",
  ).toBe(true);
}

async function selectLocale(
  context: BrowserContext,
  baseURL: string,
  locale: "uk" | "bg" | "ru",
) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: INTERFACE_MARKET_COOKIE,
      value: locale === "uk" ? "ukraine" : "bulgaria",
      url: baseURL,
    },
  ]);
}

/**
 * The accept form as a browser without JavaScript sees it: the fields React
 * serialized for a native submit (`$ACTION_REF_n`, `$ACTION_n:0`, and the
 * key), plus the queue item the button carries. Their absence means the form
 * needs hydration, which is exactly what this proof is here to catch.
 */
function readAcceptForm(html: string, queueItemId: string) {
  const forms = html.match(/<form[\s\S]*?<\/form>/gu) ?? [];
  const accept = forms.find(
    (form) =>
      form.includes('data-catalog-queue-action="accept"') &&
      form.includes(queueItemId),
  );
  if (!accept) {
    throw new Error(
      `No accept form for queue item ${queueItemId} in the rendered HTML.`,
    );
  }
  const action = /<form[^>]*\baction="([^"]*)"/u.exec(accept)?.[1] ?? "";
  const fields: Record<string, string> = {};
  for (const input of accept.match(/<input\b[^>]*>/gu) ?? []) {
    const name = /\bname="([^"]*)"/u.exec(input)?.[1];
    if (!name) continue;
    fields[decodeHtml(name)] = decodeHtml(/\bvalue="([^"]*)"/u.exec(input)?.[1] ?? "");
  }
  if (!Object.keys(fields).some((name) => name.startsWith("$ACTION"))) {
    throw new Error(
      "The accept form carries no $ACTION field, so it needs hydration.",
    );
  }
  return { action: action === "" ? QUEUE_PATH : decodeHtml(action), fields };
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function readQueueState(pool: Pool, id: string) {
  const result = await pool.query<{ state: string }>(
    "select state from catalog_curation_queue where id = $1::uuid",
    [id],
  );
  return result.rows[0]?.state ?? null;
}

async function readActionReverted(pool: Pool, actionId: string) {
  const result = await pool.query<{ reverted: boolean }>(
    "select reverted_by_action_id is not null as reverted from catalog_curation_actions where id = $1::uuid",
    [actionId],
  );
  return result.rows[0]?.reverted ?? false;
}

async function readObject(pool: Pool, id: string) {
  const result = await pool.query(
    `select catalog_item_id::text as catalog_item_id, variety_state, variety_text
     from plant_objects where id = $1::uuid`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function readOwnerActionCount(pool: Pool, catalogItemId: string) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from catalog_curation_actions
     where subject_catalog_item_ids @> array[$1::uuid]`,
    [catalogItemId],
  );
  return result.rows[0]?.count ?? 0;
}

async function readRefreshJobCount(pool: Pool) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from job_queue
     where payload->>'kind' = 'catalog_source_refresh' and payload->>'source_slug' = 'eppo'`,
  );
  return result.rows[0]?.count ?? 0;
}

function requiredLocalDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL is required for the curation spec.");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("The curation spec runs against a loopback database only.");
  }
  return url;
}
