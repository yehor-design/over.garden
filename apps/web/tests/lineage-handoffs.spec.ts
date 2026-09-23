import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";
import { Pool } from "pg";

import { hashPassword } from "better-auth/crypto";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { waitForHydration } from "./helpers/hydration";
import { mintLineageInviteToken } from "./helpers/lineage-invite-token";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { scanAccessibility } from "./helpers/redesign-accessibility";
import {
  removeSyntheticGardener,
  SYNTHETIC_GARDENER_PASSWORD,
} from "./helpers/synthetic-gardener";

/**
 * `OVE-495`: lineage as relationship tasks between two named gardeners, and
 * the passport that shows what they agreed.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=lineage-handoffs.spec.ts
 *
 * Three synthetic gardeners, written straight into the local database the way
 * the owner fixture is (a `user` row, whose insert claims a handle and a
 * public profile, and a credential with Better Auth's own hash). Every
 * sign-in goes through the screen; every decision through the page's own
 * controls; every outcome is read back from the database. Nothing leaves it.
 *
 * Related objects are named the same on purpose — Анна's «Томат ove495» came
 * from Богдан's «Томат ove495» — because that is the case a page has to tell
 * apart (criterion 12).
 */

const PREFIX = "ove495";
const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const CONSENT_KEY = "overgarden:analytics-consent";
const INVITATION_PATH = "/garden/lineage/invitations/claim";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-495",
);

type Locale = "uk" | "bg" | "ru";

interface Gardener {
  id: string;
  email: string;
  handle: string;
  displayName: string | null;
}

interface SeededObject {
  id: string;
  slug: string;
  name: string;
  owner: Gardener;
}

let pool: Pool;
let passwordHash: Promise<string> | null = null;
const gardenerIds: string[] = [];
const contexts: BrowserContext[] = [];

let anna: Gardener;
let bohdan: Gardener;
let curious: Gardener;
let annaContext: BrowserContext;
let bohdanContext: BrowserContext;
let curiousContext: BrowserContext;

const objects = {} as Record<
  | "annaTomato"
  | "bohdanTomato"
  | "annaPepper"
  | "bohdanPepper"
  | "annaMint"
  | "bohdanMint"
  | "annaBasil"
  | "annaCucumber"
  | "bohdanCucumber"
  | "annaDill"
  | "bohdanUnlinked",
  SeededObject
>;
const edges = {} as Record<"tomato" | "pepper" | "mint" | "cucumber", string>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 3 });
  mkdirSync(SCREENSHOTS, { recursive: true });
  const run = randomUUID().slice(0, 6);

  anna = await createGardener("anna", `Анна Садівниця ${PREFIX}`);
  bohdan = await createGardener("bohdan", `Богдан Розсадник ${PREFIX}`);
  curious = await createGardener("curious", null);

  const annaSpace = await seedSpace(anna, `Балкон ${PREFIX}`);
  const bohdanSpace = await seedSpace(bohdan, `Теплиця ${PREFIX}`);
  const object = (
    owner: Gardener,
    spaceId: string,
    key: string,
    name: string,
    withPublicEntry = true,
  ) =>
    seedObject(
      owner,
      spaceId,
      `${PREFIX}-${key}-${run}`,
      name,
      withPublicEntry,
    );

  objects.annaTomato = await object(
    anna,
    annaSpace,
    "a-tomato",
    `Томат ${PREFIX}`,
  );
  objects.bohdanTomato = await object(
    bohdan,
    bohdanSpace,
    "b-tomato",
    `Томат ${PREFIX}`,
  );
  objects.annaPepper = await object(
    anna,
    annaSpace,
    "a-pepper",
    `Перець ${PREFIX}`,
  );
  objects.bohdanPepper = await object(
    bohdan,
    bohdanSpace,
    "b-pepper",
    `Перець ${PREFIX}`,
  );
  objects.annaMint = await object(anna, annaSpace, "a-mint", `М'ята ${PREFIX}`);
  objects.bohdanMint = await object(
    bohdan,
    bohdanSpace,
    "b-mint",
    `М'ята ${PREFIX}`,
  );
  objects.annaBasil = await object(
    anna,
    annaSpace,
    "a-basil",
    `Базилік ${PREFIX}`,
    false,
  );
  objects.annaCucumber = await object(
    anna,
    annaSpace,
    "a-cucumber",
    `Огірок ${PREFIX}`,
  );
  objects.bohdanCucumber = await object(
    bohdan,
    bohdanSpace,
    "b-cucumber",
    `Огірок ${PREFIX}`,
  );
  objects.annaDill = await object(
    anna,
    annaSpace,
    "a-dill",
    `Кріп ${PREFIX}`,
    false,
  );
  objects.bohdanUnlinked = await object(
    bohdan,
    bohdanSpace,
    "b-alone",
    `Шавлія ${PREFIX}`,
  );

  // Анна says each of hers came from Богдан's namesake.
  edges.tomato = await seedClaim(
    objects.annaTomato,
    objects.bohdanTomato,
    "proposed",
  );
  edges.pepper = await seedClaim(
    objects.annaPepper,
    objects.bohdanPepper,
    "proposed",
  );
  edges.cucumber = await seedClaim(
    objects.annaCucumber,
    objects.bohdanCucumber,
    "proposed",
  );
  // A link both already confirmed, and a question Анна asked through it.
  edges.mint = await seedClaim(
    objects.annaMint,
    objects.bohdanMint,
    "confirmed",
  );
  await pool.query(
    `insert into lineage_questions
       (asker_user_id, recipient_user_id, lineage_edge_id,
        subject_plant_object_id, target_plant_object_id, question_text,
        question_state, client_mutation_id)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6,
             'delivered', $7)`,
    [
      anna.id,
      bohdan.id,
      edges.mint,
      objects.annaMint.id,
      objects.bohdanMint.id,
      `Як ви зберігали насіння взимку? ${PREFIX}`,
      randomUUID(),
    ],
  );

  annaContext = await signedIn(browser, baseURL!, anna);
  bohdanContext = await signedIn(browser, baseURL!, bohdan);
  curiousContext = await signedIn(browser, baseURL!, curious);
});

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (pool) {
    const ids = gardenerIds;
    // Links first: they hold the objects, and take their questions, follows
    // and audit rows with them.
    await pool.query(
      `delete from lineage_provenance_edges
        where owner_user_id = any($1::uuid[])
           or source_owner_user_id = any($1::uuid[])`,
      [ids],
    );
    await pool.query(
      `delete from lineage_pending_source_identities
        where created_by_user_id = any($1::uuid[])`,
      [ids],
    );
    for (const [table, column] of [
      ["journal_entries", "owner_user_id"],
      ["plant_objects", "owner_user_id"],
      ["spaces", "owner_user_id"],
    ] as const) {
      await pool.query(
        `delete from ${table} where ${column} = any($1::uuid[])`,
        [ids],
      );
    }
    for (const id of ids) await removeSyntheticGardener(pool, id);
    await pool.end();
  }
});

