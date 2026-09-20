import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";

import {
  cleanupPublishedEntryFixture,
  seedPublishedEntryFixture,
  type PublishedEntryFixture,
} from "./helpers/entry-fixture";

import {
  cleanupOrganismFixture,
  requiredLocalDatabaseUrl,
  seedOrganismFixture,
  type OrganismFixture,
} from "./helpers/organism-fixture";

/**
 * Does a public page hydrate below the shell on a hard load?
 *
 * Written to settle OVE-380. On 2026-09-04 an in-app preview browser reported
 * that `document.body`'s first child carried React fibers and nothing beneath it
 * did — not `main`, not the site shell, not the language control — with
 * unresolved postponed templates left in the document. Read literally that would
 * mean every client control on every public page was inert.
 *
 * It did not reproduce. Against both a local production build and production
 * itself, a real Chromium hydrates `main`, the like control and the language
 * control, and leaves no postponed template unresolved. The original reading was
 * an artefact of that preview browser, not a property of the site.
 *
 * The spec stays because the question is worth keeping answered: a real
 * hydration regression on a public page would be invisible in unit tests and
 * expensive to find by hand. It runs against a **production build** on purpose —
 * the postpone/resume path does not exist under `next dev`, so a dev-server run
 * would report a false pass.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/public-hydration.spec.ts
 */

interface HydrationProbe {
  bodyFirstChild: boolean;
  main: boolean;
  deepestHydrated: string | null;
  postponedTemplates: number;
  scriptCount: number;
}

const PUBLIC_PATHS = ["/journals", "/objects", "/knowledge"];

async function probeHydration(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  // Hydration is not tied to `load`; give React a real chance before
  // concluding anything, so a slow pass is not read as a failure.
  await page.waitForTimeout(3_000);

  const probe = await page.evaluate<HydrationProbe>(() => {
    const hydrated = (element: Element | null) =>
      element
        ? Object.keys(element).some((key) => key.startsWith("__react"))
        : false;

    // The deepest element carrying a fiber names where hydration stopped.
    let deepest: Element | null = null;
    let depth = -1;
    for (const element of document.querySelectorAll("*")) {
      if (!hydrated(element)) continue;
      let current: Element | null = element;
      let elementDepth = 0;
      while ((current = current.parentElement)) elementDepth += 1;
      if (elementDepth > depth) {
        depth = elementDepth;
        deepest = element;
      }
    }

    return {
      bodyFirstChild: hydrated(document.body.firstElementChild),
      main: hydrated(document.querySelector("main")),
      deepestHydrated: deepest
        ? `${deepest.tagName.toLowerCase()}${deepest.id ? `#${deepest.id}` : ""}`
        : null,
      postponedTemplates: document.querySelectorAll("template[id]").length,
      scriptCount: document.querySelectorAll("script[src]").length,
    };
  });

  // Reported whatever the outcome, so a failing run carries its evidence.
  test.info().annotations.push({
    type: "hydration probe",
    description: JSON.stringify(probe),
  });

  expect(
    probe.scriptCount,
    "the page must actually load its client bundle",
  ).toBeGreaterThan(0);
  expect(
    probe.main,
    `main carried no React fiber; deepest hydrated node was ${probe.deepestHydrated}`,
  ).toBe(true);
  return probe;
}

