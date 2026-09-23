import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { waitForHydration } from "./helpers/hydration";
import {
  OWNER_BROWSER_FIXTURE,
  OWNER_BROWSER_FIXTURE_ENV,
  signInOwnerFixture,
} from "./helpers/owner-fixture";
import {
  scanAccessibility,
  tabToControl,
} from "./helpers/redesign-accessibility";

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
 *      Action endpoint, exactly as a browser without scripts would send it;
 *   5. the sources page enqueuing exactly one refresh per idempotency key;
 *   6. the card's own controls: rendered for the owner and for nobody else,
 *      renamed and then undone over plain HTTP.
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
  speciesSlug: string;
  cultivarId: string;
  spaceId: string;
  objectIds: { keyboard: string; noScript: string; automatic: string };
  queueIds: {
    keyboard: string;
    noScript: string;
    automatic: string;
    bigMerge: string;
  };
  labels: { keyboard: string; noScript: string; automatic: string };
  /** How many gardener objects the big merge would move. */
  bigMergeObjects: number;
}

test.use({ trace: "off" });

test.describe("OVE-391 owner curation", () => {
  test("decides by keyboard, undoes, accepts without JavaScript and edits the card", async ({
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
      // Three open: the two label links this run decides, and the big merge
      // that `OVE-459` confirms below.
      await expect(page.locator("[data-catalog-queue-position]")).toContainText(
        "1 з 3",
      );

      // J and K walk the stream. Neither records a decision: the item the
      // owner skipped past is still open when K brings them back.
      // The first press doubles as the hydration wait: the shortcuts are a
      // client effect, and a key pressed before it runs goes nowhere.
      await pressUntil(
        page,
        "j",
        async () =>
          (await item.getAttribute("data-catalog-queue-item")) ===
          fixture!.queueIds.noScript,
      );
      await expect(page).toHaveURL(
        new RegExp(`item=${fixture.queueIds.noScript}`, "u"),
      );
      await page.keyboard.press("k");
      await expect(item).toHaveAttribute(
        "data-catalog-queue-item",
        fixture.queueIds.keyboard,
      );
      expect(await readQueueState(pool, fixture.queueIds.noScript)).toBe(
        "open",
      );

      // Every key it binds is printed beside the controls (`OVE-459` AC2).
      // A shortcut that lives only in the source is a shortcut only its
      // author has.
      for (const key of ["y", "n", "j", "k", "u"]) {
        await expect(
          page.locator(`[data-catalog-queue-key="${key}"]`),
          key,
        ).toBeVisible();
      }

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
      expect(await readObject(pool, fixture.objectIds.automatic)).toMatchObject(
        {
          catalog_item_id: null,
          variety_state: "free_text",
          variety_text: fixture.labels.automatic,
        },
      );

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
      const form = readProgressiveForm(
        html,
        `data-catalog-queue-action="accept"`,
      );
      const posted = await postProgressiveForm(
        baseURL,
        QUEUE_PATH,
        cookie,
        form,
      );
      expect(
        [200, 303].includes(posted),
        `Server Action POST answered ${posted}`,
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
      expect(
        await readOwnerActionCount(pool, fixture.speciesId),
      ).toBeGreaterThan(0);

      // 4b. A merge over fifty objects asks first, names how many, and the
      // grant it issues belongs to that item alone (`OVE-459` AC3).
      await page.goto(`${QUEUE_PATH}?item=${fixture.queueIds.bigMerge}`, {
        waitUntil: "load",
      });
      const merge = page.locator("[data-catalog-queue-item]");
      await expect(merge).toHaveAttribute(
        "data-catalog-queue-item",
        fixture.queueIds.bigMerge,
      );
      const confirmNotice = page.locator("[data-catalog-queue-confirm-objects]");
      await expect(confirmNotice).toHaveAttribute(
        "data-catalog-queue-confirm-objects",
        String(fixture.bigMergeObjects),
      );
      await expect(confirmNotice).toContainText(
        String(fixture.bigMergeObjects),
      );
      // No way to accept until it has been confirmed.
      await expect(
        page.locator('[data-catalog-queue-action="accept"]'),
      ).toHaveCount(0);
      const confirm = page.locator('[data-catalog-queue-action="confirm"]');
      await expect(confirm).toHaveAttribute(
        "href",
        new RegExp(`item=${fixture.queueIds.bigMerge}`, "u"),
      );

      // A grant that names another item — or no item at all — is no grant.
      // The page falls back to the highest-impact decision, and that decision
      // must ask for itself: before `OVE-459` the confirm link carried no
      // item, so a confirmation earned on one card was spent on another.
      for (const granted of [
        `${QUEUE_PATH}?item=${fixture.queueIds.automatic}&confirm=merge`,
        `${QUEUE_PATH}?confirm=merge`,
      ]) {
        await page.goto(granted, { waitUntil: "load" });
        await expect(
          page.locator("[data-catalog-queue-confirm-objects]"),
          granted,
        ).toBeVisible();
        await expect(
          page.locator('[data-catalog-queue-action="accept"]'),
          granted,
        ).toHaveCount(0);
      }

      // 5. The sources page enqueues exactly one refresh per idempotency key.
      await page.goto("/garden/catalog/sources", { waitUntil: "load" });
      const refresh = page.locator('[data-catalog-source-refresh="eppo"]');
      await expect(refresh).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("owner-source-controls.png"), animations: "disabled", fullPage: true });
      await refresh.click();
      await expect
        .poll(() => readRefreshJobCount(pool), { timeout: 20_000 })
        .toBe(1);
      await page.goto("/garden/catalog/sources", { waitUntil: "load" });
      const refreshAgain = page.locator('[data-catalog-source-refresh="eppo"]');
      await refreshAgain.click();
      await page.waitForTimeout(2_000);
      expect(await readRefreshJobCount(pool)).toBe(1);

      // 6. The card's own controls: the owner sees them, a visitor does not,
      // and a rename posted without JavaScript is audited and undoable.
      const cardPath = `/species/${fixture.speciesSlug}`;
      const guestCard = await (
        await fetch(`${baseURL}${cardPath}`, {
          headers: { accept: "text/html" },
        })
      ).text();
      expect(guestCard).not.toContain('data-owner-card-controls="true"');

      const ownerCard = await (
        await fetch(`${baseURL}${cardPath}`, {
          headers: { accept: "text/html", cookie },
        })
      ).text();
      for (const marker of [
        'data-owner-card-rename="true"',
        'data-owner-card-pin="true"',
        'data-owner-card-merge="true"',
        'data-owner-card-audit="true"',
      ]) {
        expect(ownerCard, marker).toContain(marker);
      }

      const renamed = `Помідор власника ${fixture.suffix}`;
      const renameStatus = await postProgressiveForm(
        baseURL,
        cardPath,
        cookie,
        readProgressiveForm(ownerCard, 'data-owner-card-rename="true"', {
          displayName: renamed,
          reason: "browser proof",
        }),
      );
      expect(
        [200, 303].includes(renameStatus),
        `rename answered ${renameStatus}`,
      ).toBe(true);
      await expect
        .poll(() => readPrimaryName(pool, fixture!.speciesId), {
          timeout: 20_000,
        })
        .toBe(renamed);

      // 7. Axe on all three owner pages, and a visitor gets none of the
      // owner's data from any of them (`OVE-459` AC7).
      for (const path of [
        QUEUE_PATH,
        "/garden/catalog/sources",
        "/account/moderation/comments",
      ]) {
        await page.goto(path, { waitUntil: "load" });
        expect(await axeViolations(page), path).toEqual([]);
      }
      for (const [path, marker] of [
        [QUEUE_PATH, "data-catalog-queue-item"],
        ["/garden/catalog/sources", "data-catalog-source="],
        ["/account/moderation/comments", "data-moderation-report"],
      ] as const) {
        const guest = await (
          await fetch(`${baseURL}${path}`, {
            headers: { accept: "text/html" },
            redirect: "manual",
          })
        ).text();
        expect(guest, path).not.toContain(marker);
      }

      const auditedCard = await (
        await fetch(`${baseURL}${cardPath}`, {
          headers: { accept: "text/html", cookie },
        })
      ).text();
      const undoStatus = await postProgressiveForm(
        baseURL,
        cardPath,
        cookie,
        readProgressiveForm(auditedCard, "data-owner-card-undo="),
      );
      expect(
        [200, 303].includes(undoStatus),
        `undo answered ${undoStatus}`,
      ).toBe(true);
      await expect
        .poll(() => readPrimaryName(pool, fixture!.speciesId), {
          timeout: 20_000,
        })
        .not.toBe(renamed);
    } finally {
      if (fixture) await cleanupFixture(pool, fixture);
      await pool.end().catch(() => undefined);
    }
  });
});