async function createGardener(
  label: string,
  displayName: string | null,
): Promise<Gardener> {
  passwordHash ??= hashPassword(SYNTHETIC_GARDENER_PASSWORD);
  const id = randomUUID();
  const email = `${PREFIX}-${label}-${id}@example.test`;
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, email, PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  gardenerIds.push(id);
  await pool.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
    [randomUUID(), id, await passwordHash],
  );
  if (displayName) {
    await pool.query(
      `update user_public_profiles set display_name = $2 where user_id = $1::uuid`,
      [id, displayName],
    );
  }
  const profile = await pool.query<{ handle: string }>(
    `select handle from user_public_profiles where user_id = $1::uuid`,
    [id],
  );
  const handle = profile.rows[0]?.handle;
  if (!handle) throw new Error(`${email} has no public profile`);
  return { id, email, handle, displayName };
}

async function seedSpace(owner: Gardener, name: string) {
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
     returning id::text id`,
    [owner.id, name],
  );
  return space.rows[0]!.id;
}

/**
 * An object, and — for the public lineage, which shows a link only between
 * objects with a public entry each — one public entry about it.
 */
async function seedObject(
  owner: Gardener,
  spaceId: string,
  slug: string,
  name: string,
  withPublicEntry: boolean,
): Promise<SeededObject> {
  const object = await pool.query<{ id: string }>(
    `insert into plant_objects
       (owner_user_id, space_id, display_name, object_kind, public_slug,
        variety_text, variety_state)
     values ($1::uuid, $2::uuid, $3, 'plant', $4, null, 'unknown')
     returning id::text id`,
    [owner.id, spaceId, name, slug],
  );
  const id = object.rows[0]!.id;
  if (withPublicEntry) {
    await pool.query(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, title, body,
          client_mutation_id, public_slug, published_at, entry_date,
          source_language, visibility, lifecycle_state, content_class,
          entry_scope)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(),
               current_date, 'uk', 'public', 'active', 'real_ugc', 'object')`,
      [
        owner.id,
        spaceId,
        id,
        `${name}: перший запис`,
        "Нові листки рівні, без плям.",
        randomUUID(),
        `${slug}-entry`,
      ],
    );
  }
  return { id, slug, name, owner };
}

/** `subject` (its owner's) came from `source` (another gardener's). */
async function seedClaim(
  subject: SeededObject,
  source: SeededObject,
  consent: "proposed" | "confirmed",
) {
  const edge = await pool.query<{ id: string }>(
    `insert into lineage_provenance_edges
       (owner_user_id, subject_plant_object_id, source_kind,
        source_plant_object_id, source_owner_user_id, consent_state,
        erasure_state, client_mutation_id)
     values ($1::uuid, $2::uuid, 'own_object', $3::uuid, $4::uuid, $5,
             'active', $6)
     returning id::text id`,
    [
      subject.owner.id,
      subject.id,
      source.id,
      source.owner.id,
      consent,
      randomUUID(),
    ],
  );
  return edge.rows[0]!.id;
}