test.describe("public pages hydrate below the shell", () => {
  // The entry the two control tests act on. They used to read the first card
  // off the home feed and skip when there was none — and the home feed is a
  // static document now (ADR-0032): prerendered at build, on CI from an empty
  // database, so it lists nothing a spec seeded afterwards. A test that needs
  // an entry makes one.
  let entryPool: Pool;
  let entry: PublishedEntryFixture;

  test.beforeAll(async () => {
    entryPool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    entry = await seedPublishedEntryFixture(entryPool, "ove377");
  });

  test.afterAll(async () => {
    await cleanupPublishedEntryFixture(entryPool, entry);
    await entryPool.end();
  });

  for (const path of PUBLIC_PATHS) {
    test(`${path} hydrates its main region`, async ({ page }) => {
      await probeHydration(page, path);
    });
  }

  // The organism card (ADR-0026 D9) is a species page with one public entry,
  // seeded here because a fresh database holds no organism.
  test("a species card hydrates its main region and hides no fact", async ({
    page,
  }) => {
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    let fixture: OrganismFixture | null = null;
    try {
      fixture = await seedOrganismFixture(pool, "ove389");
      await probeHydration(page, `/species/${fixture.speciesSlug}`);
      await expect(page.locator("[data-organism-fact]")).toContainText(
        "Solanum lycopersicum",
      );
      // "Names and sources" shipped closed until `OVE-452`. It is a real
      // section now: a collapsed section is invisible to a crawler even
      // though it is in the DOM, and that one holds the identifiers `sameAs`
      // is built from and the source behind every fact. ADR-0026 D9 is
      // amended in place with the reason.
      await expect(
        page.locator('details[data-organism-section="names-and-sources"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('section[data-organism-section="names-and-sources"]'),
      ).toBeVisible();
    } finally {
      if (fixture) await cleanupOrganismFixture(pool, fixture);
      await pool.end();
    }
  });

  test("a public control acts on a hard load", async ({ page }) => {
    await page.goto(entry.entryPath, { waitUntil: "load" });

    // Scoped to the engagement panel. Since `OVE-447` a filter chip is also a
    // `button[aria-pressed]` — that is what makes a chip's state audible — so
    // an unscoped locator would press a filter and report it as a like.
    //
    // The panel arrives with the streamed shell, not with `load`, so the wait
    // is the 20 s every other proof of streamed content in this suite uses.
    // At 10 s this was the shortest budget in the repository and it lost a
    // full CI run on 2026-09-18 — while `journal-entry.spec.ts` asserted the
    // same control on the same commit and passed, which is what says the wait
    // was short rather than the control missing.
    // `:visible`, because for a moment there are two. The document carries the
    // guest's panel in its bytes and the reader's own arrives in a hidden
    // segment that React swaps in (ADR-0032 D2); between the arrival and the
    // swap both are in the DOM, and a bare `#comments` is a strict-mode
    // violation exactly then — once in CI, never on a laptop.
    const panel = page.locator("#comments:visible");
    await panel.waitFor({ state: "visible", timeout: 20_000 });
    const like = panel.locator("button[aria-pressed]").first();
    await like.waitFor({ state: "visible", timeout: 20_000 });

    // Whatever hydration does, the control must reach the server: since OVE-377
    // it is a Server Action form with a real endpoint, so a browser that never
    // ran the client bundle still posts it.
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" && candidate.status() < 500,
        { timeout: 10_000 },
      ),
      like.click(),
    ]);

    expect(response.status()).toBeLessThan(400);
  });

  test("the like endpoint answers with no client bundle at all", async ({
    request,
    baseURL,
  }) => {
    // The stronger question, and the one `OVE-447` asks: not "does it work
    // after hydration" but "does it work when there is no hydration".
    //
    // It is asked over HTTP: the subject is the endpoint, and this sends it
    // exactly what a browser's own form submission would — the action
    // reference, the action key, and the target in `formData`. Until `OVE-461`
    // there was no other way to ask: a scripts-off browser saw no visible text
    // at all, because every page arrived through the document's one Suspense
    // boundary. The entry is a static document now (ADR-0032) and the form is
    // in its served bytes — which `static-documents.spec.ts` asserts, scripts
    // off, in a browser.
    const entryUrl = new URL(entry.entryPath, baseURL!).toString();

    const document = await request.get(entryUrl);
    expect(document.status()).toBe(200);
    const form = readLikeForm(await document.text());
    expect(
      form,
      "the entry page rendered no like form with a real endpoint",
    ).not.toBeNull();

    // React writes `action="javascript:throw …"` for a form whose action is a
    // client closure and replaces it on hydration, so an empty `action` — post
    // to this URL — is itself part of the proof (ADR-0024 D3).
    expect(form!.action).toBe("");
    expect(form!.fields.targetKind).toBe("journal_entry");

    // The body is assembled by hand rather than through Playwright's
    // `multipart` helper, which drops a field whose value is the empty
    // string — and `$ACTION_REF_1` is exactly that. Without it Next finds no
    // action id at all and answers "Failed to find Server Action", which reads
    // as the defect this test exists to catch rather than as a harness
    // artefact.
    const body = encodeMultipart(form!.fields);
    const response = await request.post(entryUrl, {
      headers: {
        origin: new URL(baseURL!).origin,
        "content-type": `multipart/form-data; boundary=${body.boundary}`,
      },
      data: body.buffer,
    });
    expect(
      response.status(),
      await response.text().catch(() => ""),
    ).toBeLessThan(400);

    // And the like was actually recorded: the count the next render carries is
    // one higher. A 200 from a Server Action endpoint that changed nothing
    // would pass the assertion above and fail the product.
    const after = readLikeForm(await (await request.get(entryUrl)).text());
    expect(after?.activeLikeCount).toBe(form!.activeLikeCount + 1);
  });
});