/**
 * `OVE-506`: the two pages as work queues, against the same build and
 * database. These run after the stream above and in the same file on purpose:
 * the queue is one queue for the whole catalogue, and a second file seeding it
 * in parallel would move the other's "highest impact first".
 *
 *   1. The queue: a table of the open decisions — identity, the reason in
 *      words with its code, the state, one way into each — reached and
 *      pressed from the keyboard; an item Accept cannot succeed on offers no
 *      Accept and says why; single-letter keys can be switched off; every
 *      decision comes back named and read from the record, including one
 *      already made in another tab; a phone reads the same rows as blocks,
 *      and a long identifier wraps instead of widening the page.
 *   2. The sources: freshness beside every source, counts per source, the
 *      pick figures with the sample they rest on, a reverted automatic
 *      decision counted as reverted, and a search miss turned into a queue
 *      item in one press.
 *   3. An ordinary member: refused on both pages with nothing of either read,
 *      and a decision posted with their session writes nothing.
 */
const OVE506_SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-506",
);
const SOURCES_PATH = "/garden/catalog/sources";
const DESKTOP = { width: 1_440, height: 900 } as const;
const PHONE = { width: 375, height: 812 } as const;

interface WorkQueueFixture {
  suffix: string;
  speciesId: string;
  speciesName: string;
  speciesSlug: string;
  longNodeId: string;
  spaceId: string;
  objectIds: string[];
  labels: { ready: string; miss: string };
  queueIds: { ready: string; miss: string; long: string; split: string };
  longIdentifier: string;
  sourceSlug: string;
  sourceName: string;
  snapshotIds: string[];
  automaticItemId: string;
  missQuery: string;
}