/** An invitation as the provenance page writes one, dated `createdAt`. */
async function seedInvitation(
  subject: SeededObject,
  label: string,
  createdAt: Date,
) {
  const pending = await pool.query<{ id: string }>(
    `insert into lineage_pending_source_identities
       (created_by_user_id, display_label, invite_state, created_at, updated_at)
     values ($1::uuid, $2, 'pending', $3, $3)
     returning id::text id`,
    [subject.owner.id, label, createdAt],
  );
  const pendingIdentityId = pending.rows[0]!.id;
  const edge = await pool.query<{ id: string }>(
    `insert into lineage_provenance_edges
       (owner_user_id, subject_plant_object_id, source_kind,
        source_pending_identity_id, consent_state, erasure_state,
        client_mutation_id, created_at, updated_at)
     values ($1::uuid, $2::uuid, 'pending_identity', $3::uuid, 'proposed',
             'active', $4, $5, $5)
     returning id::text id`,
    [subject.owner.id, subject.id, pendingIdentityId, randomUUID(), createdAt],
  );
  const edgeId = edge.rows[0]!.id;
  return {
    pendingIdentityId,
    edgeId,
    token: mintLineageInviteToken({ pendingIdentityId, edgeId }, { createdAt }),
  };
}

async function readerContext(
  browser: Browser,
  baseURL: string,
  options: { javaScriptEnabled?: boolean } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...options,
  });
  contexts.push(context);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: MARKET_COOKIE, value: "ukraine", url: baseURL },
  ]);
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "declined");
    } catch {
      // Storage may be blocked; the banner is then simply drawn.
    }
  }, CONSENT_KEY);
  return context;
}

async function signInOnScreen(page: Page, gardener: Gardener) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="password"]') });
  await waitForHydration(form.locator('button[type="submit"]'));
  await form.locator('input[name="email"]').fill(gardener.email);
  await form
    .locator('input[name="password"]')
    .fill(SYNTHETIC_GARDENER_PASSWORD);
  await form.locator('button[type="submit"]').click();
}

/** A gardener's own browser, signed in through the screen. */
async function signedIn(browser: Browser, baseURL: string, gardener: Gardener) {
  const context = await readerContext(browser, baseURL);
  const page = await context.newPage();
  await page.goto("/auth/sign-in?next=%2Fgarden%2Flineage%2Fquestions", {
    waitUntil: "load",
  });
  await signInOnScreen(page, gardener);
  await page.waitForURL("**/garden/lineage/questions", { timeout: 30_000 });
  await page.close();
  return context;
}

async function setLocale(
  context: BrowserContext,
  baseURL: string,
  locale: Locale,
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: MARKET_COOKIE,
      value: locale === "bg" ? "bulgaria" : "ukraine",
      url: baseURL,
    },
  ]);
}

async function edgeRow(id: string) {
  const row = await pool.query<{
    consent_state: string;
    owner_user_id: string;
    source_owner_user_id: string | null;
    subject_owner: string;
    source_object_owner: string | null;
  }>(
    `select edges.consent_state, edges.owner_user_id::text,
            edges.source_owner_user_id::text,
            subjects.owner_user_id::text as subject_owner,
            sources.owner_user_id::text as source_object_owner
       from lineage_provenance_edges as edges
       join plant_objects as subjects on subjects.id = edges.subject_plant_object_id
       left join plant_objects as sources on sources.id = edges.source_plant_object_id
      where edges.id = $1::uuid`,
    [id],
  );
  return row.rows[0]!;
}

async function objectCount(owner: Gardener) {
  const row = await pool.query<{ count: string }>(
    `select count(*)::text as count from plant_objects where owner_user_id = $1::uuid`,
    [owner.id],
  );
  return Number(row.rows[0]!.count);
}

function passportPath(object: SeededObject) {
  return `/@${object.owner.handle}/objects/${object.slug}`;
}

async function isFocusedWithin(locator: Locator) {
  return locator.evaluate((element) =>
    element.contains(document.activeElement),
  );
}

