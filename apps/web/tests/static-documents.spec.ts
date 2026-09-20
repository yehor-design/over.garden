import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "playwright/test";
import { Pool } from "pg";

import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";
import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";
import { waitForHydration } from "./helpers/hydration";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * A public page is a static document (ADR-0032, `OVE-461`).
 *
 * What is asserted here is what a reader gets **from the served bytes**: the
 * page's heading and its photograph outside every `<div hidden>`, the title and
 * the photograph's preload in `<head>`, and words on the screen with no runtime
 * at all. None of that can be asked of the DOM — by the time a DOM exists,
 * React's inline runtime has already moved a streamed page into place, and a
 * document that paints at TTI looks exactly like one that paints from its first
 * byte. So the first half of this file is HTTP and string offsets.
 *
 * The second half is the other side of the same decision: the few regions that
 * *are* request data — who is reading — still arrive, hydrate cleanly, and do
 * not leave a streamed segment behind. The defect this guards was real and
 * silent: a boundary that completes during a prerender is given a segment id
 * the request-time resume allots again (ADR-0032 D3), and the page rendered
 * with five segments never revealed and no test failing.
 *
 * Against a **production build** — `next dev` has no postpone/resume path and
 * reports a false pass:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/static-documents.spec.ts
 */

// Three prefixes, not one: `seedOrganismFixture` first removes every gardener
// whose e-mail starts with its own prefix — that is how it clears a stale run —
// and with a shared prefix it removed the entry's gardener a line after this
// file had made them. The entry then answered 404, on the line that asked for
// it, for a reason that was neither the entry nor the document.
const ENTRY_PREFIX = "ove461entry";
const ORGANISM_PREFIX = "ove461card";
const MEMBER_PREFIX = "ove461member";

interface StaticFixture {
  entry: PublishedEntryFixture;
  ownerUserId: string;
  handle: string;
  entryPath: string;
  organism: OrganismFixture;
}

/** Offsets of every `<div hidden id="S:…">` segment, by walking `<div>` depth. */
function hiddenSegments(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const opener = /<div hidden(?:="")? id="S:[0-9a-f]+">/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(html))) {
    let depth = 1;
    const tag = /<(\/?)div\b[^>]*>/g;
    tag.lastIndex = match.index + match[0].length;
    let end = html.length;
    let next: RegExpExecArray | null;
    while ((next = tag.exec(html))) {
      depth += next[1] ? -1 : 1;
      if (depth === 0) {
        end = next.index + next[0].length;
        break;
      }
    }
    ranges.push([match.index, end]);
    opener.lastIndex = end;
  }
  return ranges;
}

function readStaticDocument(html: string) {
  const ranges = hiddenSegments(html);
  const hiddenAt = (offset: number) =>
    ranges.some(([start, end]) => offset >= start && offset < end);
  const head = html.slice(0, Math.max(0, html.indexOf("</head>")));
  let served = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    served += html.slice(cursor, start);
    cursor = end;
  }
  served += html.slice(cursor);
  const visibleText = served
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<template[\s\S]*?<\/template>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const headingAt = html.indexOf("<h1");
  const imageAt = html.indexOf("<img");

  return {
    titleInHead: /<title>/.test(head),
    imagePreloadInHead: /<link rel="preload" as="image"/.test(head),
    heading: headingAt === -1 ? null : { hidden: hiddenAt(headingAt) },
    image: imageAt === -1 ? null : { hidden: hiddenAt(imageAt) },
    skeleton: html.includes('data-site-shell-state="loading"'),
    visibleText,
  };
}

/**
 * Installed before the document's own scripts: records what happens to every
 * segment React's inline runtime is asked to reveal, and **holds each reveal
 * back** for `SEGMENT_HOLD_MS`.
 *
 * The hold is the point. Whether React adopts a streamed segment or throws it
 * away is decided by an order of events — *hydrate, learn something, reveal* —
 * that a fast machine produces and a slow one does not: measured on
 * 2026-09-20, `/communities/{slug}` dropped its whole `<main>` at full speed
 * and kept it under a 4× CPU throttle. A gate that depends on how busy the
 * runner is proves nothing on the day it matters, so this one makes the
 * dangerous order the only order: by the time anything is revealed the chrome
 * has hydrated, read its address and heard who is reading.
 *
 * `$RC(boundary, segment)` queues a reveal and `$RV(batch)` performs a batch
 * of them; a boundary whose start marker has left the document by then was
 * rendered on the client, and its segment is discarded (ADR-0032 D10).
 */
const SEGMENT_HOLD_MS = 1_200;