test.describe("OVE-506 owner work queues", () => {
  test("the queue: a table with one way into each decision, from the keyboard, blocked items said, outcomes read back", async ({
    baseURL,
    context,
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(15_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");
    mkdirSync(OVE506_SCREENSHOTS, { recursive: true });

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let fixture: WorkQueueFixture | null = null;
    try {
      fixture = await seedWorkQueueFixture(pool);
      await signInAsOwner(context, baseURL);
      await selectLocale(context, baseURL, "uk");
      await declineAnalytics(context);
      await page.setViewportSize(DESKTOP);

      const view = (item: string) => `${QUEUE_PATH}?item=${item}`;
      await page.goto(view(fixture.queueIds.ready), { waitUntil: "load" });
      const decision = page.locator("[data-catalog-queue-item]");
      // Revealed, not only streamed: the streamed segment sits hidden until
      // React swaps it in, and every check below is about what is on screen.
      await expect(decision).toBeVisible();
      await expect(decision).toHaveAttribute(
        "data-catalog-queue-item",
        fixture.queueIds.ready,
      );
      await expect(decision).toHaveAttribute("data-catalog-queue-state", "ready");

      // The table: every one of this run's decisions, with what it is, why
      // in words and in code, its state, and one way in — except the row on
      // screen, which says so.
      const row = (id: string) =>
        page.locator(`[data-catalog-queue-row="${id}"]`);
      await expect(row(fixture.queueIds.ready)).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(row(fixture.queueIds.ready)).toContainText(
        fixture.labels.ready,
      );
      await expect(row(fixture.queueIds.ready)).toContainText(
        "Назва садівника — наукова назва",
      );
      // The code stays in the detail, beside the words; the table's narrow
      // cell says the words only.
      await expect(
        decision.locator('[data-catalog-reason="label_scientific_name:stored"]'),
      ).toContainText("label_scientific_name:stored");
      await expect(row(fixture.queueIds.ready)).not.toContainText(
        "label_scientific_name:stored",
      );
      await expect(row(fixture.queueIds.miss)).toHaveAttribute(
        "data-catalog-queue-row-state",
        "blocked",
      );
      await expect(row(fixture.queueIds.miss)).toContainText(
        "Садівники шукали й не знайшли",
      );
      await expect(row(fixture.queueIds.long)).toContainText(
        "Той самий ідентифікатор Wikidata",
      );
      for (const id of [
        fixture.queueIds.miss,
        fixture.queueIds.long,
        fixture.queueIds.split,
      ]) {
        await expect(
          page.locator(`[data-catalog-queue-review="${id}"]`),
        ).toBeVisible();
      }
      await expect(
        page.locator(`[data-catalog-queue-review="${fixture.queueIds.ready}"]`),
      ).toHaveCount(0);
      await expect(page.locator("[data-catalog-queue-table] caption")).toHaveText(
        "Відкриті рішення, найбільший вплив згори",
      );
      // No context rail beside a work queue (OG-UX-040): the generic "keep
      // reading / start a journal" column is gone, and this page registers
      // nothing in its place.
      await expect(
        page.locator('[data-site-shell-region="context"]'),
      ).toHaveCount(0);
      await scanAccessibility(page, testInfo, "queue-1440");
      await page.screenshot({
        path: path.join(OVE506_SCREENSHOTS, "queue-uk-1440.png"),
        fullPage: true,
      });

      // The keyboard walk, recorded: every stop on the page from the top,
      // in order, and the ring it draws. It is the evidence an axe score is
      // not — that a keyboard reaches the filters, the decision, the switch,
      // the way to the next decision and every row, and can see where it is.
      await page.goto(view(fixture.queueIds.ready), { waitUntil: "load" });
      await expect(decision).toBeVisible();
      await waitForHydration(page.locator("[data-catalog-queue-shortcuts-toggle]"));
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      const walk: Array<{
        stop: number;
        element: string;
        name: string;
        ring: string;
      }> = [];
      for (let stop = 1; stop <= 90; stop += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const node = document.activeElement;
          if (!(node instanceof HTMLElement) || node === document.body) {
            return null;
          }
          const style = getComputedStyle(node);
          const marker =
            [
              "data-catalog-queue-filter",
              "data-catalog-queue-action",
              "data-catalog-queue-nav",
              "data-catalog-queue-review",
              "data-catalog-automatic-undo",
            ]
              .map((name) =>
                node.hasAttribute(name) ? `${name}=${node.getAttribute(name)}` : null,
              )
              .find(Boolean) ??
            (node.hasAttribute("data-catalog-queue-shortcuts-toggle")
              ? "shortcuts-toggle"
              : "");
          return {
            element: `${node.tagName.toLowerCase()}${marker ? `[${marker}]` : ""}`,
            name: (
              node.getAttribute("aria-label") ??
              node.textContent ??
              ""
            )
              .trim()
              .replace(/\s+/gu, " ")
              .slice(0, 80),
            visible: node.matches(":focus-visible"),
            ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
          };
        });
        if (!focused) continue;
        expect(focused.visible, `${focused.element} ${focused.name}`).toBe(true);
        expect(focused.ring, `${focused.element} ${focused.name}`).not.toMatch(
          /^none|\s0px\s/u,
        );
        walk.push({
          stop,
          element: focused.element,
          name: focused.name,
          ring: focused.ring,
        });
        if (focused.element.startsWith("a[data-catalog-queue-review")) {
          const reviews = walk.filter((entry) =>
            entry.element.startsWith("a[data-catalog-queue-review"),
          ).length;
          if (reviews >= 3) break;
        }
      }
      const reached = walk.map((entry) => entry.element).join(" ");
      for (const expected of [
        "data-catalog-queue-filter=all",
        "data-catalog-queue-action=accept",
        "data-catalog-queue-action=reject",
        "data-catalog-queue-action=skip",
        "shortcuts-toggle",
        "data-catalog-queue-nav=next",
        `data-catalog-queue-review=${fixture.queueIds.miss}`,
      ]) {
        expect(reached, expected).toContain(expected);
      }
      // Decision before table: the pane's controls come before the rows.
      expect(reached.indexOf("data-catalog-queue-action=accept")).toBeLessThan(
        reached.indexOf("data-catalog-queue-review="),
      );
      writeFileSync(
        path.join(OVE506_SCREENSHOTS, "queue-keyboard-walk.json"),
        `${JSON.stringify({ viewport: DESKTOP, stops: walk }, null, 2)}\n`,
      );

      // Keyboard row action: Tab to the search miss's review link and press
      // Enter. It opens in the pane, which says why there is no Accept.
      await page.goto(view(fixture.queueIds.ready), { waitUntil: "load" });
      await expect(decision).toBeVisible();
      const review = page.locator(
        `[data-catalog-queue-review="${fixture.queueIds.miss}"]`,
      );
      await waitForHydration(review);
      await tabToControl(page, review, 120);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(
        new RegExp(`item=${fixture.queueIds.miss}#decision$`, "u"),
      );
      await expect(decision).toHaveAttribute(
        "data-catalog-queue-item",
        fixture.queueIds.miss,
      );
      await expect(decision).toHaveAttribute(
        "data-catalog-queue-blocked",
        "no_target",
      );
      await expect(
        decision.locator('[data-catalog-queue-action="accept"]'),
      ).toHaveCount(0);
      await expect(decision).toContainText(
        "Немає картки, до якої це прив'язати",
      );

      // Y has nothing to press here, so nothing is decided.
      const toggle = page.locator("[data-catalog-queue-shortcuts-toggle]");
      await waitForHydration(toggle);
      await page.keyboard.press("y");
      await page.waitForTimeout(1_000);
      expect(await readQueueState(pool, fixture.queueIds.miss)).toBe("open");

      // Switched off, N decides nothing either (WCAG 2.1.4).
      await toggle.click();
      await expect(
        page.locator("[data-catalog-queue-shortcuts]"),
      ).toHaveAttribute("data-catalog-queue-shortcuts", "off");
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      await page.keyboard.press("n");
      await page.waitForTimeout(1_500);
      expect(await readQueueState(pool, fixture.queueIds.miss)).toBe("open");
      // Remembered across a reload, then switched back on.
      await page.reload({ waitUntil: "load" });
      await expect(
        page.locator("[data-catalog-queue-shortcuts]"),
      ).toHaveAttribute("data-catalog-queue-shortcuts", "off");
      await page.locator("[data-catalog-queue-shortcuts-toggle]").click();
      await expect(
        page.locator("[data-catalog-queue-shortcuts]"),
      ).toHaveAttribute("data-catalog-queue-shortcuts", "on");

      // On, N rejects it — and the answer names it, from the record, with
      // focus on the notice. One press: a second would decide the next item.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      await page.keyboard.press("n");
      await expect
        .poll(() => readQueueState(pool, fixture!.queueIds.miss), {
          timeout: 20_000,
        })
        .toBe("rejected");
      const rejected = page.locator('[data-action-outcome="rejected"]');
      await expect(rejected).toContainText(`Відхилено: «${fixture.labels.miss}»`);
      await expect
        .poll(() =>
          rejected.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);

      // Y accepts the ready one; the gardener's objects gain the card.
      await page.goto(view(fixture.queueIds.ready), { waitUntil: "load" });
      await waitForHydration(page.locator("[data-catalog-queue-shortcuts-toggle]"));
      await page.keyboard.press("y");
      await expect
        .poll(() => readQueueState(pool, fixture!.queueIds.ready), {
          timeout: 20_000,
        })
        .toBe("accepted");
      await expect(page.locator('[data-action-outcome="accepted"]')).toContainText(
        `Прийнято: «${fixture.labels.ready}» → ${fixture.speciesName}`,
      );
      for (const objectId of fixture.objectIds) {
        expect(await readObject(pool, objectId)).toMatchObject({
          catalog_item_id: fixture.speciesId,
          variety_text: fixture.labels.ready,
        });
      }

      // A split is reviewed on the card: no Accept, and the way to the card.
      await page.goto(view(fixture.queueIds.split), { waitUntil: "load" });
      await expect(decision).toHaveAttribute(
        "data-catalog-queue-blocked",
        "not_applied_here",
      );
      await expect(
        decision.getByRole("link", { name: "Відкрити картку" }),
      ).toHaveAttribute("href", new RegExp(fixture.speciesSlug, "u"));

      // Decided in another tab: the page it was pressed on still offers the
      // decision; pressing it writes nothing and says it was already made.
      const cookie = (await context.cookies(baseURL))
        .map((entry) => `${entry.name}=${entry.value}`)
        .join("; ");
      const staleHtml = await (
        await fetch(`${baseURL}${view(fixture.queueIds.long)}`, {
          headers: { accept: "text/html", cookie },
        })
      ).text();
      const staleSkip = readProgressiveForm(
        staleHtml,
        'data-catalog-queue-action="skip"',
      );
      await page.goto(view(fixture.queueIds.long), { waitUntil: "load" });
      await decision.locator('[data-catalog-queue-action="reject"]').click();
      await expect(page.locator('[data-action-outcome="rejected"]')).toBeVisible();
      expect(await readQueueState(pool, fixture.queueIds.long)).toBe("rejected");
      const staleResponse = await fetch(`${baseURL}${QUEUE_PATH}`, {
        method: "POST",
        headers: { accept: "text/html", cookie, origin: baseURL },
        body: formBody(staleSkip.fields),
        redirect: "manual",
      });
      expect(staleResponse.status).toBe(303);
      expect(staleResponse.headers.get("location") ?? "").toContain(
        "result=stale",
      );
      expect(await readQueueState(pool, fixture.queueIds.long)).toBe("rejected");
      await page.goto(staleResponse.headers.get("location")!, {
        waitUntil: "load",
      });
      await expect(page.locator('[data-action-outcome="stale"]')).toContainText(
        "уже вирішено раніше",
      );

      // A phone: the same rows as labelled blocks, and a long identifier that
      // wraps rather than widening the page.
      await pool.query(
        "update catalog_curation_queue set state = 'open', decided_at = null, decided_by_user_id = null where id = $1::uuid",
        [fixture.queueIds.long],
      );
      await page.setViewportSize(PHONE);
      await page.goto(view(fixture.queueIds.long), { waitUntil: "load" });
      await expect(decision).toBeVisible();
      await expect(row(fixture.queueIds.long)).toBeVisible();
      await expect(decision).toContainText(fixture.longIdentifier);
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
      const identifier = decision.getByText(fixture.longIdentifier, {
        exact: false,
      });
      await expect(identifier).toBeVisible();
      const identifierBox = await identifier.boundingBox();
      expect(identifierBox).not.toBeNull();
      expect(identifierBox!.x + identifierBox!.width).toBeLessThanOrEqual(
        PHONE.width,
      );
      await expect(
        page.locator("[data-catalog-queue-table] thead"),
      ).toHaveCSS("position", "absolute");
      await expect(row(fixture.queueIds.long)).toContainText("Стан");
      await scanAccessibility(page, testInfo, "queue-375");
      await page.screenshot({
        path: path.join(OVE506_SCREENSHOTS, "queue-uk-375.png"),
        fullPage: true,
      });

      // The page in the owner's other two languages.
      for (const [locale, title, header] of [
        ["bg", "Опашка с решения за каталога", "Защо"],
        ["ru", "Очередь решений каталога", "Почему"],
      ] as const) {
        await selectLocale(context, baseURL, locale);
        await page.setViewportSize(DESKTOP);
        await page.goto(view(fixture.queueIds.long), { waitUntil: "load" });
        // The loading frame's heading stands beside the page's until the
        // stream reveals it; the page's own is the one on screen.
        await expect(
          page.locator("[data-catalog-queue-table]"),
        ).toBeVisible();
        await expect(page.locator("h1:visible")).toHaveText(title);
        await expect(
          page.locator("[data-catalog-queue-table] thead"),
        ).toContainText(header);
      }
    } finally {
      if (fixture) await cleanupWorkQueueFixture(pool, fixture);
      await pool.end().catch(() => undefined);
    }
  });

  test("the sources: freshness beside every source, counts per source, figures with their sample, a miss queued in one press", async ({
    baseURL,
    context,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");
    mkdirSync(OVE506_SCREENSHOTS, { recursive: true });

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let fixture: WorkQueueFixture | null = null;
    try {
      fixture = await seedWorkQueueFixture(pool);
      await signInAsOwner(context, baseURL);
      await selectLocale(context, baseURL, "uk");
      await declineAnalytics(context);
      await page.setViewportSize(DESKTOP);
      await page.goto(SOURCES_PATH, { waitUntil: "load" });

      // Freshness and counts, beside the source they belong to.
      const source = page.locator(`[data-catalog-source="${fixture.sourceSlug}"]`);
      await expect(source).toBeVisible();
      await expect(source).toContainText(fixture.sourceName);
      await expect(source).toContainText("Знімок від");
      await expect(
        source.locator("[data-catalog-source-rejected-after]"),
      ).toBeVisible();
      await expect(
        source.locator("[data-catalog-source-refresh-status]"),
      ).toHaveAttribute("data-catalog-source-refresh-status", "pending");
      const coverage = source.locator("[data-catalog-source-coverage]");
      await expect(coverage).toHaveAttribute(
        "data-catalog-source-coverage",
        "ready",
      );
      await expect(coverage).toHaveAttribute("data-catalog-source-records", "3");
      await expect(coverage).toHaveAttribute("data-catalog-source-linked", "1");
      await expect(coverage).toContainText("3 записи");
      await expect(coverage).toContainText("Прив'язано до карток: 1 з 3 (33%)");

      // Every figure with its sample: a median or a P95 over fewer
      // measurements than it takes is not printed, whatever this database
      // holds today. Other specs record picks as they run, so the sample is
      // read on both sides of a load and only a load it did not move counts.
      const readTimed = async () => {
        const result = await pool.query<{ window_days: number; timed: number }>(
          `select window_days, count(event.ms_to_pick)::int as timed
             from unnest(array[7, 30]) as window_days
             left join catalog_pick_events as event
               on event.occurred_at >= now() - (window_days || ' days')::interval
            group by window_days order by window_days`,
        );
        return result.rows;
      };
      let timed = await readTimed();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(SOURCES_PATH, { waitUntil: "load" });
        await expect(page.locator("[data-catalog-health]")).toBeVisible();
        const after = await readTimed();
        if (JSON.stringify(after) === JSON.stringify(timed)) break;
        timed = after;
      }
      const healthEmpty =
        (await page.locator("[data-catalog-health-empty]").count()) > 0;
      for (const { window_days: windowDays, timed: sample } of timed) {
        if (healthEmpty) break;
        for (const [figure, needed] of [
          ["median", 5],
          ["p95", 20],
        ] as const) {
          const cell = page.locator(
            `[data-catalog-health-figure="${figure}"][data-catalog-health-window="${windowDays}"]`,
          );
          const status =
            sample === 0 ? "none" : sample < needed ? "insufficient" : "measured";
          await expect(cell, `${figure} over ${windowDays} days`).toHaveAttribute(
            "data-catalog-health-figure-status",
            status,
          );
          if (status === "insufficient") {
            await expect(cell).toHaveText(`Замало вимірів: ${sample} з ${needed}`);
          }
        }
      }

      // A reverted automatic decision is counted as reverted.
      const rule = page.locator(
        '[data-catalog-health-rule="col_accepted_became_synonym"]',
      );
      await expect(rule).toContainText(
        "Catalogue of Life тепер вважає назву синонімом",
      );
      expect(
        Number(await rule.getAttribute("data-catalog-health-rule-reverted")),
      ).toBeGreaterThanOrEqual(1);
      await expect(
        page.locator('[data-site-shell-region="context"]'),
      ).toHaveCount(0);
      await scanAccessibility(page, testInfo, "sources-1440");
      await page.screenshot({
        path: path.join(OVE506_SCREENSHOTS, "sources-uk-1440.png"),
        fullPage: true,
      });

      // One press turns a miss into a decision, and the answer links to it —
      // even below the twenty the queue lists: a miss is queued at impact 1,
      // and the link used to fall back to the top item, whose Accept the
      // owner's next press would have decided.
      for (let n = 0; n < 21; n += 1) {
        await pool.query(
          `insert into catalog_curation_queue (item_type, subject_label, proposal,
             reasons, impact_score, state)
           values ('label_link', $1, '{"object_kind":"plant"}'::jsonb,
                   array['search_miss'], 50, 'open')`,
          [`OVE-506 filler ${fixture.suffix} ${n}`],
        );
      }
      const miss = page.locator(
        `[data-catalog-health-miss-queue="${fixture.missQuery}"]`,
      );
      await waitForHydration(miss);
      await miss.click();
      const queued = page.locator('[data-action-outcome="miss-queued"]');
      await expect(queued).toContainText(
        `Додано в чергу рішень: «${fixture.missQuery}»`,
      );
      const link = queued.locator("[data-catalog-miss-queue-item]");
      const queueItemId = await link.getAttribute("data-catalog-miss-queue-item");
      expect(queueItemId).not.toBeNull();
      expect(await readQueueState(pool, queueItemId!)).toBe("open");
      await link.click();
      await expect(page.locator("[data-catalog-queue-item]")).toHaveAttribute(
        "data-catalog-queue-item",
        queueItemId!,
      );
      await expect(page.locator("[data-catalog-queue-item]")).toHaveAttribute(
        "data-catalog-queue-blocked",
        "no_target",
      );
      // Shown on its own, outside the listed twenty: no position claimed.
      await expect(page.locator("[data-catalog-queue-position]")).toHaveCount(0);
      await pool.query(
        "delete from catalog_curation_queue where id = $1::uuid and state = 'open'",
        [queueItemId],
      );

      // The refresh button answers with what it did.
      await page.goto(SOURCES_PATH, { waitUntil: "load" });
      const refresh = page.locator(
        `[data-catalog-source-refresh="${fixture.sourceSlug}"]`,
      );
      await waitForHydration(refresh);
      await refresh.click();
      await expect(page.locator('[data-action-outcome="queued"]')).toContainText(
        `Оновлення поставлено в чергу: ${fixture.sourceName}.`,
      );

      await page.setViewportSize(PHONE);
      await page.goto(SOURCES_PATH, { waitUntil: "load" });
      await expect(source).toBeVisible();
      await expect(
        source.locator('[data-catalog-source-coverage="ready"]'),
      ).toBeVisible();
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
      await scanAccessibility(page, testInfo, "sources-375");
      await page.screenshot({
        path: path.join(OVE506_SCREENSHOTS, "sources-uk-375.png"),
        fullPage: true,
      });
    } finally {
      if (fixture) await cleanupWorkQueueFixture(pool, fixture);
      await pool.end().catch(() => undefined);
    }
  });

  test("an ordinary member: refused on both pages with nothing read, and a posted decision writes nothing", async ({
    baseURL,
    browser,
    context,
  }) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let fixture: WorkQueueFixture | null = null;
    let memberId: string | null = null;
    const member = await browser.newContext();
    try {
      fixture = await seedWorkQueueFixture(pool);
      // The owner's own page, for the form a member would have to forge.
      await signInAsOwner(context, baseURL);
      const ownerCookie = (await context.cookies(baseURL))
        .map((entry) => `${entry.name}=${entry.value}`)
        .join("; ");
      const ownerHtml = await (
        await fetch(`${baseURL}${QUEUE_PATH}?item=${fixture.queueIds.ready}`, {
          headers: { accept: "text/html", cookie: ownerCookie },
        })
      ).text();
      const accept = readProgressiveForm(
        ownerHtml,
        'data-catalog-queue-action="accept"',
      );

      memberId = await createMember(pool);
      await signInMember(member, baseURL, memberId);
      const page = await member.newPage();
      await member.addCookies([
        { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
        { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
      ]);
      for (const [path, surface] of [
        [QUEUE_PATH, "catalog-queue"],
        [SOURCES_PATH, "catalog-sources"],
      ] as const) {
        await page.goto(path, { waitUntil: "load" });
        const shell = page.locator(`[data-operator-surface="${surface}"]`);
        await expect(shell).toHaveAttribute("data-operator-access-state", "denied");
        await expect(
          page.locator("[data-catalog-operator-denied]"),
        ).toContainText("Лише для власника каталогу");
        await expect(page.locator("[data-operator-cross-link]")).toHaveCount(0);
        const html = await page.content();
        for (const marker of [
          "data-catalog-queue-row",
          "data-catalog-queue-item=",
          "data-catalog-source=",
          fixture.labels.ready,
          fixture.sourceName,
        ]) {
          expect(html, `${path} ${marker}`).not.toContain(marker);
        }
      }

      // The owner's form, posted with the member's session: refused, and
      // nothing written.
      const memberCookie = (await member.cookies(baseURL))
        .map((entry) => `${entry.name}=${entry.value}`)
        .join("; ");
      const forged = await fetch(`${baseURL}${QUEUE_PATH}`, {
        method: "POST",
        headers: { accept: "text/html", cookie: memberCookie, origin: baseURL },
        body: formBody({
          ...accept.fields,
          // The owner-scope guard compares this with the session; a forger
          // sends their own id so the refusal is the owner check's.
          ownerUserId: memberId,
        }),
        redirect: "manual",
      });
      expect([200, 303]).toContain(forged.status);
      if (forged.status === 303) {
        expect(forged.headers.get("location") ?? "").toContain("result=denied");
      }
      expect(await readQueueState(pool, fixture.queueIds.ready)).toBe("open");
      for (const objectId of fixture.objectIds) {
        expect(await readObject(pool, objectId)).toMatchObject({
          catalog_item_id: null,
          variety_state: "free_text",
        });
      }
    } finally {
      await member.close().catch(() => undefined);
      if (fixture) await cleanupWorkQueueFixture(pool, fixture);
      if (memberId) {
        await pool
          .query('delete from public."user" where id = $1::uuid', [memberId])
          .catch(() => undefined);
      }
      await pool.end().catch(() => undefined);
    }
  });
});

const MEMBER_PASSWORD = "OVE506-local-member-1!";

/** The analytics notice would sit over the pane in every screenshot. */
async function declineAnalytics(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("overgarden:analytics-consent", "declined");
    } catch {
      // Storage may be blocked; the notice is then simply drawn.
    }
  });
}