test.describe("choosing a language is a choice, not a hover", () => {
  test("hovering an option requests nothing, clicking it switches and sticks", async ({
    page,
    context,
  }) => {
    await page.goto("/bg/journals", { waitUntil: "load" });

    await page.locator("summary").first().click();
    const option = page.locator('a[data-interface-locale="ru"]').first();
    await option.waitFor({ state: "visible", timeout: 10_000 });

    // The assertion is the request, not the cookie, and deliberately so. The
    // proxy reads the preference from the locale prefix a request lands on, and
    // Next strips `Next-Router-Prefetch` before middleware runs — so any
    // prefetch of `/ru/…` answers `Set-Cookie: …locale=ru`. Whether the browser
    // has applied it by the time this test looks is a race, and a cookie
    // assertion passed against the broken build. The absence of the request is
    // not a race: without `prefetch={false}` the hover fired five of them.
    const crossLocale: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/ru/")) {
        crossLocale.push(request.url());
      }
    });

    await option.hover();
    await page.waitForTimeout(2_000);
    expect(crossLocale).toEqual([]);
    expect(await page.locator("html").getAttribute("lang")).toBe("bg");

    await option.click();
    await page.waitForURL("**/ru/journals", { timeout: 10_000 });

    expect(await page.locator("html").getAttribute("lang")).toBe("ru");
    await expect
      .poll(
        async () =>
          (await context.cookies()).find(
            (cookie) => cookie.name === "overgarden_interface_locale",
          )?.value ?? null,
        { timeout: 10_000 },
      )
      .toBe("ru");
  });
});

/**
 * The like form as the browser sees it: its `action`, every hidden field, and
 * the count the render carried.
 *
 * Parsed out of the served HTML rather than read through the DOM, because the
 * point of the check above is that nothing on the client has run.
 */
function readLikeForm(document: string): {
  action: string;
  fields: Record<string, string>;
  activeLikeCount: number;
} | null {
  const marker = document.indexOf('name="targetKind" value="journal_entry"');
  if (marker < 0) return null;
  const start = document.lastIndexOf("<form", marker);
  const end = document.indexOf("</form>", marker);
  if (start < 0 || end < 0) return null;
  const fragment = document.slice(start, end);

  const action = /<form[^>]*\saction="([^"]*)"/u.exec(fragment)?.[1] ?? null;
  if (action === null) return null;

  const fields: Record<string, string> = {};
  for (const match of fragment.matchAll(
    /<input[^>]*type="hidden"[^>]*name="([^"]+)"(?:[^>]*value="([^"]*)")?[^>]*\/>/gu,
  )) {
    fields[decodeEntities(match[1]!)] = decodeEntities(match[2] ?? "");
  }

  const state = fields["$ACTION_1:1"];
  const activeLikeCount = state
    ? (JSON.parse(state) as Array<{ activeLikeCount?: number }>)[0]
        ?.activeLikeCount
    : undefined;

  return {
    action,
    fields,
    activeLikeCount: typeof activeLikeCount === "number" ? activeLikeCount : -1,
  };
}

function decodeEntities(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * One `multipart/form-data` body, byte for byte as a browser would send it.
 *
 * Field order is preserved, and a field whose value is the empty string is
 * still a field — `$ACTION_REF_1` is one, and it is the field that tells Next
 * there is an action to decode at all.
 */
function encodeMultipart(fields: Record<string, string>) {
  const boundary = `----OverGardenProof${Date.now().toString(36)}`;
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return { boundary, buffer: Buffer.from(parts.join(""), "utf8") };
}