interface SegmentOutcome {
  boundary: string;
  outcome: "adopted" | "dropped";
  holds: string;
}

function installSegmentProbe(holdMs: number) {
  const outcomes: SegmentOutcome[] = [];
  (window as unknown as { __segmentOutcomes: SegmentOutcome[] }).__segmentOutcomes =
    outcomes;
  const describe = (segment: Element | null) =>
    (segment?.innerHTML ?? "").replace(/\s+/gu, " ").slice(0, 120);

  let complete: ((boundary: string, segment: string) => unknown) | undefined;
  Object.defineProperty(window, "$RC", {
    configurable: true,
    get: () => complete,
    set: (original: (boundary: string, segment: string) => unknown) => {
      complete = function (this: unknown, boundary, segment) {
        const node = document.getElementById(segment);
        if (node && !document.getElementById(boundary)) {
          outcomes.push({ boundary, outcome: "dropped", holds: describe(node) });
        }
        return original.call(this, boundary, segment);
      };
    },
  });

  let reveal: ((batch: Element[]) => unknown) | undefined;
  Object.defineProperty(window, "$RV", {
    configurable: true,
    get: () => reveal,
    set: (original: (batch: Element[]) => unknown) => {
      reveal = function (this: unknown, batch) {
        // The same array, not a copy: whatever is queued during the hold is
        // pushed onto it and revealed with the rest.
        setTimeout(() => {
          for (let index = 0; index < batch.length; index += 2) {
            const boundary = batch[index]!;
            outcomes.push({
              boundary: boundary.id,
              outcome: boundary.parentNode ? "adopted" : "dropped",
              holds: boundary.parentNode ? "" : describe(batch[index + 1]!),
            });
          }
          original.call(this, batch);
        }, holdMs);
      };
    },
  });
}

async function getDocument(request: APIRequestContext, path: string) {
  const response = await request.get(path, {
    maxRedirects: 0,
    headers: { accept: "text/html" },
  });
  return { status: response.status(), html: await response.text() };
}

async function seedStaticFixture(pool: Pool): Promise<StaticFixture> {
  const entry = await seedPublishedEntryFixture(pool, ENTRY_PREFIX, {
    title: "Статичний документ: перший запис",
  });
  const organism = await seedOrganismFixture(pool, ORGANISM_PREFIX);
  await photographTheSpeciesEntry(pool, organism);
  return {
    entry,
    ownerUserId: entry.ownerUserId,
    handle: entry.handle,
    entryPath: entry.entryPath,
    organism,
  };
}

/**
 * A gardener's photograph on the organism card. The shared organism fixture is
 * words only, and a card without a photograph cannot show the defect this file
 * guards: on production the first gardener photograph was the card's LCP
 * element and `loading="lazy"` (`OVE-470`). As with the entry fixture, the row
 * is what puts the `<img>` in the document; no file answers behind it, and the
 * box is reserved either way (DESIGN.md §2.10).
 */
async function photographTheSpeciesEntry(pool: Pool, organism: OrganismFixture) {
  const photographed = await pool.query(
    `insert into media_assets (id, owner_user_id, journal_entry_id, derivative_key, alt_text, caption,
       document_position, usage_role, intrinsic_width, intrinsic_height, focal_x, focal_y,
       upload_generation, declared_size_bytes, variant_long_edges)
     select $1, entry.owner_user_id, entry.id, $2, 'Помідор на балконі, перше суцвіття',
            'Помідор на балконі, перше суцвіття', 0, 'inline', 2560, 1440, 0.5, 0.45, 1, 56744,
            '{1280,480}'
       from journal_entries as entry
       join plant_objects as object on object.id = entry.plant_object_id
      where entry.owner_user_id = $3::uuid and object.catalog_item_id = $4::uuid`,
    [
      randomUUID(),
      `derivatives/${randomUUID()}/1.webp`,
      organism.ownerUserId,
      organism.speciesId,
    ],
  );
  if (photographed.rowCount !== 1) {
    throw new Error(
      `${ORGANISM_PREFIX}: expected one species entry to photograph, found ${photographed.rowCount}`,
    );
  }
}

/**
 * The largest photograph on the first screen, as the browser laid it out —
 * before any scroll, which is when the LCP is decided.
 *
 * Asked of geometry rather than of a `largest-contentful-paint` entry: the
 * fixture's photographs have a row and no file, and an image that never paints
 * is never an LCP candidate. Its box is reserved all the same, so where it sits
 * and how it is asked for are both in the document.
 */
