import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "playwright/test";
import { Pool, type PoolClient } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * The public profile and the living-object passport (`OVE-450`).
 *
 * Everything here is a question a unit render cannot answer. Whether the tabs
 * move under the arrow keys and the URL follows is a browser fact. Whether a
 * renamed gardener's old address still answers is a proxy fact. And whether a
 * follow submits **with the bundle absent** is a fact about what React wrote
 * into the `action` attribute of a production build — `OwnerScopedActionForm`
 * and `OwnerScopedProgressiveForm` render identically in jsdom, so the only
 * honest proof is a real POST.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/public-profile.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** With it, the
 * author-scoped rewrite re-enters the proxy and a public address 308s to
 * itself. CI omits the flag.
 */

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const FIXTURE_PREFIX = "ove450";

interface ProfileFixture {
  gardener: SyntheticGardener;
  /** A second gardener who has published nothing. */
  stranger: SyntheticGardener;
  objectSlugs: string[];
  objectIds: string[];
  edgeId: string | null;
}

let pool: Pool;
let fixture: ProfileFixture | null = null;
/**
 * Two signed-in gardeners, signed in **once** for the whole file.
 *
 * Better Auth rate-limits sign-up: the fourth call in a window answers 429 and
 * writes nothing, and Playwright runs spec files in parallel, so a spec that
 * signs a fresh gardener in per test spends the budget of every other spec in
 * the run. This one cost `owner-catalog-curation.spec.ts` its owner on CI.
 * Two contexts are created here and reused; no test signs anybody in.
 */
let authorRequest: APIRequestContext | null = null;
let strangerRequest: APIRequestContext | null = null;

async function selectLocale(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: "uk", url: baseURL },
    { name: INTERFACE_MARKET_COOKIE, value: "ukraine", url: baseURL },
  ]);
}

/** Evaluated through the protocol: the page's CSP blocks a script element. */
async function axeViolations(page: Page) {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, AXE_TAGS);
}

/**
 * A gardener with enough published work for a profile to be worth reading:
 * three living objects, three entries, and one confirmed provenance edge
 * between two of the objects so the passport has a lineage to show.
 *
 * `content_class` is set explicitly. The public surfaces filter on it
 * (`publicLaunchSurfacePredicates`), and a row that misses the set is simply
 * absent from every page — which looks exactly like a rendering defect.
 */
async function seedPublishedWork(
  gardener: SyntheticGardener,
): Promise<{ objectSlugs: string[]; objectIds: string[]; edgeId: string | null }> {
  const run = randomUUID().slice(0, 8);
  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
     returning id::text id`,
    [gardener.id, `${FIXTURE_PREFIX} сад ${run}`],
  );
  const spaceId = space.rows[0]!.id;
  const objectSlugs: string[] = [];
  const objectIds: string[] = [];

  for (let index = 0; index < 3; index += 1) {
    const slug = `${FIXTURE_PREFIX}-obj-${run}-${index}`;
    const object = await pool.query<{ id: string }>(
      `insert into plant_objects
         (owner_user_id, space_id, display_name, object_kind, public_slug,
          variety_text, variety_state)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       returning id::text id`,
      [
        gardener.id,
        spaceId,
        `${FIXTURE_PREFIX} об'єкт ${index + 1}`,
        index === 2 ? "animal" : "plant",
        slug,
        index === 0 ? "Черрі" : null,
        index === 0 ? "free_text" : "unknown",
      ],
    );
    objectSlugs.push(slug);
    objectIds.push(object.rows[0]!.id);

    await pool.query(
      `insert into journal_entries
         (owner_user_id, space_id, plant_object_id, title, body,
          client_mutation_id, public_slug, published_at, entry_date,
          source_language, visibility, lifecycle_state, content_class,
          entry_scope)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(),
               current_date - $8::int, 'uk', 'public', 'active', 'real_ugc',
               'object')`,
      [
        gardener.id,
        spaceId,
        object.rows[0]!.id,
        `${FIXTURE_PREFIX} запис ${index + 1}`,
        "Новий приріст рівний, листя без плям на зворотному боці.",
        randomUUID(),
        `${FIXTURE_PREFIX}-entry-${run}-${index}`,
        index,
      ],
    );
  }

  // One gardener owning both ends is the case the interaction panel renders
  // for: `listLineageInteractionTargets` authorizes the edge's own owner.
  const edge = await pool.query<{ id: string }>(
    `insert into lineage_provenance_edges
       (owner_user_id, subject_plant_object_id, source_kind,
        source_plant_object_id, source_owner_user_id, consent_state,
        erasure_state, client_mutation_id)
     values ($1::uuid, $2::uuid, 'own_object', $3::uuid, $1::uuid,
             'confirmed', 'active', $4)
     returning id::text id`,
    [gardener.id, objectIds[0], objectIds[1], randomUUID()],
  );

  return { objectSlugs, objectIds, edgeId: edge.rows[0]?.id ?? null };
}