function memberEmail(id: string) {
  return `ove506-member-${id}@example.test`;
}

async function createMember(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, true, $3::text, now(), now())`,
    [id, memberEmail(id), PRIVATE_AUTH_COMPATIBILITY_NAME],
  );
  await pool.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1::uuid, $2::text, 'credential', $2::uuid, $3::text, now(), now())`,
    [randomUUID(), id, await hashPassword(MEMBER_PASSWORD)],
  );
  return id;
}

/**
 * The member's sign-in, through the same limiter every spec in the run
 * shares: a `429` is another spec's sign-up a moment earlier, and waiting it
 * out is the whole fix (`helpers/synthetic-gardener.ts`).
 */
async function signInMember(
  member: BrowserContext,
  baseURL: string,
  memberId: string,
) {
  const statuses: number[] = [];
  for (const delay of [0, 1_500, 4_000, 9_000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await member.request.post(
      `${baseURL}/api/auth/sign-in/email`,
      {
        headers: { origin: baseURL },
        data: { email: memberEmail(memberId), password: MEMBER_PASSWORD },
      },
    );
    if (response.ok()) return;
    statuses.push(response.status());
    if (response.status() !== 429) break;
  }
  throw new Error(`member sign-in answered ${statuses.join(", ")}`);
}

function formBody(fields: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return body;
}

/**
 * Four decisions of four shapes, a source with an imported and a newer
 * rejected snapshot, an automatic decision the owner took back, and a search
 * miss. Everything carries this run's suffix and is removed after it.
 */
async function seedWorkQueueFixture(pool: Pool): Promise<WorkQueueFixture> {
  await pool.query(
    "delete from catalog_curation_queue where state = 'open' and (subject_label like 'OVE-506 %' or subject_label like 'ove506-%')",
  );
  const suffix = randomUUID().slice(0, 8);
  const speciesId = randomUUID();
  const longNodeId = randomUUID();
  const automaticSubjectId = randomUUID();
  const spaceId = randomUUID();
  const speciesSlug = `ove506-${suffix}-tomato`;
  // Its own name, so no reader's search for the real tomato finds it.
  const speciesName = `OVE-506 Solanum ${suffix}`;
  // No spaces for forty-odd characters: the name and the identifier that a
  // table cell used to push past the edge of a phone.
  const longIdentifier = `Q${"9".repeat(24)}${suffix}${"7".repeat(24)}`;
  const labels = {
    ready: `OVE-506 помідор з балкона ${suffix}`,
    miss: `OVE-506 кабачок-невидимка ${suffix}`,
  };
  for (const [id, name, slug, kind] of [
    [speciesId, speciesName, speciesSlug, "taxon"],
    [
      longNodeId,
      `Solanum-lycopersicum-var-cerasiforme-Extraordinarily-Long-Name-${suffix}`,
      `ove506-${suffix}-long`,
      "cultivar",
    ],
    [automaticSubjectId, `OVE-506 синонім ${suffix}`, null, "taxon"],
  ] as const) {
    await pool.query(
      `insert into catalog_items (id, canonical_name, normalized_name, public_slug,
         source, source_id, locale, node_kind, kingdom, rank, identity_state, search_weight)
       values ($1, $2, catalog_normalize_name($2), $3, 'species_backbone', $4, 'la', $5,
               'Plantae', 'species', 'active', 5)`,
      [id, name, slug, `ove506:${id}`, kind],
    );
  }
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2::uuid, $3)`,
    [spaceId, OWNER_BROWSER_FIXTURE.userId, `OVE-506 ${suffix}`],
  );
  const objectIds = [randomUUID(), randomUUID()];
  for (const objectId of objectIds) {
    await pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind,
         variety_text, variety_state)
       values ($1, $2::uuid, $3, $4, 'plant', $5, 'free_text')`,
      [objectId, OWNER_BROWSER_FIXTURE.userId, spaceId, `OVE-506 ${suffix}`, labels.ready],
    );
  }
  const queueIds = {
    ready: randomUUID(),
    miss: randomUUID(),
    long: randomUUID(),
    split: randomUUID(),
  };
  const insertItem = async (
    id: string,
    itemType: string,
    subject: string | null,
    label: string | null,
    proposal: Record<string, string>,
    reason: string,
    impact: number,
  ) =>
    pool.query(
      `insert into catalog_curation_queue (id, item_type, subject_catalog_item_id, subject_label,
         proposal, confidence, reasons, impact_score, state)
       values ($1, $2, $3::uuid, $4, $5::jsonb, 0.91, array[$6]::text[], $7, 'open')`,
      [id, itemType, subject, label, JSON.stringify(proposal), reason, impact],
    );
  await insertItem(
    queueIds.ready,
    "label_link",
    speciesId,
    labels.ready,
    { catalog_item_id: speciesId, object_kind: "plant" },
    "label_scientific_name:stored",
    95,
  );
  await insertItem(
    queueIds.miss,
    "label_link",
    null,
    labels.miss,
    { source_slug: "catalog_search_miss", locale: "uk", object_kind: "plant" },
    "search_miss",
    94,
  );
  await insertItem(
    queueIds.long,
    "node_merge",
    longNodeId,
    null,
    { survivor_id: speciesId },
    "shared_identifier:wikidata",
    93,
  );
  await insertItem(
    queueIds.split,
    "split_review",
    speciesId,
    null,
    {},
    "homonym_kingdom_conflict",
    92,
  );

  // An automatic decision the owner took back, for the precision table.
  const automaticItemId = randomUUID();
  await insertItem(
    automaticItemId,
    "node_merge",
    automaticSubjectId,
    null,
    { survivor_id: speciesId },
    "col_accepted_became_synonym",
    1,
  );
  const applied = await pool.query<{ action_id: string }>(
    "select catalog_apply_queue_item($1::uuid, null, true)::text as action_id",
    [automaticItemId],
  );
  await pool.query("select catalog_revert_action($1::uuid, $2::uuid)", [
    applied.rows[0]!.action_id,
    OWNER_BROWSER_FIXTURE.userId,
  ]);

  // A source with an imported snapshot and a newer rejected one.
  const sourceSlug = `ove506-${suffix}`;
  const sourceName = `OVE-506 proof source ${suffix}`;
  const snapshotIds = [randomUUID(), randomUUID()];
  for (const [index, status, age] of [
    [0, "imported", "3 days"],
    [1, "rejected", "1 day"],
  ] as const) {
    await pool.query(
      `insert into catalog_source_snapshots (id, source_slug, source_name, source_category,
         source_version, source_url, license, parser_version, payload_sha256,
         fetched_at, verified_at, status)
       values ($1, $2, $3, 'taxonomy', $4, 'https://example.test/source', 'CC BY 4.0',
               'ove506', $5, now() - $6::interval, now() - $6::interval, $7)`,
      [snapshotIds[index], sourceSlug, sourceName, `ove506-${status}`, "0".repeat(64), age, status],
    );
  }
  // The long identifier, asserted by this run's snapshot: an identifier
  // always says which import vouched for it.
  const assertion = await pool.query<{ id: string }>(
    `insert into catalog_source_assertions (source_slug, source_snapshot_id)
     values ($1, $2) returning id::text`,
    [sourceSlug, snapshotIds[0]],
  );
  await pool.query(
    `insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
     values ($1::uuid, 'wikidata', $2, $3::uuid)`,
    [longNodeId, longIdentifier, assertion.rows[0]!.id],
  );
  const recordIds: string[] = [];
  for (const key of ["one", "two", "three"]) {
    const record = await pool.query<{ id: string }>(
      `insert into catalog_source_records (source_snapshot_id, source_record_id,
         raw_payload, raw_payload_sha256)
       values ($1, $2, '{}'::jsonb, $3) returning id::text`,
      [snapshotIds[0], `ove506-${key}`, "a".repeat(64)],
    );
    recordIds.push(record.rows[0]!.id);
  }
  await pool.query(
    `insert into catalog_source_links (catalog_item_id, source_record_id, source_slug, source_record_key)
     values ($1, $2, $3, 'ove506-one')`,
    [speciesId, recordIds[0], sourceSlug],
  );
  await pool.query(
    `insert into job_queue (queue_name, payload, idempotency_key)
     values ('matching', jsonb_build_object('kind', 'catalog_source_refresh', 'source_slug', $1::text),
             'matching:catalog_source_refresh:' || $1::text)
     on conflict (idempotency_key) where idempotency_key is not null do nothing`,
    [sourceSlug],
  );

  const missQuery = `ove506-кабачок-${suffix}`;
  await pool.query(
    `insert into catalog_search_misses (query_normalized, locale, object_kind, occurrences)
     values ($1, 'uk', 'plant', 7)`,
    [missQuery],
  );

  return {
    suffix,
    speciesId,
    speciesName,
    speciesSlug,
    longNodeId,
    spaceId,
    objectIds,
    labels,
    queueIds,
    longIdentifier,
    sourceSlug,
    sourceName,
    snapshotIds,
    automaticItemId,
    missQuery,
  };
}

