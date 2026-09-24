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
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";
import { WCAG_AA_TAGS } from "./helpers/redesign-accessibility";

/**
 * The community family (`OVE-454`): a list, a community, a discussion.
 *
 * What this spec is actually guarding, in the order the acceptance criteria
 * put it:
 *
 * - **A community shows what it has.** The gate database holds exactly the
 *   shape the task was written about — one community, nothing in it — so the
 *   empty case is the fixture and needs no seeding. The full case does, and
 *   this file seeds it.
 * - **An empty community is one state.** Not a filter bar over nothing, a
 *   heading with a nought beside it, and a contribution picker with an empty
 *   select stacked on each other.
 * - **Join works before hydration.** A `multipart` POST of the rendered form,
 *   with the `$ACTION_*` reference React writes for a real endpoint — the one
 *   discriminator that tells a progressive form from a closure.
 * - **The thread is two deep, and every comment is addressable.** Including
 *   the third level, which the renderer used to drop on the floor.
 *
 * Against a **production build**:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/communities.spec.ts
 *
 * **Do not add `--hostname 127.0.0.1` to `next start`.** CI omits the flag.
 */

const FIXTURE_PREFIX = "ove454";
const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
let pool: Pool;
let memberRequest: APIRequestContext | null = null;
let fixture: {
  gardener: SyntheticGardener;
  communitySlug: string;
  /** A community with nothing in it — the state this task is named after. */
  quietSlug: string;
  contributionIds: string[];
  entrySlugs: string[];
} | null = null;

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
  }, WCAG_AA_TAGS);
}

/**
 * A multipart body React's server-action endpoint accepts.
 *
 * Playwright's own `multipart` helper drops an empty-string field, and
 * `$ACTION_REF_1` is exactly that — so a form posted through it answers 500
 * with "Failed to find Server Action".
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
function readFormFields(
  html: string,
  marker: string,
  accept: (form: string) => boolean = () => true,
) {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gu)].map(
    (match) => match[0],
  );
  const form = forms.find(
    (candidate) => candidate.includes(marker) && accept(candidate),
  );
  if (!form) return null;
  const action = /<form[^>]*\baction="([^"]*)"/u.exec(form)?.[1] ?? null;
  const fields: Array<[string, string]> = [
    ...form.matchAll(/<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/gu),
  ].map((match) => [match[1]!, decodeHtml(match[2]!)]);
  for (const match of form.matchAll(/<input[^>]*\bname="(\$ACTION_[^"]+)"/gu)) {
    const name = match[1]!;
    if (!fields.some(([existing]) => existing === name))
      fields.push([name, ""]);
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

/**
 * Two public entries in the site's community, by one gardener.
 *
 * `community_contributions` is what makes an entry part of a community, and
 * the row pairs with a membership: every visibility predicate in the
 * repository joins `community_memberships` and refuses a banned one, so an
 * entry with no membership beside it is invisible and the fixture would prove
 * nothing.
 */
