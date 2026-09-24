import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";

import { waitForHydration } from "./helpers/hydration";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import { cleanupCollection, seedCollection } from "./helpers/redesign-fixtures";
import {
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The six writing journeys of the redesign, end to end, on one gardener with
 * a collection of three spaces and a hundred plants — three of them called
 * the same thing in three different spaces (`OVE-478` criteria 8 and 11,
 * `docs/audits/2026-09-21-product-design/FAST_ENTRY.md`):
 *
 * 1. a note for one of the same-named tomatoes, from global Write;
 * 2. a weather note for a space, from the space's own page;
 * 3. a change of destination after the text and a photograph are in;
 * 4. a plant (then an animal in a new space) created while writing;
 * 5. a publish that fails — before it reached the server, and after it had
 *    committed with the answer lost — and is retried;
 * 6. finding the published entry again.
 *
 * Each journey counts its **activations**: the presses and choices a reader
 * makes before writing and to publish. Typing and picking a photograph are
 * counted apart, as the budgets in FAST_ENTRY.md do. Every acknowledged
 * publish is read back from the database — the destination the entry
 * actually landed on, never a toast — and the suite ends by asserting that
 * no entry landed anywhere else and none was written twice. These are
 * fixture observations on a synthetic garden, not research with gardeners.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=writing-journeys.spec.ts
 */

type Locale = "uk" | "bg" | "ru";

interface Journey {
  journey: string;
  locale: Locale;
  viewport: string;
  activationsBeforeWriting: number;
  activationsToPublish: number;
  steps: string[];
  destination: string;
  acknowledged: boolean;
}

const DESKTOP = { width: 1_280, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const STAGING_ORIGIN = "https://media-stage.over.garden";

let pool: Pool;
let gardener: SyntheticGardener;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let collection: Awaited<ReturnType<typeof seedCollection>>;
/** The three same-named tomatoes, one per space, in space order. */
let tomatoes: Array<{ id: string; spaceId: string; spaceName: string }> = [];
/** What each acknowledged publish wrote, to check the whole run at the end. */
const acknowledged: Array<{
  body: string;
  objectId?: string;
  spaceId?: string;
}> = [];
const journeys: Journey[] = [];

test.describe.configure({ mode: "serial" });
test.use({ trace: "retain-on-failure" });

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);
  const context = await browser.newContext();
  try {
    gardener = await signInSyntheticGardener({
      baseURL: baseURL!,
      context,
      pool,
      prefix: "ove478-journeys",
    });
    cookies = await context.cookies();
  } finally {
    await context.close();
  }
  collection = await seedCollection(pool, gardener.id, {
    spaces: 3,
    objects: 100,
  });
  // The fixture names the first object of every space alike, on purpose:
  // identity is the id, and the reader must see which space is which.
  tomatoes = collection.spaces.map((space, index) => ({
    id: collection.objects[index]!.id,
    spaceId: space.id,
    spaceName: space.name,
  }));
});

test.afterAll(async () => {
  const out = path.join(process.cwd(), "test-results", "writing-journeys");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "journeys.json"),
    `${JSON.stringify(journeys, null, 2)}\n`,
  );
  if (gardener) await cleanupCollection(pool, gardener.id);
  await pool?.end();
});

async function readerPage(
  browser: import("playwright/test").Browser,
  baseURL: string,
  locale: Locale,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...cookies,
  ]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("overgarden:analytics-consent", "declined");
    } catch {
      // Storage blocked: the notice shows and the journey still runs.
    }
  });
  return { context, page: await context.newPage() };
}

async function composerOn(page: Page) {
  const composer = page.locator('[data-entry-composer="true"]');
  await expect(composer).toBeVisible({ timeout: 20_000 });
  await waitForHydration(composer);
  await expect(
    composer.locator('[data-structured-journal-composer="true"]'),
  ).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  return composer;
}

function editorOf(composer: Locator) {
  return composer
    .locator("[data-lexical-journal-canvas] [contenteditable='true']")
    .first();
}