async function cleanupWorkQueueFixture(pool: Pool, fixture: WorkQueueFixture) {
  await pool.query(
    "delete from catalog_curation_queue where state = 'open' and subject_label like $1",
    [`OVE-506 filler ${fixture.suffix} %`],
  );
  await pool.query("delete from plant_objects where space_id = $1::uuid", [
    fixture.spaceId,
  ]);
  await pool.query("delete from spaces where id = $1::uuid", [fixture.spaceId]);
  await pool.query(
    "delete from catalog_curation_queue where state = 'open' and (id = any($1::uuid[]) or subject_label = $2)",
    [Object.values(fixture.queueIds), fixture.missQuery],
  );
  await pool.query(
    "delete from catalog_search_misses where query_normalized = $1",
    [fixture.missQuery],
  );
  await pool.query("delete from job_queue where idempotency_key = $1", [
    `matching:catalog_source_refresh:${fixture.sourceSlug}`,
  ]);
  await pool.query(
    "delete from catalog_source_links where source_slug = $1",
    [fixture.sourceSlug],
  );
  // A decided row and the nodes under it are the run's own receipt: the
  // audit table refuses the update a delete would cascade into (see
  // `cleanupFixture` above), and fresh ids mean nothing collides.
  await pool.query(
    `delete from catalog_item_identifiers where catalog_item_id = $1::uuid`,
    [fixture.longNodeId],
  );
  await pool.query(
    "delete from catalog_source_assertions where source_slug = $1",
    [fixture.sourceSlug],
  );
  await pool.query(
    "delete from catalog_source_snapshots where source_slug = $1",
    [fixture.sourceSlug],
  );
}