async function seedCommunityWork(gardener: SyntheticGardener) {
  const run = randomUUID().slice(0, 8);
  const community = await pool.query<{ id: string; slug: string }>(
    `select id::text id, slug from communities
      where lifecycle_state = 'active' order by slug limit 1`,
  );
  const communityId = community.rows[0]!.id;
  const communitySlug = community.rows[0]!.slug;

  await pool.query(
    `insert into community_memberships (community_id, user_id, membership_state)
     values ($1::uuid, $2::uuid, 'active')
     on conflict (community_id, user_id)
       do update set membership_state = 'active', left_at = null`,
    [communityId, gardener.id],
  );

  const space = await pool.query<{ id: string }>(
    `insert into spaces (owner_user_id, display_name) values ($1::uuid, $2)
     returning id::text id`,
    [gardener.id, `${FIXTURE_PREFIX} сад ${run}`],
  );
  const spaceId = space.rows[0]!.id;
  // A second community with nothing in it. The gate database shipped one of
  // these and the fixture above fills it, so the state the task is named after
  // has to be built rather than borrowed — and it carries the same rules, so
  // "rules on the page" is asserted on an empty community too.
  const quietSlug = `${FIXTURE_PREFIX}-quiet-${run}`;
  const quiet = await pool.query<{ id: string }>(
    `insert into communities (slug, content_key, journal_topic_id,
                              lifecycle_state, participation_state)
     select $1::text, communities.content_key, communities.journal_topic_id,
            'active', 'open'
       from communities where communities.id = $2::uuid
     returning id::text id`,
    [quietSlug, communityId],
  );
  const quietId = quiet.rows[0]!.id;
  await pool.query(
    `insert into community_rules (community_id, rule_key, sort_order, rule_state)
     select $1::uuid, rule_key, sort_order, rule_state
       from community_rules where community_id = $2::uuid`,
    [quietId, communityId],
  );

  const contributionIds: string[] = [];
  const entrySlugs: string[] = [];

  for (let index = 0; index < 2; index += 1) {
    const object = await pool.query<{ id: string }>(
      `insert into plant_objects
         (owner_user_id, space_id, display_name, object_kind, public_slug)
       values ($1::uuid, $2::uuid, $3, $4, $5)
       returning id::text id`,
      [
        gardener.id,
        spaceId,
        `${FIXTURE_PREFIX} об'єкт ${index + 1}`,
        // One of each kind, so the `kind` facet has something to exclude.
        index === 0 ? "plant" : "animal",
        `${FIXTURE_PREFIX}-obj-${run}-${index}`,
      ],
    );
    const publicSlug = `${FIXTURE_PREFIX}-entry-${run}-${index}`;
    entrySlugs.push(publicSlug);
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
        gardener.id,
        spaceId,
        object.rows[0]!.id,
        `${FIXTURE_PREFIX} спостереження ${index + 1}`,
        "Новий приріст рівний, листя без плям на зворотному боці.",
        randomUUID(),
        publicSlug,
        index,
      ],
    );
    const contribution = await pool.query<{ id: string }>(
      `insert into community_contributions
         (community_id, contributor_user_id, journal_entry_id,
          contribution_state, discussion_state)
       values ($1::uuid, $2::uuid, $3::uuid, 'active', 'open')
       returning id::text id`,
      [communityId, gardener.id, entry.rows[0]!.id],
    );
    contributionIds.push(contribution.rows[0]!.id);
  }

  // One root and one reply on the first contribution, so the axe pass scans a
  // thread rather than an empty panel — where the comment header, the
  // permalink and the Reply link live, and where a missing accessible name
  // would therefore be.
  const root = await pool.query<{ id: string }>(
    `insert into engagement_comments
       (author_user_id, body, client_mutation_id, comment_state,
        target_kind, target_ref)
     values ($1::uuid, $2, $3, 'active', 'community_contribution', $4::text)
     returning id::text id`,
    [
      gardener.id,
      `${FIXTURE_PREFIX} перший коментар`,
      randomUUID(),
      contributionIds[0],
    ],
  );
  await pool.query(
    `insert into engagement_comments
       (author_user_id, body, client_mutation_id, comment_state,
        target_kind, target_ref, parent_comment_id)
     values ($1::uuid, $2, $3, 'active', 'community_contribution', $4::text,
             $5::uuid)`,
    [
      gardener.id,
      `${FIXTURE_PREFIX} відповідь`,
      randomUUID(),
      contributionIds[0],
      root.rows[0]!.id,
    ],
  );

  return { communitySlug, quietSlug, contributionIds, entrySlugs };
}

async function memberCount(slug: string) {
  const row = await pool.query<{ count: string }>(
    `select count(*)::text count
       from community_memberships
       join communities on communities.id = community_memberships.community_id
      where communities.slug = $1::text
        and community_memberships.membership_state = 'active'`,
    [slug],
  );
  return Number(row.rows[0]?.count ?? "0");
}