async function write(page: Page, composer: Locator, text: string) {
  await editorOf(composer).click();
  await page.keyboard.type(text);
  await expect(editorOf(composer)).toContainText(text);
}

async function acceptDisclosure(composer: Locator) {
  const disclosure = composer.locator(
    'input[name="publicationDisclosureAccepted"]',
  );
  if ((await disclosure.count()) > 0) await disclosure.check();
}

async function entriesWithBody(body: string) {
  const rows = await pool.query<{
    id: string;
    plant_object_id: string | null;
    space_id: string;
    entry_scope: string;
  }>(
    `select id, plant_object_id, space_id, entry_scope from journal_entries
      where owner_user_id = $1 and body like $2`,
    [gardener.id, `%${body}%`],
  );
  return rows.rows;
}

/** A phone's photograph, made in the browser: no real image leaves it. */
async function photograph(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#2f6b2f";
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = "#c9b037";
    context.fillRect(200, 200, 600, 400);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), "image/jpeg", 0.9),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

/**
 * The staging session route and the Worker, answered here: a local run
 * cannot sign for `media-stage.over.garden`. What this proves is what the
 * browser sends; the server's claim of the uploads is the unchanged ADR-0019
 * contract, proven against a local Worker in `OVE-487-PROOF.md`.
 */