/**
 * Presses a key until the page answers. The shortcuts hydrate after the
 * stream settles, so the first press can land before the listener exists;
 * every key here is idempotent in its own direction.
 */
/**
 * Axe over the whole document, at the WCAG 2.1 AA tags DESIGN.md §10 gates on.
 * Through the protocol rather than a script element: the page's CSP blocks the
 * element, and a blocked script tag never fires its load event. `base-ui`'s
 * focus guards are excluded — zero-size `aria-hidden` sentinels with
 * `tabindex="0"`, the standard focus-lock pattern, which axe reports wherever
 * any overlay is open and which belong to the library, not to this page.
 */
async function axeViolations(page: Page) {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: unknown,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              impact: string | null;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(
      {
        include: [["body"]],
        exclude: [["[data-base-ui-focus-guard]"]],
      },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } },
    );
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  });
}

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
    bigMerge: randomUUID(),
  };
  // One over the threshold, so the confirmation is the rule's own edge.
  const bigMergeObjects = 51;
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
  for (const [id, name, nodeKind] of [
    [speciesId, "Solanum lycopersicum L.", "taxon"],
    [cultivarId, `Де Барао ${suffix}`, "cultivar"],
  ] as const) {
    await pool.query(
      `insert into catalog_items (id, canonical_name, normalized_name, public_slug,
         source, source_id, locale, node_kind, kingdom, rank, identity_state, search_weight)
       values ($1, $2, catalog_normalize_name($2), $3, 'species_backbone', $4, 'la', $5,
               'Plantae', 'species', 'active', 5)`,
      [
        id,
        name,
        `ove391-${suffix}-${id.slice(0, 8)}`,
        `ove391:${id}`,
        nodeKind,
      ],
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
      [
        objectId,
        OWNER_BROWSER_FIXTURE.userId,
        spaceId,
        label.slice(0, 60),
        label,
      ],
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
  /**
   * A merge big enough to need confirming (`OVE-459` AC3). Fifty-one gardener
   * objects sit on the cultivar, and the queue row proposes folding it into
   * the species — so the page must name fifty-one, and the grant it issues
   * must name this item and no other.
   */
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind,
       catalog_item_id, variety_text, variety_state)
     select gen_random_uuid(), $1::uuid, $2::uuid, 'OVE-459 ' || n, 'plant',
            $3::uuid, 'OVE-459 ' || n, 'selected'
     from generate_series(1, $4::int) as n`,
    [OWNER_BROWSER_FIXTURE.userId, spaceId, cultivarId, bigMergeObjects],
  );
  // The target is in `proposal`, not a column of its own: the subject is the
  // node the objects sit on, and `survivor_id` names where they are going —
  // the key `catalog_apply_queue_item` reads, and the one every producer
  // writes. This fixture used to name it `catalog_item_id`, a merge the
  // function refuses; the queue now says so and offers no Accept (`OVE-506`).
  await pool.query(
    `insert into catalog_curation_queue (id, item_type, subject_catalog_item_id,
       proposal, confidence, reasons, impact_score, state)
     values ($1, 'node_merge', $2::uuid,
             jsonb_build_object('survivor_id', $3::text), 0.99,
             array['canonical_same_kingdom_rank'], 10, 'open')`,
    [queueIds.bigMerge, cultivarId, speciesId],
  );

  // One decision already applied automatically, so the seven-day list has a
  // row to undo. It runs through the same function the worker calls.
  await pool.query("select catalog_apply_queue_item($1::uuid, null, true)", [
    queueIds.automatic,
  ]);
  return {
    suffix,
    speciesId,
    speciesSlug: `ove391-${suffix}-${speciesId.slice(0, 8)}`,
    cultivarId,
    spaceId,
    objectIds,
    queueIds,
    labels,
    bigMergeObjects,
  };
}

async function cleanupFixture(pool: Pool, fixture: Fixture) {
  const ids = Object.values(fixture.objectIds);
  await pool
    .query(
      "delete from journal_entries where plant_object_id = any($1::uuid[])",
      [ids],
    )
    .catch(() => undefined);
  await pool.query("delete from plant_objects where id = any($1::uuid[])", [
    ids,
  ]);
  // The fifty-one the big merge sits on were inserted in bulk, so they are
  // cleared by their space rather than by id — and the space cannot go while
  // any of them still points at it.
  await pool.query("delete from plant_objects where space_id = $1::uuid", [
    fixture.spaceId,
  ]);
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
  await signInOwnerFixture({ request: context.request, baseURL });
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
 * A form as a browser without JavaScript sees it: the fields React
 * serialized for a native submit (`$ACTION_REF_n`, `$ACTION_n:0`, and the
 * key), plus the hidden inputs the control carries. Their absence means the
 * form needs hydration, which is exactly what this proof is here to catch.
 */
function readProgressiveForm(
  html: string,
  marker: string,
  overrides: Record<string, string> = {},
) {
  const forms = html.match(/<form[\s\S]*?<\/form>/gu) ?? [];
  const found = forms.find((form) => form.includes(marker));
  if (!found) {
    throw new Error(`No form carrying ${marker} in the rendered HTML.`);
  }
  const action = /<form[^>]*\baction="([^"]*)"/u.exec(found)?.[1] ?? "";
  const fields: Record<string, string> = {};
  for (const input of found.match(/<input\b[^>]*>/gu) ?? []) {
    const name = /\bname="([^"]*)"/u.exec(input)?.[1];
    if (!name) continue;
    fields[decodeHtml(name)] = decodeHtml(
      /\bvalue="([^"]*)"/u.exec(input)?.[1] ?? "",
    );
  }
  if (!Object.keys(fields).some((name) => name.startsWith("$ACTION"))) {
    throw new Error(`The form carrying ${marker} needs hydration.`);
  }
  return { action, fields: { ...fields, ...overrides } };
}

/** Posts what a scripts-off browser would post, and answers its status. */
async function postProgressiveForm(
  baseURL: string,
  path: string,
  cookie: string,
  form: { action: string; fields: Record<string, string> },
) {
  const body = new FormData();
  for (const [name, value] of Object.entries(form.fields)) {
    body.append(name, value);
  }
  const response = await fetch(
    `${baseURL}${form.action === "" ? path : form.action}`,
    {
      method: "POST",
      headers: { accept: "text/html", cookie, origin: baseURL },
      body,
      redirect: "manual",
    },
  );
  return response.status;
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

async function readPrimaryName(pool: Pool, catalogItemId: string) {
  const result = await pool.query<{ display_name: string }>(
    `select display_name from catalog_item_names
     where catalog_item_id = $1::uuid and is_primary limit 1`,
    [catalogItemId],
  );
  return result.rows[0]?.display_name ?? null;
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