test.describe("the community family", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    memberRequest = await playwright.request.newContext();
    const gardener = await signInSyntheticGardener({
      baseURL,
      context: { request: memberRequest },
      pool,
      prefix: `${FIXTURE_PREFIX}-member`,
    });
    fixture = { gardener, ...(await seedCommunityWork(gardener)) };
  });

  test.afterAll(async () => {
    if (fixture) {
      await pool.query(
        `delete from engagement_comments where author_user_id = $1::uuid`,
        [fixture.gardener.id],
      );
      await pool.query(
        `delete from community_contributions where contributor_user_id = $1::uuid`,
        [fixture.gardener.id],
      );
      await pool.query(
        `delete from community_memberships where user_id = $1::uuid`,
        [fixture.gardener.id],
      );
      await pool.query(
        `delete from community_rules where community_id in
           (select id from communities where slug = $1::text)`,
        [fixture.quietSlug],
      );
      await pool.query(`delete from communities where slug = $1::text`, [
        fixture.quietSlug,
      ]);
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
    }
    await memberRequest?.dispose();
    await pool.end();
  });

  test("axe reports nothing on the list, the community and a discussion", async ({
    baseURL,
    context,
    page,
  }) => {
    // Sixteen scans — two viewers, two widths, four pages — each after a
    // 1.2 s wait for the stream: about thirty seconds on a laptop, which is
    // the whole default budget, and over it on a CI runner, where the test
    // timed out twice running while nothing on these pages had changed.
    test.setTimeout(90_000);
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const slug = fixture!.communitySlug;
    const surfaces = [
      "/communities",
      `/communities/${slug}`,
      `/communities/${slug}?kind=plant`,
      `/communities/${slug}/discussions/${fixture!.contributionIds[0]}`,
    ];

    // Signed out and signed in: a member's view carries controls a guest never
    // sees — the membership form, the contribution picker, the report
    // disclosure and the reply box — and those are exactly the places a label
    // or a name goes missing. The session is the one opened in `beforeAll`,
    // lifted into the browser rather than signing a second gardener up, which
    // Better Auth would rate-limit.
    for (const viewer of ["guest", "member"] as const) {
      if (viewer === "member") {
        const { cookies } = await memberRequest!.storageState();
        await context.addCookies(cookies);
      }
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
          if (surface.includes("/discussions/")) {
            // The scan has to be scanning something: the fixture seeds a root
            // and a reply, and an axe pass over an empty panel would prove
            // nothing about the comment header, the permalink or the Reply
            // link.
            expect(
              await page.locator('[id^="comment-reply-"]').count(),
              "the discussion rendered no thread to scan",
            ).toBeGreaterThanOrEqual(2);
          }
          const violations = await axeViolations(page);
          expect(
            violations,
            `${viewer} on ${surface} at ${width} px: ${JSON.stringify(violations)}`,
          ).toEqual([]);
        }
      }
    }
  });

  test("a community card prints what it has, and never a nought", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    await page.goto("/communities", { waitUntil: "load" });
    const card = page.locator(
      `[data-public-community-card="${fixture!.communitySlug}"]`,
    );
    await expect(card).toBeVisible();

    // Criterion 1. The footer this replaces read `0 Записи · 0 Живі
    // об'єкти · 0 Учасники` — three numbers spending the most valuable row on
    // the card to say nothing is happening.
    const facts = card.locator("[data-community-facts]");
    await expect(facts).toBeVisible();
    const printed = (await facts.innerText()).trim();
    expect(printed, `the card printed "${printed}"`).not.toMatch(/\b0\b/u);
    await expect(card.getByRole("heading")).toBeVisible();
  });

  test("the rules of participation are on the page at every width", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    // Criterion 5. They used to sit in a section marked `xl:hidden`, so above
    // `xl` — where the rail took them — the community's own page carried no
    // rules at all, and the widest reader was the one told least.
    for (const width of [375, 1_440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto(`/communities/${fixture!.communitySlug}`, {
        waitUntil: "load",
      });
      const rules = page.locator("#community-rules");
      await expect(rules).toBeVisible({ timeout: 15_000 });
      expect(
        await rules.locator("li").count(),
        `no rules listed at ${width} px`,
      ).toBeGreaterThan(0);
    }
  });

  test("the kind facet round-trips through the address", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const slug = fixture!.communitySlug;
    await page.goto(`/communities/${slug}`, { waitUntil: "load" });
    const rows = page.locator('[data-slot="entry-card"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const all = await rows.count();
    expect(all).toBeGreaterThanOrEqual(2);

    // One parameter per facet, named for the facet — and one of the two seeded
    // entries is about an animal, so the filter has something to exclude.
    await page.goto(`/communities/${slug}?kind=plant`, { waitUntil: "load" });
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    expect(await rows.count()).toBeLessThan(all);
    // Plants or animals is the community's one mode: the current one says so.
    await expect(
      page
        .locator('[data-filter-bar-modes="true"] [aria-current="page"]')
        .first(),
    ).toHaveAttribute("href", `/communities/${slug}?kind=plant`);
  });

  test("an empty community is one state, not a stack of empty sections", async ({
    baseURL,
    context,
    page,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await selectLocale(context, baseURL);
    const slug = fixture!.communitySlug;

    // Criterion 2, on a community with nothing in it: one `empty-first-run`
    // with one action, and the rules a first contributor is agreeing to — not
    // a filter bar over nothing, a heading with a nought beside it and an
    // empty picker stacked on each other.
    await page.goto(`/communities/${fixture!.quietSlug}`, {
      waitUntil: "load",
    });
    await expect(
      page.locator('[data-public-community-screen="empty-first-run"]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-screen-state="empty-first-run"]'),
    ).toBeVisible();
    await expect(page.locator('[data-slot="filter-bar"]')).toHaveCount(0);
    await expect(page.locator("[data-community-result-count]")).toHaveCount(0);
    await expect(page.locator('[data-community-facts="none"]')).toBeVisible();
    await expect(page.locator("#community-rules")).toBeVisible();

    const quiet = await request.get(
      `${baseURL}/communities/${fixture!.quietSlug}`,
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    expect(await quiet.text()).toMatch(/name="robots"[^>]*noindex/u);

    // And the other half: a search that matches nothing is "no results", with
    // the filters the reader set and a way to clear them.
    await page.goto(`/communities/${slug}?q=zzzznothingmatchesthis`, {
      waitUntil: "load",
    });
    await expect(
      page.locator('[data-screen-state="empty-no-results"]'),
    ).toBeVisible({ timeout: 15_000 });
    // `empty-no-results` carries no illustration: something does exist and the
    // filters excluded it (DESIGN.md §5.4).
    await expect(
      page.locator('[data-screen-state="empty-no-results"] img'),
    ).toHaveCount(0);

    // Criterion 6, the other half. A filtered view is **not** a page of its
    // own: its canonical is the community's bare address, so the thin page a
    // crawler could otherwise mint out of `?q=` never exists. The community
    // behind it keeps whatever indexability its own content earns — which is
    // why asserting `noindex` here would be asserting the wrong rule.
    const filtered = await request.get(
      `${baseURL}/communities/${slug}?q=zzzznothingmatchesthis`,
      { headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` } },
    );
    const filteredHtml = await filtered.text();
    expect(filteredHtml).toMatch(
      new RegExp(`rel="canonical"[^>]*href="[^"]*/communities/${slug}"`, "u"),
    );
    // The query itself stays in the field — the bounded-search contract keeps
    // the reader's words and their controls on a degraded or empty result
    // (`docs/BOUNDED_PUBLIC_COMMUNITY_SEARCH.md`).
    expect(filteredHtml).toContain('value="zzzznothingmatchesthis"');
  });

  test("all three pages answer in both markets, and lead nowhere that 404s", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const slug = fixture!.communitySlug;
    const paths = [
      "/communities",
      `/communities/${slug}`,
      `/communities/${slug}/discussions/${fixture!.contributionIds[0]}`,
    ];

    for (const prefix of ["", "/bg", "/ru"]) {
      for (const path of paths) {
        const url = `${prefix}${path}`;
        const response = await request.get(`${baseURL}${url}`, {
          headers: { cookie: `${INTERFACE_LOCALE_COOKIE}=uk` },
          maxRedirects: 0,
        });
        expect(response.status(), `${url} answered ${response.status()}`).toBe(
          200,
        );
        // The prefixed tree is a subset of the unprefixed one: `/garden` and
        // `/account/**` have no `[locale]` twin, so a prefixed spelling of
        // either is a 404 the proxy decides before the page renders. A link
        // built with `localizedPath` would have shipped one.
        const html = await response.text();
        expect(html, `${url} links to a prefixed workspace`).not.toMatch(
          /href="\/(?:bg|ru)\/(?:garden|account)\b/u,
        );
      }
    }
  });

  test("join submits with no client bundle at all", async ({ baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const request = memberRequest!;
    const slug = fixture!.communitySlug;
    const communityUrl = `${baseURL}/communities/${slug}`;

    // The fixture joined this gardener in SQL, so the rendered control says
    // "leave" — which is the same Server Action and the same proof.
    const html = await (await request.get(communityUrl)).text();
    // The community is a static document (ADR-0032 D2): its first bytes carry
    // the guest's working control, a real endpoint of its own…
    const guest = readFormFields(html, 'data-auth-intent-control="follow"');
    expect(guest?.action, "the guest's join has no endpoint").toBe(
      "/auth/intent/start",
    );
    // …and the member's arrives in the streamed segment React's inline reveal
    // swaps in, before any bundle has run: a server action and its reference.
    const form = readFormFields(
      html,
      'data-auth-intent-control="follow"',
      (candidate) => candidate.includes("$ACTION_"),
    );
    expect(form, "the community rendered no membership form").not.toBeNull();

    // The discriminator. React writes `action=""` — the page's own address —
    // for a progressively enhanced Server Action form and adds the `$ACTION_*`
    // reference the endpoint resolves. A form wrapped in a client closure has
    // neither and submits only once its bundle has run (ADR-0024 D3).
    expect(
      form!.fields.map(([name]) => name).join(" "),
      "no server-action reference in the membership form",
    ).toMatch(/\$ACTION_(ID|REF)/u);

    const before = await memberCount(slug);
    const encoded = encodeMultipart(form!.fields);
    const posted = await request.post(
      new URL(form!.action || "", communityUrl).toString(),
      {
        headers: { "content-type": encoded.contentType, origin: baseURL },
        data: encoded.body,
        maxRedirects: 0,
      },
    );
    expect(
      posted.status(),
      `the membership endpoint answered ${posted.status()}`,
    ).toBeLessThan(400);
    expect(await memberCount(slug)).toBe(before - 1);

    // And back, so the rest of the file sees the fixture it seeded.
    await pool.query(
      `update community_memberships set membership_state = 'active',
              left_at = null
        where user_id = $1::uuid`,
      [fixture!.gardener.id],
    );
  });

  test("a reply posts without JavaScript, and the third level flattens", async ({
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const request = memberRequest!;
    const contributionId = fixture!.contributionIds[0]!;
    const url = `${baseURL}/communities/${fixture!.communitySlug}/discussions/${contributionId}`;

    const rootBody = `${FIXTURE_PREFIX} корінь ${randomUUID().slice(0, 6)}`;
    const replyBody = `${FIXTURE_PREFIX} відповідь ${randomUUID().slice(0, 6)}`;

    const post = async (marker: string, body: string) => {
      const html = await (await request.get(url)).text();
      const form = readFormFields(html, marker);
      expect(form, `no form matched ${marker}`).not.toBeNull();
      expect(form!.fields.map(([name]) => name).join(" ")).toMatch(
        /\$ACTION_(ID|REF)/u,
      );
      const fields = form!.fields.map(([name, value]): [string, string] =>
        name === "body" ? [name, body] : [name, value],
      );
      if (!fields.some(([name]) => name === "body"))
        fields.push(["body", body]);
      const encoded = encodeMultipart(fields);
      const response = await request.post(
        new URL(form!.action || "", url).toString(),
        {
          headers: { "content-type": encoded.contentType, origin: baseURL },
          data: encoded.body,
          maxRedirects: 0,
        },
      );
      expect(
        response.status(),
        `the comment endpoint answered ${response.status()}`,
      ).toBeLessThan(400);
    };

    await post('data-auth-intent-control="comment"', rootBody);
    await expect
      .poll(
        async () => {
          const response = await request.get(url);
          return response.text();
        },
        { timeout: 15_000 },
      )
      .toContain(rootBody);

    // The reply box under the thread. Every Reply link in the thread leads to
    // this one field, and it posts under the **root** — which is the flatten
    // criterion 3 asks for: a reply to a reply joins the thread at the same
    // level rather than opening a third.
    await post('name="parentCommentId"', replyBody);

    const html = await (await request.get(url)).text();
    expect(html).toContain(replyBody);
    const depth = await pool.query<{ depth: string }>(
      `select count(*)::text depth
         from engagement_comments child
         join engagement_comments parent on parent.id = child.parent_comment_id
        where parent.parent_comment_id is not null`,
    );
    expect(
      Number(depth.rows[0]?.depth ?? "0"),
      "a comment exists three levels deep",
    ).toBe(0);

    // Every comment is a place a reader can link to, and the address is the
    // opaque control ref — never the comment's own id.
    const anchors = [...html.matchAll(/id="(comment-reply-[0-9a-f]{16})"/gu)];
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    for (const [, anchor] of anchors) {
      expect(html).toContain(`href="#${anchor}"`);
    }
  });
});