/**
 * A multipart body React's server-action endpoint accepts.
 *
 * Playwright's own `multipart` helper drops an empty-string field, and
 * `$ACTION_REF_1` is exactly that — so a form posted through it answers 500
 * with "Failed to find Server Action". This encodes the body by hand.
 */
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

/** Every field of one `<form>` as the browser would submit it. */
function readFormFields(html: string, marker: string) {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gu)].map(
    (match) => match[0],
  );
  const form = forms.find((candidate) => candidate.includes(marker));
  if (!form) return null;
  const action = /<form[^>]*\baction="([^"]*)"/u.exec(form)?.[1] ?? null;
  const fields: Array<[string, string]> = [
    ...form.matchAll(/<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/gu),
  ].map((match) => [match[1]!, decodeHtml(match[2]!)]);
  // React writes `$ACTION_REF_n` as a valueless input; the browser submits it
  // as the empty string, and the endpoint needs it present.
  for (const match of form.matchAll(/<input[^>]*\bname="(\$ACTION_[^"]+)"/gu)) {
    const name = match[1]!;
    if (!fields.some(([existing]) => existing === name)) fields.push([name, ""]);
  }
  return { action, fields };
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

/** One transaction, for the writes a deferrable constraint pairs together. */
async function withTransaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await run(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function followCount(targetUserId: string) {
  const row = await pool.query<{ count: string }>(
    `select count(*)::text as count from profile_follows
      where target_user_id = $1::uuid and follow_state = 'active'`,
    [targetUserId],
  );
  return Number(row.rows[0]?.count ?? "0");
}

test.describe("the public profile and the object passport", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    authorRequest = await playwright.request.newContext();
    strangerRequest = await playwright.request.newContext();
    const gardener = await signInSyntheticGardener({
      baseURL,
      context: { request: authorRequest },
      pool,
      prefix: `${FIXTURE_PREFIX}-author`,
    });
    const stranger = await signInSyntheticGardener({
      baseURL,
      context: { request: strangerRequest },
      pool,
      prefix: `${FIXTURE_PREFIX}-visitor`,
    });
    const seeded = await seedPublishedWork(gardener);
    fixture = { gardener, stranger, ...seeded };
  });

  test.afterAll(async () => {
    if (fixture) {
      await pool.query(
        `delete from lineage_provenance_edges where owner_user_id = $1::uuid`,
        [fixture.gardener.id],
      );
      await pool.query(
        `delete from journal_entries where owner_user_id = $1::uuid`,
        [fixture.gardener.id],
      );
      await pool.query(
        `delete from plant_objects where owner_user_id = $1::uuid`,
        [fixture.gardener.id],
      );
      await pool.query(`delete from spaces where owner_user_id = $1::uuid`, [
        fixture.gardener.id,
      ]);
      await removeSyntheticGardener(pool, fixture.gardener.id);
      await removeSyntheticGardener(pool, fixture.stranger.id);
    }
    await authorRequest?.dispose();
    await strangerRequest?.dispose();
    await pool.end();
  });

  test("axe reports nothing on a full profile, an empty one and both passports", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const surfaces = [
      `/@${fixture!.gardener.handle}`,
      `/@${fixture!.gardener.handle}?tab=entries`,
      `/@${fixture!.stranger.handle}`,
      `/@${fixture!.gardener.handle}/objects/${fixture!.objectSlugs[0]}`,
      `/lineage/objects/${fixture!.objectIds[0]}`,
    ];

    for (const width of [375, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      for (const surface of surfaces) {
        const response = await page.goto(surface, { waitUntil: "load" });
        expect(
          response?.status(),
          `${surface} answered ${response?.status()}`,
        ).toBe(200);
        // The shell streams, so the page is not finished when `load` fires.
        await page.waitForTimeout(1_200);
        const violations = await axeViolations(page);
        expect(
          violations,
          `${surface} at ${width} px: ${JSON.stringify(violations)}`,
        ).toEqual([]);
      }
    }
  });

  test("the tabs move under the arrow keys, and the URL follows", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.goto(`/@${fixture!.gardener.handle}`, { waitUntil: "load" });
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);

    // The shell streams and hydration is not tied to `load`, so a press that
    // lands before React has attached its listener does nothing at all — and
    // reads exactly like a tab list that ignores the arrow keys.
    await page.waitForFunction(
      () => {
        const list = document.querySelector('[role="tablist"]');
        return (
          !!list && Object.keys(list).some((key) => key.startsWith("__react"))
        );
      },
      undefined,
      { timeout: 20_000 },
    );

    // Roving tabindex: Tab enters the list once, arrows move within it.
    await tabs.first().focus();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?tab=entries$/u);
    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toBeFocused();
    await expect(page).toHaveURL(/\?tab=about$/u);
    // Home returns to the first tab, and the first tab is the bare address:
    // absent means unset, here as everywhere else.
    await page.keyboard.press("Home");
    await expect(page).toHaveURL(
      new RegExp(`/@${fixture!.gardener.handle}$`, "u"),
    );

    // A reload lands on the same view, which is the whole point of putting it
    // in the URL. The panel is open before hydration, from the server.
    await page.goto(`/@${fixture!.gardener.handle}?tab=entries`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator('[data-public-profile="v2"][data-profile-tab="entries"]'),
    ).toHaveCount(1);
    await expect(page.locator("#profile-journals")).toBeVisible();
  });

  test("a rename moves every address: 308 for a passport, 410 for the old profile", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const handle = fixture!.gardener.handle;
    const renamed = `${handle.slice(0, 28)}x`;
    // An object no earlier test in this file has opened. The passport caches
    // for hours, and a rename made in SQL cannot fire the tags the real
    // action fires — `src/lib/public-cache-tags.test.ts` is where that list is
    // pinned. Reading a cold passport keeps this proof about the addresses.
    const slug = fixture!.objectSlugs[2]!;
    const objectId = fixture!.objectIds[2]!;

    // This is what a rename is in the schema: the old handle retires, the new
    // one becomes current, and the profile is repointed at it.
    // `user_public_profiles.handle_registry_state` is CHECKed to `current` and
    // only one handle per gardener may be current, so the order matters and
    // the three writes are one transaction on a deferrable foreign key.
    await withTransaction(async (client) => {
      await client.query(
        `update user_handle_registry
            set lifecycle_state = 'retired', retired_at = now()
          where user_id = $1::uuid and normalized_handle = $2`,
        [fixture!.gardener.id, handle],
      );
      await client.query(
        `insert into user_handle_registry
           (normalized_handle, user_id, lifecycle_state, claim_source)
         values ($2, $1::uuid, 'current', 'generated')`,
        [fixture!.gardener.id, renamed],
      );
      await client.query(
        `update user_public_profiles
            set handle = $2, normalized_handle = $2,
                handle_registry_state = 'current', handle_changed_at = now()
          where user_id = $1::uuid`,
        [fixture!.gardener.id, renamed],
      );
    });

    try {
      // ADR-0029 D8: an object's passport keeps every address it has ever
      // had. `plant_object_slug_history` is keyed by `(author_handle, slug)`,
      // and a database trigger wrote the row when the object was created — so
      // the address the gardener's old handle spelled is still resolvable and
      // answers 308 rather than disappearing with the handle.
      const moved = await page.goto(`/@${handle}/objects/${slug}`, {
        waitUntil: "load",
      });
      expect(
        moved?.status(),
        `the old passport address answered ${moved?.status()}`,
      ).toBe(200);
      expect(page.url()).toContain(`/@${renamed}/objects/${slug}`);
      expect(
        moved?.request().redirectedFrom(),
        "the old address answered without a redirect at all",
      ).not.toBeNull();

      const canonical = await page.getAttribute(
        'link[rel="canonical"]',
        "href",
      );
      expect(canonical, `canonical was ${canonical}`).toContain(
        `/@${renamed}/objects/${slug}`,
      );
      expect(canonical).not.toContain(`/@${handle}/`);

      // The graph's own spelling, `/lineage/objects/{uuid}`, is a 308 to the
      // same address: a canonical that redirects is a duplicate signal.
      const byId = await page.goto(`/lineage/objects/${objectId}`, {
        waitUntil: "load",
      });
      expect(byId?.status()).toBe(200);
      expect(page.url()).toContain(`/@${renamed}/objects/${slug}`);

      // A handle is never handed to a second person (ADR-0029), so the old
      // profile address is a tombstone rather than a 404 — 410 tells a
      // crawler to drop it — and it certainly does not still serve the
      // gardener's work.
      const gone = await page.goto(`/@${handle}`, {
        waitUntil: "domcontentloaded",
      });
      expect(
        gone?.status(),
        `the retired handle answered ${gone?.status()}`,
      ).toBe(410);
      const body = await page.content();
      expect(body).not.toContain(`${FIXTURE_PREFIX} запис 1`);
      expect(body).not.toContain(`${FIXTURE_PREFIX} об'єкт 1`);
      expect(body).not.toContain(`${FIXTURE_PREFIX} об'єкт 3`);

      // And the new profile address is live, naming itself as canonical.
      const live = await page.goto(`/@${renamed}`, { waitUntil: "load" });
      expect(live?.status()).toBe(200);
      const profileCanonical = await page.getAttribute(
        'link[rel="canonical"]',
        "href",
      );
      expect(
        profileCanonical,
        `canonical was ${profileCanonical}`,
      ).toContain(`/@${renamed}`);
    } finally {
      await withTransaction(async (client) => {
        await client.query(
          `delete from user_handle_registry
            where user_id = $1::uuid and normalized_handle = $2`,
          [fixture!.gardener.id, renamed],
        );
        await client.query(
          `update user_handle_registry
              set lifecycle_state = 'current', retired_at = null
            where user_id = $1::uuid and normalized_handle = $2`,
          [fixture!.gardener.id, handle],
        );
        await client.query(
          `update user_public_profiles
              set handle = $2, normalized_handle = $2,
                  handle_registry_state = 'current'
            where user_id = $1::uuid`,
          [fixture!.gardener.id, handle],
        );
      });
    }
  });

  test("follow submits with no client bundle at all", async ({ baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // The second gardener's own session, signed in once in `beforeAll`. A
    // gardener does not follow themselves, which is why it is not the author's.
    const request = strangerRequest!;
    {
      const profileUrl = `${baseURL}/uk/@${fixture!.gardener.handle}`;
      const page = await request.get(profileUrl);
      expect(page.status()).toBe(200);
      const form = readFormFields(await page.text(), 'data-auth-intent-control="follow"');
      expect(form, "the profile rendered no follow form").not.toBeNull();

      // This is the discriminator the issue warns about. React writes
      // `action=""` — the page's own address — for a progressively enhanced
      // server-action form and adds the `$ACTION_*` reference the endpoint
      // resolves. A form wrapped in a client closure has neither, and submits
      // only once its bundle has run.
      expect(
        form!.fields.map(([name]) => name).join(" "),
        "no server-action reference in the follow form",
      ).toMatch(/\$ACTION_(ID|REF)/u);

      const before = await followCount(fixture!.gardener.id);
      const encoded = encodeMultipart(form!.fields);
      const posted = await request.post(
        new URL(form!.action || "", profileUrl).toString(),
        {
          headers: { "content-type": encoded.contentType, origin: baseURL },
          data: encoded.body,
          maxRedirects: 0,
        },
      );
      expect(
        posted.status(),
        `the follow endpoint answered ${posted.status()}`,
      ).toBeLessThan(400);
      expect(await followCount(fixture!.gardener.id)).toBe(before + 1);
    }
  });

  test("the passport's lineage forms are real endpoints with scripts off", async ({
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    // The interaction panel renders only for someone the edge authorizes —
    // here the gardener who owns both of its ends, whose session was opened
    // once in `beforeAll`.
    const request = authorRequest!;
    {
      const passportUrl = `${baseURL}/uk/lineage/objects/${fixture!.objectIds[0]}`;
      const response = await request.get(passportUrl);
      expect(response.status()).toBe(200);
      const html = await response.text();

      // Both converted call sites live on this page. Whatever the viewer's
      // rights, the forms that *are* rendered must carry a real endpoint —
      // that is what `OwnerScopedProgressiveForm` buys and what the identical
      // jsdom render hides.
      const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gu)].map(
        (match) => match[0],
      );
      expect(forms.length, "the passport rendered no forms").toBeGreaterThan(0);
      for (const form of forms) {
        const opening = /<form\b[^>]*>/u.exec(form)?.[0] ?? "";
        // Every form on a public page submits without JavaScript, one of two
        // ways: it names a real endpoint of its own (`/auth/intent/start`),
        // or it is a server action and carries the reference the endpoint
        // resolves. A client closure has neither — that is the defect that
        // shipped once and made every owner decision answer 500.
        const namesAnEndpoint = /\baction="[^"]+"/u.test(opening);
        const isServerAction = /\$ACTION_(ID|REF)/u.test(form);
        expect(
          namesAnEndpoint || isServerAction,
          `this form submits only with a bundle: ${opening}`,
        ).toBe(true);
        expect(opening).not.toMatch(/\baction="javascript:/u);
      }
      // Both converted call sites are server actions, so at least one form
      // here must carry a reference rather than an endpoint of its own.
      expect(html).toMatch(/\$ACTION_(ID|REF)/u);
    }
  });
});