async function fakeStaging(context: BrowserContext) {
  const token = () => randomBytes(36).toString("base64url");
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "PUT, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "*",
  };
  await context.route("**/api/media/staging/sessions", async (route) => {
    const { stagingSessionId } = route.request().postDataJSON() as {
      stagingSessionId: string;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stagingSessionId,
        sessionCapability: token(),
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      }),
    });
  });
  await context.route(`${STAGING_ORIGIN}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: cors,
      contentType: "application/json",
      body: JSON.stringify({
        status: "staged",
        stagingReceipt: token(),
        deleteCapability: token(),
      }),
    });
  });
}

test("1 · same-named tomato: global Write, the greenhouse one by its space, one acknowledged entry (UK, 1280)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { context, page } = await readerPage(browser, baseURL!, "uk", DESKTOP);
  const steps: string[] = [];
  const target = tomatoes[1]!;
  const body = "Перші квіти на нижній китиці — журнал 1";
  try {
    await page.goto("/garden", { waitUntil: "load" });
    const writeAction = page
      .locator('[data-site-shell-action="new-entry"]')
      .filter({ visible: true })
      .first();
    await waitForHydration(writeAction);
    await writeAction.click();
    steps.push("Write (shell)");
    await page.waitForURL(/\/garden\/new$/u);
    const composer = await composerOn(page);
    const picker = composer.getByRole("combobox").first();
    await expect(picker).toBeFocused();
    await picker.fill("Томат");
    // Three tomatoes, told apart by the space each is in.
    const options = composer
      .getByRole("option")
      .filter({ hasText: "Томат / Домат / Tomato" });
    await expect(options).toHaveCount(3);
    await options.filter({ hasText: target.spaceName }).first().click();
    steps.push("choose the tomato in its space");
    await expect(composer).toContainText(target.spaceName);
    await write(page, composer, body);
    await acceptDisclosure(composer);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    steps.push("Publish");
    await page.waitForURL(new RegExp(`/garden/objects/${target.id}$`, "u"), {
      timeout: 30_000,
    });
    const rows = await entriesWithBody(body);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entry_scope: "object",
      plant_object_id: target.id,
      space_id: target.spaceId,
    });
    acknowledged.push({ body, objectId: target.id });
    journeys.push({
      journey: "same-name object note",
      locale: "uk",
      viewport: "1280",
      activationsBeforeWriting: 2,
      activationsToPublish: 1,
      steps,
      destination: `object ${target.id} in "${target.spaceName}"`,
      acknowledged: true,
    });
  } finally {
    await context.close();
  }
});

test("2 · space weather note: one activation from the space, the space's own entry (BG, 390)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { context, page } = await readerPage(browser, baseURL!, "bg", PHONE);
  const steps: string[] = [];
  const space = collection.spaces[0]!;
  const tomato = tomatoes[0]!;
  const body = "Слана тази нощ, минус две — дневник 2";
  try {
    await page.goto(`/garden/spaces/${space.id}`, { waitUntil: "load" });
    const writeAction = page.locator('[data-space-action="write"]');
    await waitForHydration(writeAction);
    await writeAction.click();
    steps.push("Write (space)");
    await expect(page).toHaveURL(/\/garden\/new\?space=/u);
    const composer = await composerOn(page);
    await expect(
      composer.locator('[data-entry-composer-destination-name="true"]'),
    ).toHaveText(space.name);
    await write(page, composer, body);
    // The server's contract for a space entry: it mentions one to twelve of
    // the space's own plants. A decision the reader makes, so it is counted.
    const mentions = composer.locator('[data-entry-composer-mentions="true"]');
    await mentions.getByRole("searchbox").fill("Томат");
    await mentions
      .getByRole("checkbox", { name: /Томат \/ Домат \/ Tomato/u })
      .first()
      .check();
    steps.push("mention one plant (required for a space entry)");
    await acceptDisclosure(composer);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    steps.push("Publish");
    await page.waitForURL(new RegExp(`/garden/spaces/${space.id}`, "u"), {
      timeout: 30_000,
    });
    const rows = await entriesWithBody(body);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entry_scope: "space",
      space_id: space.id,
      plant_object_id: null,
    });
    const mentioned = await pool.query<{ plant_object_id: string }>(
      `select plant_object_id from journal_entry_object_mentions
        where journal_entry_id = $1`,
      [rows[0]!.id],
    );
    expect(mentioned.rows.map((row) => row.plant_object_id)).toEqual([
      tomato.id,
    ]);
    acknowledged.push({ body, spaceId: space.id });
    journeys.push({
      journey: "space weather note",
      locale: "bg",
      viewport: "390",
      activationsBeforeWriting: 1,
      activationsToPublish: 2,
      steps,
      destination: `space ${space.id} (mentions ${tomato.id})`,
      acknowledged: true,
    });
  } finally {
    await context.close();
  }
});

test("3 · change of destination after the text and a photograph: both kept, the request names the new one (RU, 1280)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const { context, page } = await readerPage(browser, baseURL!, "ru", DESKTOP);
  const steps: string[] = [];
  const from = tomatoes[0]!;
  const to = tomatoes[2]!;
  const body = "Пятна на листьях после ливня — журнал 3";
  try {
    await fakeStaging(context);
    let sent: Record<string, unknown> | null = null;
    await context.route("**/api/garden/entries", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      sent = route.request().postDataJSON() as Record<string, unknown>;
      // Read, then refused: promoting staged media is the Worker's, which a
      // local run cannot sign for.
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "service_unavailable" }),
      });
    });
    await page.goto(`/garden/new?object=${from.id}`, { waitUntil: "load" });
    steps.push("Write (object)");
    const composer = await composerOn(page);
    await write(page, composer, body);
    const chooser = page.waitForEvent("filechooser");
    await composer.locator('[data-journal-tool="photo"]').click();
    await (
      await chooser
    ).setFiles([
      {
        name: "leaf.jpg",
        mimeType: "image/jpeg",
        buffer: await photograph(page),
      },
    ]);
    const image = composer
      .locator("[data-lexical-journal-image-content]")
      .first();
    await expect(image).toBeVisible({ timeout: 20_000 });

    await composer.locator('[data-entry-composer-change="true"]').click();
    steps.push("Change");
    await composer.getByRole("combobox").first().fill("Томат");
    await composer
      .getByRole("option")
      .filter({ hasText: to.spaceName })
      .first()
      .click();
    steps.push("choose the other tomato");
    // Nothing was reset: the text, the photograph, and the new destination.
    await expect(editorOf(composer)).toContainText(body);
    await expect(image).toBeVisible();
    await expect(composer).toContainText(to.spaceName);

    await acceptDisclosure(composer);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    steps.push("Publish");
    await expect.poll(() => sent, { timeout: 30_000 }).not.toBeNull();
    const request = sent as unknown as {
      context: { target: string; plantObjectId: string };
      document: { blocks: Array<{ type: string }> };
      mediaClaimReceipts: string[];
    };
    expect(request.context).toMatchObject({
      target: "plant_object_entry",
      plantObjectId: to.id,
    });
    expect(
      request.document.blocks.some((block) => block.type === "image"),
    ).toBe(true);
    expect(request.mediaClaimReceipts.length).toBeGreaterThan(0);
    // Refused: said so, nothing lost, nothing written.
    await expect(
      composer.locator('[data-entry-composer-message="true"]'),
    ).not.toBeEmpty();
    await expect(editorOf(composer)).toContainText(body);
    expect(await entriesWithBody(body)).toHaveLength(0);
    journeys.push({
      journey: "change destination after text and photograph",
      locale: "ru",
      viewport: "1280",
      activationsBeforeWriting: 1,
      activationsToPublish: 3,
      steps,
      destination: `request for object ${to.id} (was ${from.id}); promotion refused locally`,
      acknowledged: false,
    });
  } finally {
    await context.close();
  }
});

test("4 · a plant created while writing, then an animal in a new space: each with its first entry, in one transaction (UK, 390)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const { context, page } = await readerPage(browser, baseURL!, "uk", PHONE);
  const space = collection.spaces[2]!;
  const spacesBefore = await pool.query<{ count: string }>(
    "select count(*)::text as count from spaces where owner_user_id = $1",
    [gardener.id],
  );
  try {
    // A plant, in one of the gardener's spaces.
    const steps: string[] = [];
    const body = "Посадила малину біля паркану — журнал 4";
    await page.goto("/garden/new", { waitUntil: "load" });
    steps.push("Write");
    let composer = await composerOn(page);
    await composer.getByRole("combobox").first().fill("Малина");
    await composer.locator('[data-owned-destination-create="true"]').click();
    steps.push("New plant or animal «Малина»");
    const created = composer.locator('[data-entry-composer-new-object="true"]');
    await expect(created).toBeVisible();
    await expect(
      created.locator('[data-entry-composer-new-object-name="true"]'),
    ).toHaveValue("Малина");
    const spacePicker = created.locator(
      '[data-owned-destination-picker="space"]',
    );
    await spacePicker.getByRole("combobox").fill(space.name.slice(0, 24));
    await spacePicker.getByRole("option").first().click();
    steps.push("choose its space");
    await write(page, composer, body);
    await acceptDisclosure(composer);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    steps.push("Publish");
    await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u, {
      timeout: 30_000,
    });
    const raspberry = await pool.query<{
      id: string;
      space_id: string;
      object_kind: string;
    }>(
      `select id, space_id, object_kind from plant_objects
        where owner_user_id = $1 and display_name = 'Малина'`,
      [gardener.id],
    );
    expect(raspberry.rows).toHaveLength(1);
    expect(raspberry.rows[0]).toMatchObject({
      space_id: space.id,
      object_kind: "plant",
    });
    expect(page.url()).toContain(`/garden/objects/${raspberry.rows[0]!.id}`);
    const rows = await entriesWithBody(body);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      plant_object_id: raspberry.rows[0]!.id,
      space_id: space.id,
    });
    acknowledged.push({ body, objectId: raspberry.rows[0]!.id });
    journeys.push({
      journey: "create a plant while writing",
      locale: "uk",
      viewport: "390",
      activationsBeforeWriting: 3,
      activationsToPublish: 1,
      steps,
      destination: `new object ${raspberry.rows[0]!.id} in "${space.name}"`,
      acknowledged: true,
    });
    const spacesAfter = await pool.query<{ count: string }>(
      "select count(*)::text as count from spaces where owner_user_id = $1",
      [gardener.id],
    );
    expect(spacesAfter.rows[0]!.count).toBe(spacesBefore.rows[0]!.count);

    // An animal, in a space named on the way.
    const animalSteps: string[] = [];
    const animalBody = "Перші яйця від нових курей — журнал 4б";
    await page.goto("/garden/new", { waitUntil: "load" });
    animalSteps.push("Write");
    composer = await composerOn(page);
    await composer.getByRole("combobox").first().fill("Кури");
    await composer.locator('[data-owned-destination-create="true"]').click();
    animalSteps.push("New plant or animal «Кури»");
    const animal = composer.locator('[data-entry-composer-new-object="true"]');
    await animal.getByRole("radio", { name: "Тварина" }).check();
    animalSteps.push("animal");
    await animal.getByRole("radio", { name: "У новому просторі" }).check();
    animalSteps.push("in a new space");
    await animal
      .locator('[data-entry-composer-new-space-name="true"]')
      .fill("Курник");
    await write(page, composer, animalBody);
    await acceptDisclosure(composer);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    animalSteps.push("Publish");
    await page.waitForURL(/\/garden\/objects\/[0-9a-f-]{36}$/u, {
      timeout: 30_000,
    });
    const hens = await pool.query<{
      id: string;
      object_kind: string;
      space_name: string;
      space_id: string;
    }>(
      `select o.id, o.object_kind, s.display_name as space_name, s.id as space_id
         from plant_objects o join spaces s on s.id = o.space_id
        where o.owner_user_id = $1 and o.display_name = 'Кури'`,
      [gardener.id],
    );
    expect(hens.rows).toHaveLength(1);
    expect(hens.rows[0]).toMatchObject({
      object_kind: "animal",
      space_name: "Курник",
    });
    const animalRows = await entriesWithBody(animalBody);
    expect(animalRows).toHaveLength(1);
    expect(animalRows[0]).toMatchObject({ plant_object_id: hens.rows[0]!.id });
    acknowledged.push({ body: animalBody, objectId: hens.rows[0]!.id });
    journeys.push({
      journey: "create an animal in a new space while writing",
      locale: "uk",
      viewport: "390",
      activationsBeforeWriting: 4,
      activationsToPublish: 1,
      steps: animalSteps,
      destination: `new object ${hens.rows[0]!.id} in new space "Курник"`,
      acknowledged: true,
    });
  } finally {
    await context.close();
  }
});

test("5 · a failed publish is retried with nothing lost and nothing doubled — before the server, and after it committed (BG, 1280)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const { context, page } = await readerPage(browser, baseURL!, "bg", DESKTOP);
  const target = tomatoes[1]!;
  try {
    // (a) The request never reaches the server.
    const lostBody = "Връзката прекъсна преди сървъра — дневник 5а";
    await page.goto(`/garden/new?object=${target.id}`, { waitUntil: "load" });
    let composer = await composerOn(page);
    await write(page, composer, lostBody);
    await acceptDisclosure(composer);
    let attempts = 0;
    await page.route("**/api/garden/entries", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts += 1;
      if (attempts === 1) return route.abort("connectionreset");
      return route.continue();
    });
    await composer.locator('[data-entry-composer-publish="true"]').click();
    await expect(
      composer.locator('[data-entry-composer-message="true"]'),
    ).not.toBeEmpty({ timeout: 30_000 });
    await expect(editorOf(composer)).toContainText(lostBody);
    expect(await entriesWithBody(lostBody)).toHaveLength(0);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    await page.waitForURL(new RegExp(`/garden/objects/${target.id}$`, "u"), {
      timeout: 30_000,
    });
    expect(attempts).toBe(2);
    expect(await entriesWithBody(lostBody)).toHaveLength(1);
    acknowledged.push({ body: lostBody, objectId: target.id });
    await page.unrouteAll({ behavior: "wait" });

    // (b) The server committed and the answer was lost: the retry is the same
    // request (the same publish id), which the server answers from the entry
    // it already has.
    const committedBody = "Сървърът записа, отговорът се изгуби — дневник 5б";
    await page.goto(`/garden/new?object=${target.id}`, { waitUntil: "load" });
    composer = await composerOn(page);
    await write(page, composer, committedBody);
    await acceptDisclosure(composer);
    const publishIds: string[] = [];
    await page.route("**/api/garden/entries", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      publishIds.push(
        (route.request().postDataJSON() as { publishId: string }).publishId,
      );
      if (publishIds.length === 1) {
        await route.fetch();
        return route.abort("connectionreset");
      }
      return route.continue();
    });
    await composer.locator('[data-entry-composer-publish="true"]').click();
    await expect(
      composer.locator('[data-entry-composer-message="true"]'),
    ).not.toBeEmpty({ timeout: 30_000 });
    await expect(editorOf(composer)).toContainText(committedBody);
    await composer.locator('[data-entry-composer-publish="true"]').click();
    await page.waitForURL(new RegExp(`/garden/objects/${target.id}$`, "u"), {
      timeout: 30_000,
    });
    expect(publishIds).toHaveLength(2);
    expect(publishIds[1]).toBe(publishIds[0]);
    expect(await entriesWithBody(committedBody)).toHaveLength(1);
    acknowledged.push({ body: committedBody, objectId: target.id });
    journeys.push({
      journey: "failed publish recovery",
      locale: "bg",
      viewport: "1280",
      activationsBeforeWriting: 1,
      activationsToPublish: 2,
      steps: [
        "Write (object)",
        "Publish → connection reset before the server",
        "Publish again → acknowledged once",
        "Write (object)",
        "Publish → committed, answer lost",
        "Publish again → same publish id, answered from the committed entry",
      ],
      destination: `object ${target.id}; one row per note`,
      acknowledged: true,
    });
  } finally {
    await context.close();
  }
});

test("6 · the published entry is found again: My garden's search, the object's history, the permalink (RU, 390)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { context, page } = await readerPage(browser, baseURL!, "ru", PHONE);
  const target = tomatoes[1]!;
  const steps: string[] = [];
  try {
    await page.goto("/garden", { waitUntil: "load" });
    const search = page.locator('input[name="q"]');
    await waitForHydration(search);
    await search.fill("Tomato");
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("q") === "Tomato"),
      search.press("Enter"),
    ]);
    steps.push("search My garden");
    const row = page.locator(`#garden-object-${target.id}`);
    await expect(row).toContainText(target.spaceName);
    await row.locator("a").first().click();
    steps.push("open the tomato");
    await page.waitForURL(new RegExp(`/garden/objects/${target.id}$`, "u"));
    const first = page
      .locator('article[id^="passport-entry-"]')
      .filter({ hasText: "журнал 1" })
      .first();
    await expect(first).toBeVisible({ timeout: 20_000 });
    const permalink = first.locator("h3 a");
    const href = await permalink.getAttribute("href");
    expect(href).toMatch(/^\/@[a-z0-9_]+\/post\/\d+$/u);
    await permalink.click();
    steps.push("open the entry");
    await expect(page).toHaveURL(new RegExp(`${href}$`, "u"));
    await expect(page.locator("main")).toContainText(
      "Перші квіти на нижній китиці",
    );
    journeys.push({
      journey: "find the published entry",
      locale: "ru",
      viewport: "390",
      activationsBeforeWriting: 0,
      activationsToPublish: 0,
      steps,
      destination: href!,
      acknowledged: true,
    });
  } finally {
    await context.close();
  }
});

test("no entry landed anywhere but where it was sent, and none twice", async () => {
  const rows = await pool.query<{
    body: string;
    plant_object_id: string | null;
    space_id: string;
  }>(
    `select body, plant_object_id, space_id from journal_entries
      where owner_user_id = $1 and lifecycle_state = 'active'`,
    [gardener.id],
  );
  expect(rows.rows).toHaveLength(acknowledged.length);
  for (const expected of acknowledged) {
    const matching = rows.rows.filter((row) =>
      row.body.includes(expected.body),
    );
    expect(matching, expected.body).toHaveLength(1);
    if (expected.objectId)
      expect(matching[0]!.plant_object_id).toBe(expected.objectId);
    if (expected.spaceId) {
      expect(matching[0]!.space_id).toBe(expected.spaceId);
      expect(matching[0]!.plant_object_id).toBeNull();
    }
  }
});