function largestPhotographOnTheFirstScreen() {
  const candidates = [...document.querySelectorAll("img")].flatMap((image) => {
    const box = image.getBoundingClientRect();
    const width = Math.min(box.right, window.innerWidth) - Math.max(box.left, 0);
    const height =
      Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
    // An avatar is not what a page's LCP waits for.
    if (box.width < 96 || box.height < 96 || width <= 0 || height <= 0) return [];
    // Neither is an empty state's illustration. It is decorative app art —
    // `alt=""`, 144 px, shipped with the code (DESIGN.md §2.9) — and it is
    // lazy on purpose. On a listing with nothing in it, it is nevertheless the
    // largest image on the first screen, which is how this rule came to fail
    // on a gate database whose feed had been emptied. A photograph of a
    // gardener's own plant always carries a real name.
    if ((image.getAttribute("alt") ?? "") === "") return [];
    return [
      {
        visibleArea: Math.round(width * height),
        loading: image.loading,
        fetchPriority: image.getAttribute("fetchpriority"),
        src: image.getAttribute("src") ?? "",
      },
    ];
  });
  candidates.sort((a, b) => b.visibleArea - a.visibleArea);
  return candidates[0] ?? null;
}

test.describe("a public page is a static document", () => {
  // One fixture, one worker: every test below reads the same entry and card.
  test.describe.configure({ mode: "serial" });

  let pool: Pool;
  let fixture: StaticFixture;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    fixture = await seedStaticFixture(pool);
  });

  test.afterAll(async () => {
    if (fixture) {
      await cleanupPublishedEntryFixture(pool, fixture.entry);
      await cleanupOrganismFixture(pool, fixture.organism);
    }
    await pool.end();
  });

  test("the home feed is in the served bytes", async ({ request }) => {
    const { status, html } = await getDocument(request, "/");
    expect(status).toBe(200);
    const served = readStaticDocument(html);

    expect(served.titleInHead, "<title> inside <head>").toBe(true);
    expect(served.skeleton, "no loading skeleton in front of the page").toBe(
      false,
    );
    expect(served.heading, "the page's <h1>").not.toBeNull();
    expect(served.heading?.hidden, "<h1> outside every hidden segment").toBe(
      false,
    );
    // The chrome alone is some four hundred characters; a page is more.
    expect(served.visibleText.length).toBeGreaterThan(600);
  });

  test("a journal entry and its photograph are in the served bytes", async ({
    request,
  }) => {
    // Twice: the first request renders the address and the result is kept
    // (ADR-0032 D6), so the second is the one most readers get.
    for (const attempt of [1, 2]) {
      const { status, html } = await getDocument(request, fixture.entryPath);
      expect(status, `request ${attempt}`).toBe(200);
      const served = readStaticDocument(html);

      expect(served.titleInHead, `request ${attempt}: <title> in <head>`).toBe(
        true,
      );
      expect(served.skeleton, `request ${attempt}: no skeleton`).toBe(false);
      expect(served.heading?.hidden, `request ${attempt}: <h1>`).toBe(false);
      expect(served.image?.hidden, `request ${attempt}: <img>`).toBe(false);
      expect(
        served.imagePreloadInHead,
        `request ${attempt}: the photograph's preload in <head>`,
      ).toBe(true);
      expect(served.visibleText).toContain("Статичний документ: перший запис");
      expect(served.visibleText).toContain("Новий приріст рівний");
    }
  });

  test("an organism card is in the served bytes", async ({ request }) => {
    const path = `/species/${fixture.organism.speciesSlug}`;
    for (const attempt of [1, 2]) {
      const { status, html } = await getDocument(request, path);
      expect(status, `request ${attempt}`).toBe(200);
      const served = readStaticDocument(html);

      expect(served.titleInHead, `request ${attempt}: <title> in <head>`).toBe(
        true,
      );
      expect(served.skeleton, `request ${attempt}: no skeleton`).toBe(false);
      expect(served.heading?.hidden, `request ${attempt}: <h1>`).toBe(false);
      expect(served.visibleText.length).toBeGreaterThan(900);
    }
  });

  test("the largest photograph on the first screen is asked for at once", async ({
    page,
  }) => {
    // A lazy image is not requested until layout has found it near the
    // viewport, so a lazy LCP element spends the stylesheet's whole download
    // unasked-for: 2.9 s on production's organism card on 2026-09-20, where the
    // first gardener photograph was exactly that (`OVE-470`). A phone and a
    // desk, because what is on the first screen differs between them.
    const card = `/species/${fixture.organism.speciesSlug}`;
    for (const viewport of [
      { width: 412, height: 823 },
      { width: 1_440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const address of [
        "/",
        "/journals",
        fixture.entryPath,
        `/@${fixture.handle}`,
        card,
      ]) {
        await page.goto(address, { waitUntil: "load" });
        const largest = await page.evaluate(largestPhotographOnTheFirstScreen);
        const where = `${address} at ${viewport.width} px`;
        // The entry and the card are this file's own rows, so their photograph
        // is known to be there; a listing shows whatever the database holds.
        if (address === fixture.entryPath || address === card) {
          expect(largest, `${where}: a photograph on the first screen`).not.toBeNull();
        }
        expect(
          largest?.loading ?? "eager",
          `${where}: ${largest?.src} is the largest photograph on the first screen`,
        ).toBe("eager");
      }
    }
  });

  test("a filtered feed renders from its twin, and the twin is not an address", async ({
    request,
  }) => {
    // The first chip is "recent": pressed on the plain feed, released once a
    // kind is chosen. Asked of the chips' own attributes, in the order they are
    // served — the twin renders at request time, so a chip's *label* arrives in
    // a later segment and is not in the bytes beside its button.
    const chips = (html: string) =>
      [...html.matchAll(/data-slot="toggle-chip" aria-pressed="(true|false)"/gu)]
        .slice(0, 3)
        .map((match) => match[1]);
    const plain = await getDocument(request, "/");
    const filtered = await getDocument(request, "/?kind=plant");
    expect(filtered.status).toBe(200);
    expect(chips(plain.html)).toEqual(["true", "false", "false"]);
    // The query string was read — by the twin, since the page at `/` cannot.
    expect(chips(filtered.html)).toEqual(["false", "true", "false"]);
    // A parameter the policy for a change of language drops is still the
    // feed's own: `topic` renders from the twin too.
    const byTopic = await getDocument(request, "/?topic=no-such-topic");
    expect(byTopic.status).toBe(200);
    expect(readStaticDocument(byTopic.html).skeleton).toBe(true);

    // What no listing reads is not a reason to leave the static document.
    const tracked = await getDocument(request, "/?utm_source=newsletter");
    expect(tracked.status).toBe(200);
    expect(readStaticDocument(tracked.html).heading?.hidden).toBe(false);

    for (const address of ["/q", "/uk/q", "/bg/q", "/q/journals"]) {
      const response = await getDocument(request, address);
      expect(response.status, address).toBe(404);
    }
  });

  test("a reader without JavaScript reads the page", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      for (const address of [
        "/",
        fixture.entryPath,
        `/species/${fixture.organism.speciesSlug}`,
      ]) {
        await page.goto(address, { waitUntil: "load" });
        await expect(page.locator("h1").first(), address).toBeVisible();
        const characters = await page.evaluate(
          () => document.body.innerText.replace(/\s+/g, " ").trim().length,
        );
        expect(characters, `${address}: visible characters`).toBeGreaterThan(
          600,
        );
        // Nothing measures a reader without JavaScript, so nothing asks them.
        await expect(
          page.locator("[data-analytics-consent-banner]"),
          address,
        ).toBeHidden();
      }
    } finally {
      await context.close();
    }
  });

  test("the chrome hydrates cleanly and leaves no streamed segment behind", async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });

    for (const address of [
      "/",
      "/?kind=plant",
      "/journals",
      "/catalog",
      fixture.entryPath,
      `/@${fixture.handle}`,
      `/species/${fixture.organism.speciesSlug}`,
    ]) {
      await page.setViewportSize({ width: 1_440, height: 900 });
      await page.goto(address, { waitUntil: "load" });
      await waitForHydration(page.locator('[data-site-shell-region="header"]'));
      // Every region has settled once the guest's account control is drawn by
      // React rather than by the prerender.
      await expect(
        page.locator('[data-site-shell-action="sign-in"]:visible').first(),
        address,
      ).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                document.querySelectorAll('div[hidden][id^="S:"]').length +
                document.querySelectorAll('template[id^="B:"]').length,
            ),
          { message: `${address}: a streamed segment was never revealed` },
        )
        .toBe(0);
    }

    // A failed photograph is the fixture's (its file does not exist), not the
    // document's.
    const real = problems.filter(
      (problem) => !/Failed to load resource|ERR_|net::/u.test(problem),
    );
    expect(real, real.join("\n")).toEqual([]);
  });

  test("React adopts every segment the server streams, for a guest and for a gardener", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    test.setTimeout(180_000);
    const community = await pool.query<{ slug: string }>(
      `select slug from communities
        where lifecycle_state = 'active' order by slug limit 1`,
    );
    // A static page with request-time regions, a listing that reads its query
    // string, and the families that still render at request time inside the
    // static chrome — where the segment at stake is the page's whole `<main>`.
    const addresses = [
      "/",
      "/?kind=plant",
      fixture.entryPath,
      `/species/${fixture.organism.speciesSlug}`,
      "/journals",
      "/catalog",
      "/knowledge",
      "/communities",
      `/@${fixture.handle}`,
      ...community.rows.map((row) => `/communities/${row.slug}`),
    ];

    const readers = [
      { name: "a guest", signIn: false },
      // A gardener is the harder case: the session that settles after
      // hydration is not the guest's the document was drawn for, so every
      // region that depends on it really does change.
      { name: "a gardener", signIn: true },
    ];
    for (const reader of readers) {
      const context = await browser.newContext({
        viewport: { width: 1_440, height: 900 },
      });
      await context.addCookies([
        { name: "overgarden_interface_locale", value: "uk", url: baseURL },
      ]);
      const gardener = reader.signIn
        ? await signInSyntheticGardener({
            baseURL,
            context,
            pool,
            prefix: MEMBER_PREFIX,
          })
        : null;
      try {
        const page = await context.newPage();
        await page.addInitScript(installSegmentProbe, SEGMENT_HOLD_MS);
        for (const address of addresses) {
          await page.goto(address, { waitUntil: "load" });
          await waitForHydration(
            page.locator('[data-site-shell-region="header"]'),
          );
          // Everything queued has had its turn once nothing is left hidden.
          await expect
            .poll(
              () =>
                page.evaluate(
                  () =>
                    document.querySelectorAll('div[hidden][id^="S:"]').length +
                    document.querySelectorAll('template[id^="B:"]').length,
                ),
              {
                timeout: 20_000,
                message: `${address}: a segment was never revealed for ${reader.name}`,
              },
            )
            .toBe(0);

          const outcomes = await page.evaluate(
            () =>
              (window as unknown as { __segmentOutcomes: SegmentOutcome[] })
                .__segmentOutcomes,
          );
          // The probe saw the stream: every one of these documents has at
          // least the chrome's session regions to reveal.
          expect(
            outcomes.length,
            `${address}: the probe recorded nothing for ${reader.name}`,
          ).toBeGreaterThan(0);
          expect(
            outcomes.filter((entry) => entry.outcome === "dropped"),
            `${address}: React rendered a streamed boundary on the client for ${reader.name}`,
          ).toEqual([]);
        }
      } finally {
        await context.close();
        if (gardener) await removeSyntheticGardener(pool, gardener.id);
      }
    }
  });

  test("the current section is marked before React is there to say so", async ({
    browser,
  }) => {
    // With scripts on but the bundle blocked: the inline script still runs,
    // and that is all the first paint has.
    const context = await browser.newContext();
    await context.route("**/_next/static/chunks/**/*.js", (route) =>
      route.abort(),
    );
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1_440, height: 900 });
      await page.goto("/journals", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute(
        "data-shell-section",
        "journals",
      );
      const item = page.locator('[data-site-shell-nav-item="journals"]');
      const other = page.locator('[data-site-shell-nav-item="catalogue"]');
      const [active, inactive] = await Promise.all([
        item.evaluate((node) => getComputedStyle(node).backgroundColor),
        other.evaluate((node) => getComputedStyle(node).backgroundColor),
      ]);
      expect(active, "the current item is filled").not.toBe(inactive);
    } finally {
      await context.close();
    }
  });

  test("a gardener's regions arrive with the session, in the same boxes", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: MEMBER_PREFIX,
    });
    try {
      await page.setViewportSize({ width: 1_440, height: 900 });
      await page.goto(fixture.entryPath, { waitUntil: "load" });

      await expect(
        page.locator('[data-site-shell-account-menu-trigger="true"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-site-shell-action="sign-in"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-site-shell-nav-item="garden"]'),
      ).toBeVisible();
      // The action opens the composer for a gardener, not the sign-in screen.
      await expect(
        page.locator('[data-site-shell-action="new-entry"]').first(),
      ).toHaveAttribute("href", /^\/garden/u);

      // And the document itself still carries the guest's chrome: it is one
      // document for everybody.
      const { html } = await getDocument(context.request, fixture.entryPath);
      expect(readStaticDocument(html).heading?.hidden).toBe(false);
    } finally {
      await removeSyntheticGardener(pool, gardener.id);
    }
  });
});