async function openInvitation(page: Page, token: string) {
  // Opened from a message: a full load. A fragment change on the page
  // already open would be a same-document navigation, which no reader makes.
  await page.goto("about:blank");
  await page.goto(`${INVITATION_PATH}#token=${token}`, { waitUntil: "load" });
  // The handoff moves the token into a cookie and takes it off the address.
  await expect
    .poll(() => page.url(), { timeout: 20_000 })
    .not.toContain("token=");
  // Then the page says what the link is — visibly: a streamed state exists
  // in the document, hidden, before it is swapped in.
  await expect(
    page
      .locator(
        '[data-invitation-state]:not([data-invitation-state="preparing"]):visible, [data-lineage-outcome]:visible',
      )
      .first(),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("lineage as tasks between two named gardeners (OVE-495)", () => {
  test("a claim names who and what, says what each answer does, keeps a cancel safe, and shows the stored answer", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const guest = await readerContext(browser, baseURL!);
    // Анна's passport before: no confirmed link, so no lineage block at all.
    // Reading it here also caches it, so what follows proves an update.
    const before = await guest.request.get(passportPath(objects.annaTomato));
    expect(before.status()).toBe(200);
    expect(await before.text()).not.toContain('id="passport-provenance"');

    const page = await bohdanContext.newPage();
    await page.goto("/garden/lineage/claims", { waitUntil: "load" });
    await expect(
      page.locator('nav[data-lineage-sections="true"] a[aria-current="page"]'),
    ).toHaveText("Заявки");

    const card = page.locator(`[data-lineage-claim="${edges.tomato}"]`);
    await expect(card).toBeVisible();
    // Both objects are "Томат ove495": the sentence says whose each is.
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      `«Томат ${PREFIX}» походить від вашого «Томат ${PREFIX}»`,
    );
    const claimant = card.locator(`[data-lineage-gardener="${anna.handle}"]`);
    await expect(claimant).toHaveText(anna.displayName!);
    await expect(claimant).toHaveAttribute("href", `/@${anna.handle}`);
    await expect(card).toContainText(`@${anna.handle}`);
    await expect(card).toContainText("Заявлений об'єкт");
    await expect(
      card.locator(`a[href="/garden/objects/${objects.bohdanTomato.id}"]`),
    ).toHaveText(`Томат ${PREFIX}`);
    // Neither object is matched in the catalogue: no kind is invented.
    await expect(card).toContainText("Невідомий різновид");
    await expect(card).not.toContainText("Порода");
    await expect(card).toContainText("не генетичний аналіз");
    await expect(card).toContainText("Змінити відповідь потім не можна");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "claims-1280.png"),
      fullPage: true,
    });

    // Cancel is safe: the dialog closes, focus is back on the control, and
    // nothing is written.
    const confirm = card.locator(
      `[data-confirm-submit="lineage-claim-confirm-${edges.tomato}"]`,
    );
    await waitForHydration(confirm);
    await confirm.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator(
      `[data-confirm-submit-dialog="lineage-claim-confirm-${edges.tomato}"]`,
    );
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      `Підтвердити, що «Томат ${PREFIX}» походить від вашого «Томат ${PREFIX}»?`,
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "claim-confirm-dialog-1280.png"),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(confirm).toBeFocused();
    expect((await edgeRow(edges.tomato)).consent_state).toBe("proposed");

    // Confirm: the inbox reads the answer back, and focus moves to it.
    await confirm.click();
    await dialog.locator('button[type="submit"]').click();
    await page.waitForURL(
      `**/garden/lineage/claims?claim=${edges.tomato}&result=done`,
    );
    const outcome = page.locator('[data-lineage-outcome="confirmed"]');
    await expect(outcome).toContainText("Походження підтверджено");
    await expect(outcome).toContainText(
      `«Томат ${PREFIX}» походить від вашого «Томат ${PREFIX}»`,
    );
    await expect.poll(() => isFocusedWithin(outcome)).toBe(true);
    await expect(card).toHaveCount(0);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "claim-confirmed-1280.png"),
    });

    // The stored outcome: confirmed, one audit row, and nobody's object moved.
    const row = await edgeRow(edges.tomato);
    expect(row).toMatchObject({
      consent_state: "confirmed",
      owner_user_id: anna.id,
      source_owner_user_id: bohdan.id,
      subject_owner: anna.id,
      source_object_owner: bohdan.id,
    });
    const audit = await pool.query<{
      action: string;
      new_consent_state: string;
    }>(
      `select action, new_consent_state from lineage_provenance_edge_audit_events
        where edge_id = $1::uuid`,
      [edges.tomato],
    );
    expect(audit.rows).toEqual([
      { action: "confirm", new_consent_state: "confirmed" },
    ]);

    // The claimed object's public passport now shows where it came from —
    // the cache read above was updated, not waited out. Public lineage walks
    // ancestry, so Богдан's own passport shows nothing new.
    await expect
      .poll(
        async () => {
          const response = await guest.request.get(
            passportPath(objects.annaTomato),
          );
          return (await response.text()).includes('id="passport-provenance"');
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    const source = await guest.request.get(passportPath(objects.bohdanTomato));
    expect(await source.text()).not.toContain('id="passport-provenance"');
    const passport = await guest.newPage();
    await passport.goto(passportPath(objects.annaTomato), {
      waitUntil: "load",
    });
    const provenance = passport.locator("#passport-provenance");
    await expect(provenance.getByRole("heading", { level: 3 })).toHaveText(
      `«Томат ${PREFIX}» походить від «Томат ${PREFIX}»`,
    );
    // This page's own object is marked, and "confirmed" is said in words.
    await expect(provenance).toContainText("(цей об'єкт)");
    await expect(provenance).toContainText("Це підтвердили обидва садівники");
    await passport.screenshot({
      path: path.join(SCREENSHOTS, "passport-lineage-1280.png"),
      fullPage: true,
    });
    await passport.close();
    await page.close();
  });

  test("an answer given in another tab is not overwritten, and the claimant sees the decline", async () => {
    test.setTimeout(120_000);
    const first = await bohdanContext.newPage();
    const second = await bohdanContext.newPage();
    for (const page of [first, second]) {
      await page.goto("/garden/lineage/claims", { waitUntil: "load" });
      await expect(
        page.locator(`[data-lineage-claim="${edges.pepper}"]`),
      ).toBeVisible();
    }

    const decline = (page: Page) =>
      page.locator(
        `[data-confirm-submit="lineage-claim-decline-${edges.pepper}"]`,
      );
    await waitForHydration(decline(first));
    await decline(first).click();
    await first
      .locator(
        `[data-confirm-submit-dialog="lineage-claim-decline-${edges.pepper}"] button[type="submit"]`,
      )
      .click();
    await first.waitForURL(
      `**/garden/lineage/claims?claim=${edges.pepper}&result=done`,
    );
    await expect(
      first.locator('[data-lineage-outcome="declined"]'),
    ).toContainText("Заявку відхилено");
    expect((await edgeRow(edges.pepper)).consent_state).toBe("declined");

    // The second tab still shows the claim; confirming it there is refused
    // and says why, and the decline stands.
    const staleConfirm = second.locator(
      `[data-confirm-submit="lineage-claim-confirm-${edges.pepper}"]`,
    );
    await waitForHydration(staleConfirm);
    await staleConfirm.click();
    await second
      .locator(
        `[data-confirm-submit-dialog="lineage-claim-confirm-${edges.pepper}"] button[type="submit"]`,
      )
      .click();
    await second.waitForURL(
      `**/garden/lineage/claims?claim=${edges.pepper}&result=stale`,
    );
    const stale = second.locator('[data-lineage-outcome="stale"]');
    await expect(stale).toContainText("Відповідь не збережено");
    await expect(stale).toContainText("Ви вже відхилили цю заявку раніше");
    await expect(stale.locator('[role="alert"]')).toHaveCount(1);
    await expect.poll(() => isFocusedWithin(stale)).toBe(true);
    expect((await edgeRow(edges.pepper)).consent_state).toBe("declined");
    await second.screenshot({
      path: path.join(SCREENSHOTS, "claim-stale-1280.png"),
    });

    // Анна's own record says so, as the claim card promised.
    const claimant = await annaContext.newPage();
    await claimant.goto(`/garden/objects/${objects.annaPepper.id}/provenance`, {
      waitUntil: "load",
    });
    await expect(
      claimant.locator('[data-provenance-records="true"]'),
    ).toContainText("Походження відхилено");
    for (const page of [first, second, claimant]) await page.close();
  });

  test("a question names who asked and through which link, and its answer opens the composer on that object", async () => {
    test.setTimeout(90_000);
    const page = await bohdanContext.newPage();
    await page.goto("/garden/lineage/questions", { waitUntil: "load" });
    const card = page
      .locator("[data-lineage-question]")
      .filter({ hasText: `Як ви зберігали насіння взимку? ${PREFIX}` });
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      `Про ваш «М'ята ${PREFIX}»`,
    );
    await expect(
      card.locator(`[data-lineage-gardener="${anna.handle}"]`),
    ).toHaveText(anna.displayName!);
    await expect(card).toContainText(
      `Через зв'язок: «М'ята ${PREFIX}» походить від вашого «М'ята ${PREFIX}»`,
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "questions-1280.png"),
      fullPage: true,
    });

    const answer = card.getByRole("link", {
      name: `Відповісти записом про «М'ята ${PREFIX}»`,
    });
    await expect(answer).toHaveAttribute(
      "href",
      `/garden/new?object=${objects.bohdanMint.id}`,
    );
    await answer.click();
    await page.waitForURL(`**/garden/new?object=${objects.bohdanMint.id}`);
    const composer = page.locator('[data-entry-composer="true"]');
    await expect(composer).toBeVisible({ timeout: 20_000 });
    await expect(
      composer.locator('[data-entry-composer-destination-name="true"]'),
    ).toHaveText(`М'ята ${PREFIX}`);
    await page.close();
  });

  test("an invitation: written on the provenance page, refused to its writer, hidden from a guest, answered by the invitee, closed to a third account", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const bohdanObjectsBefore = await objectCount(bohdan);

    // Анна writes it where provenance is kept.
    const writer = await annaContext.newPage();
    await writer.goto(`/garden/objects/${objects.annaBasil.id}/provenance`, {
      waitUntil: "load",
    });
    const inviteForm = writer
      .locator("form")
      .filter({ has: writer.locator('input[name="pendingSourceLabel"]') });
    await waitForHydration(inviteForm.locator('button[type="submit"]'));
    await inviteForm
      .locator('input[name="pendingSourceLabel"]')
      .fill(`Насіння від Марії ${PREFIX}`);
    await inviteForm.locator('button[type="submit"]').click();
    const inviteLink = writer.getByRole("link", {
      name: "Відкрити приватне запрошення",
    });
    await expect(inviteLink).toBeVisible({ timeout: 20_000 });
    const href = (await inviteLink.getAttribute("href"))!;
    expect(href).toMatch(
      /^\/garden\/lineage\/invitations\/claim#token=v[12]\./u,
    );
    const token = href.split("#token=")[1]!;
    const pending = await pool.query<{ id: string; edge_id: string }>(
      `select identities.id::text, edges.id::text as edge_id
         from lineage_pending_source_identities as identities
         join lineage_provenance_edges as edges
           on edges.source_pending_identity_id = identities.id
        where identities.created_by_user_id = $1::uuid
          and identities.display_label = $2`,
      [anna.id, `Насіння від Марії ${PREFIX}`],
    );
    const invitation = pending.rows[0]!;

    // Its writer opens it: it is for the other gardener, with no controls.
    await openInvitation(writer, token);
    const own = writer.locator('[data-invitation-state="own"]');
    await expect(own).toContainText("Це ваше запрошення");
    await expect(writer.locator("[data-confirm-submit]")).toHaveCount(0);
    await writer.screenshot({
      path: path.join(SCREENSHOTS, "invitation-own-1280.png"),
    });
    await writer.close();

    // A guest sees nothing of it but the way to sign in.
    const guest = await readerContext(browser, baseURL!);
    const guestPage = await guest.newPage();
    await openInvitation(guestPage, token);
    const prompt = guestPage.locator('[data-invitation-state="guest"]');
    await expect(prompt).toContainText("Увійдіть, щоб відповісти");
    // `innerText` is what is rendered: the streamed skeletons are hidden.
    const guestText = await guestPage.locator("body").innerText();
    expect(guestText).not.toContain(`Базилік ${PREFIX}`);
    expect(guestText).not.toContain(`Насіння від Марії ${PREFIX}`);
    expect(guestText).not.toContain(anna.displayName!);

    // Signing in as the invitee returns to it, with the decision focused.
    await prompt.getByRole("link").click();
    await guestPage.waitForURL("**/auth/sign-in**");
    await signInOnScreen(guestPage, bohdan);
    await guestPage.waitForURL(`**${INVITATION_PATH}**`, { timeout: 30_000 });
    const ready = guestPage.locator('[data-invitation-state="ready"]');
    await expect(ready.getByRole("heading", { level: 2 })).toHaveText(
      `Чи походить «Базилік ${PREFIX}» від вас?`,
    );
    await expect(
      ready.locator(`[data-lineage-gardener="${anna.handle}"]`),
    ).toHaveText(anna.displayName!);
    await expect(ready).toContainText(`Насіння від Марії ${PREFIX}`);
    await expect(ready).toContainText("Публічно не з'явиться нічого");
    const accept = ready.locator(
      '[data-confirm-submit="lineage-invitation-confirm"]',
    );
    await expect(accept).toBeFocused({ timeout: 15_000 });
    expect(guestPage.url()).not.toContain("token");
    await guestPage.screenshot({
      path: path.join(SCREENSHOTS, "invitation-ready-1280.png"),
      fullPage: true,
    });

    await accept.click();
    await guestPage
      .locator(
        '[data-confirm-submit-dialog="lineage-invitation-confirm"] button[type="submit"]',
      )
      .click();
    await guestPage.waitForURL(`**${INVITATION_PATH}?result=done`);
    const confirmed = guestPage.locator('[data-lineage-outcome="confirmed"]');
    await expect(confirmed).toContainText("Ви підтвердили походження");
    await expect.poll(() => isFocusedWithin(confirmed)).toBe(true);

    // Exactly the relationship changed: the record is confirmed and names
    // the invitee. The object is still Анна's, Богдан gained nothing.
    const stored = await pool.query<{
      consent_state: string;
      invite_state: string;
      claimed_by_user_id: string;
      subject_owner: string;
    }>(
      `select edges.consent_state, identities.invite_state,
              identities.claimed_by_user_id::text,
              subjects.owner_user_id::text as subject_owner
         from lineage_provenance_edges as edges
         join lineage_pending_source_identities as identities
           on identities.id = edges.source_pending_identity_id
         join plant_objects as subjects
           on subjects.id = edges.subject_plant_object_id
        where edges.id = $1::uuid`,
      [invitation.edge_id],
    );
    expect(stored.rows[0]).toEqual({
      consent_state: "confirmed",
      invite_state: "claimed",
      claimed_by_user_id: bohdan.id,
      subject_owner: anna.id,
    });
    expect(await objectCount(bohdan)).toBe(bohdanObjectsBefore);

    // A third account with the same link: already answered, no controls.
    const third = await curiousContext.newPage();
    await openInvitation(third, token);
    await expect(
      third.locator('[data-invitation-state="answered-by-other"]'),
    ).toContainText("На це запрошення вже відповіли");
    await expect(third.locator("[data-confirm-submit]")).toHaveCount(0);
    await third.close();

    // Анна's record now says who answered it, not "waiting".
    const record = await annaContext.newPage();
    await record.goto(`/garden/objects/${objects.annaBasil.id}/provenance`, {
      waitUntil: "load",
    });
    const records = record.locator('[data-provenance-records="true"]');
    await expect(records).toContainText(
      `Походить від Насіння від Марії ${PREFIX}`,
    );
    await expect(records).toContainText("Походження підтверджено");
    await expect(records).toContainText("прийнято");
    await record.close();
    await guestPage.close();
  });

  test("expired, broken and missing links each say what they are, and the writer is told the link expired", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const created = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const expired = await seedInvitation(
      objects.annaDill,
      `Старе насіння ${PREFIX}`,
      created,
    );

    const writer = await annaContext.newPage();
    await writer.goto(`/garden/objects/${objects.annaDill.id}/provenance`, {
      waitUntil: "load",
    });
    await expect(
      writer.locator('[data-invite-link-expired="true"]'),
    ).toContainText("Посилання вже не діє");
    await expect(
      writer.getByRole("link", { name: "Відкрити приватне запрошення" }),
    ).toHaveCount(0);
    await writer.close();

    const page = await curiousContext.newPage();
    await openInvitation(page, expired.token);
    await expect(
      page.locator('[data-invitation-state="expired"]'),
    ).toContainText("Термін дії запрошення минув");
    await page.screenshot({
      path: path.join(SCREENSHOTS, "invitation-expired-1280.png"),
    });

    await openInvitation(page, "v2.0.bm90LWEtdG9rZW4.c2lnbmF0dXJl");
    await expect(
      page.locator('[data-invitation-state="invalid"]'),
    ).toContainText("Посилання не вдалося перевірити");
    await page.close();

    // No link at all, on a device holding none.
    const bare = await (await readerContext(browser, baseURL!)).newPage();
    await bare.goto(INVITATION_PATH, { waitUntil: "load" });
    await expect(
      bare.locator('[data-invitation-state="missing"]'),
    ).toContainText("Відкрийте посилання із запрошення");
    await bare.close();
    // Nothing was answered.
    const row = await pool.query<{ invite_state: string }>(
      `select invite_state from lineage_pending_source_identities where id = $1::uuid`,
      [expired.pendingIdentityId],
    );
    expect(row.rows[0]!.invite_state).toBe("pending");
  });

  test("an acceptance that loses the race writes nothing and says why", async () => {
    test.setTimeout(120_000);
    const invitation = await seedInvitation(
      objects.annaCucumber,
      `Розсада з ярмарку ${PREFIX}`,
      new Date(),
    );

    const late = await bohdanContext.newPage();
    await openInvitation(late, invitation.token);
    const accept = late.locator(
      '[data-confirm-submit="lineage-invitation-confirm"]',
    );
    await expect(accept).toBeVisible();
    await waitForHydration(accept);

    // Another account answers it first, through its own page.
    const first = await curiousContext.newPage();
    await openInvitation(first, invitation.token);
    await first
      .locator('[data-confirm-submit="lineage-invitation-confirm"]')
      .click();
    await first
      .locator(
        '[data-confirm-submit-dialog="lineage-invitation-confirm"] button[type="submit"]',
      )
      .click();
    await first.waitForURL(`**${INVITATION_PATH}?result=done`);
    await first.close();

    await accept.click();
    await late
      .locator(
        '[data-confirm-submit-dialog="lineage-invitation-confirm"] button[type="submit"]',
      )
      .click();
    await late.waitForURL(`**${INVITATION_PATH}?result=stale`);
    const refused = late.locator('[data-lineage-outcome="stale"]');
    await expect(refused).toContainText(
      "Відповідь не збережено. На це запрошення вже відповіли",
    );
    await expect.poll(() => isFocusedWithin(refused)).toBe(true);
    await late.screenshot({
      path: path.join(SCREENSHOTS, "invitation-refused-1280.png"),
    });

    const stored = await pool.query<{
      invite_state: string;
      claimed_by_user_id: string;
    }>(
      `select invite_state, claimed_by_user_id::text
         from lineage_pending_source_identities where id = $1::uuid`,
      [invitation.pendingIdentityId],
    );
    expect(stored.rows[0]).toEqual({
      invite_state: "claimed",
      claimed_by_user_id: curious.id,
    });
    await late.close();
  });

  test("a newer link replaces the invitation this device already holds", async () => {
    test.setTimeout(90_000);
    const older = await seedInvitation(
      objects.annaTomato,
      `Перше запрошення ${PREFIX}`,
      new Date(),
    );
    const newer = await seedInvitation(
      objects.annaMint,
      `Друге запрошення ${PREFIX}`,
      new Date(),
    );
    const page = await bohdanContext.newPage();
    await openInvitation(page, older.token);
    await expect(page.locator('[data-invitation-state="ready"]')).toContainText(
      `Перше запрошення ${PREFIX}`,
    );
    await openInvitation(page, newer.token);
    await expect(page.locator('[data-invitation-state="ready"]')).toContainText(
      `Друге запрошення ${PREFIX}`,
    );
    await expect(page.locator("body")).not.toContainText(
      `Перше запрошення ${PREFIX}`,
    );
    await page.close();
  });

  test("the passport: a guest reads whose it is and no owner control; its gardener gets a write to it", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const guest = await readerContext(browser, baseURL!);
    const page = await guest.newPage();
    await page.goto(passportPath(objects.bohdanTomato), { waitUntil: "load" });
    // The gardener's crumbs, not the catalogue's.
    await expect(
      page.locator(`a[href="/@${bohdan.handle}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`a[href="/@${bohdan.handle}?tab=objects"]`),
    ).toHaveCount(1);
    await expect(page.locator("[data-passport-owner-bar]")).toHaveCount(0);
    // An object with no confirmed link has no lineage block at all.
    const alone = await guest.request.get(passportPath(objects.bohdanUnlinked));
    expect(await alone.text()).not.toContain('id="passport-provenance"');
    await page.close();

    // The static document carries the link for a reader without scripts.
    const bytes = await guest.request.get(passportPath(objects.annaTomato));
    const html = await bytes.text();
    expect(html).toContain('id="passport-provenance"');
    expect(html).not.toContain("data-passport-owner-bar");

    // Its own gardener gets the two ways to it; the other gardener does not.
    const owner = await bohdanContext.newPage();
    await owner.goto(passportPath(objects.bohdanTomato), { waitUntil: "load" });
    const bar = owner.locator('[data-passport-owner-bar="true"]');
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(bar.getByRole("link").first()).toHaveAttribute(
      "href",
      `/garden/new?object=${objects.bohdanTomato.id}`,
    );
    await owner.screenshot({
      path: path.join(SCREENSHOTS, "passport-owner-1280.png"),
      fullPage: true,
    });
    await owner.close();

    const other = await annaContext.newPage();
    // `load` waits for the whole streamed document, owner region included.
    await other.goto(passportPath(objects.bohdanTomato), { waitUntil: "load" });
    await expect(other.locator("[data-passport-owner-bar]")).toHaveCount(0);
    await other.close();
  });

  test("axe finds nothing, and nothing scrolls sideways, in UK, BG and RU at 320 and 1280 px", async ({
    baseURL,
  }, testInfo) => {
    test.setTimeout(240_000);
    const ready = await seedInvitation(
      objects.annaPepper,
      `Насіння з довгою назвою джерела, яке не вміщується в рядок ${PREFIX}`,
      new Date(),
    );
    const page = await bohdanContext.newPage();
    await openInvitation(page, ready.token);
    await expect(page.locator('[data-invitation-state="ready"]')).toBeVisible();

    for (const locale of ["uk", "bg", "ru"] as const) {
      await setLocale(bohdanContext, baseURL!, locale);
      for (const width of [320, 1280] as const) {
        await page.setViewportSize({ width, height: 900 });
        for (const [label, address, marker] of [
          [
            "claims",
            "/garden/lineage/claims",
            `[data-lineage-claim="${edges.cucumber}"]`,
          ],
          ["questions", "/garden/lineage/questions", "[data-lineage-question]"],
          ["invitation", INVITATION_PATH, '[data-invitation-state="ready"]'],
        ] as const) {
          await page.goto(address, { waitUntil: "load" });
          await expect(page.locator(marker).first()).toBeVisible();
          await expect(
            page.locator(
              "main[data-workspace-surface]:not([data-workspace-state])",
            ),
          ).toHaveAttribute("lang", locale);
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow, `${label} ${locale} ${width}`).toBeLessThanOrEqual(
            0,
          );
          await scanAccessibility(
            page,
            testInfo,
            `${label}-${locale}-${width}`,
          );
          if (width === 320) {
            await page.screenshot({
              path: path.join(SCREENSHOTS, `${label}-${locale}-320.png`),
              fullPage: true,
            });
          }
        }
      }
    }
    await setLocale(bohdanContext, baseURL!, "uk");
    await page.close();
  });
});
