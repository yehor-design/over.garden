import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "playwright/test";
import { Pool } from "pg";

import { getPublicSurfaceCopy } from "../src/lib/public-surface-localization";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";

/**
 * An entry's address end to end (OVE-464, ADR-0029 D9 as amended 2026-09-18),
 * over HTTP alone against a production build and a real database:
 *
 *   1. `/@{handle}/post/{n}` answers 200 and names itself: canonical,
 *      `og:url` and the JSON-LD page node are all that address, absolute,
 *      and none of them contains a character that percent-encodes;
 *   2. every address the entry had before — the flat `/journal/{slug}`, the
 *      `/@{handle}/{slug}` of 2026-09-12, a name it held before a rename, each
 *      with a `uk`, `bg` or `ru` prefix — answers **one** 308 whose `Location`
 *      is the number, on GET and on HEAD. `maxRedirects: 0` is the whole
 *      point: a second hop hides inside a client that follows;
 *   3. nothing that is not the one spelling of a number is an address —
 *      `/post/0`, `/post/012`, `/post/1a` — and each answers a real, `noindex`
 *      404 document rather than a streamed 200; wrong case is a spelling, so
 *      it is a 308;
 *   4. a deleted entry keeps its number: 410 for the retention window, and
 *      the next publish takes the number after it;
 *   5. a listing links the number and never the name, and the sitemap lists
 *      the number and nothing that redirects.
 *
 * Every request runs in a fresh context: a prefixed visit sets the
 * interface-locale cookie, which would localize the next answer.
 *
 * Run it against a server you started yourself, on a database you may write:
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/entry-addresses.spec.ts
 */
const DOCUMENT_HEADERS = { accept: "text/html", "sec-fetch-dest": "document" };

/** The owner's own example, the link that started this: 181 characters. */
const SHARED_NAME = "кратък-и-отговорен-запис-след";

test.use({ trace: "off" });

interface EntryFixture {
  ownerUserId: string;
  handle: string;
  /** Unique per run, so a rerun never meets the last run's history rows. */
  name: string;
  olderName: string;
}

test.describe("OVE-464 entry addresses", () => {
  test("answers 200 at the number, one 308 from every older address, and real 404s and 410s", async ({
    baseURL,
    playwright,
  }) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const contexts: APIRequestContext[] = [];
    const request: Fresh = async () => {
      const context = await playwright.request.newContext({ baseURL });
      contexts.push(context);
      return context;
    };
    let fixture: EntryFixture | null = null;

    try {
      fixture = await seedEntryFixture(pool);
      const { handle, name, olderName } = fixture;
      const address = `/@${handle}/post/1`;
      const encodedName = encodeURIComponent(name);

      // 1. The address answers, and says it is the address.
      const page = await get(request, address);
      expect(page.status()).toBe(200);
      const html = await page.text();
      expect(html).toContain("Кратък и отговорен запис");
      expect(html).toMatch(canonicalLink(address));
      expect(html).toMatch(
        new RegExp(`property="og:url" content="[^"]*${escapeRegExp(address)}"`, "u"),
      );
      const graph = jsonLdGraph(html);
      const posting = nodeOfType(graph, "BlogPosting");
      expect(String(posting.url ?? posting["@id"])).toMatch(
        new RegExp(`${escapeRegExp(address)}$`, "u"),
      );
      const crumbs = nodeOfType(graph, "BreadcrumbList").itemListElement as {
        item: string;
      }[];
      expect(String(crumbs.at(-1)?.item)).toMatch(
        new RegExp(`${escapeRegExp(address)}$`, "u"),
      );
      // Nothing in it to encode: what a reader copies is what they send.
      expect(encodeURI(address)).toBe(address);
      // The entry is Bulgarian whatever the reader's interface is (D11).
      expect(html).toContain('<main lang="bg"');

      // 2. One 308 from every address it ever had.
      const olderSpellings = [
        `/@${handle}/${encodedName}`,
        `/bg/@${handle}/${encodedName}`,
        `/ru/@${handle}/${encodedName}`,
        `/uk/@${handle}/${encodedName}`,
        `/journal/${encodedName}`,
        `/bg/journal/${encodedName}`,
        `/uk/journal/${encodedName}`,
        // A name the entry held before it was renamed: the history table.
        `/@${handle}/${encodeURIComponent(olderName)}`,
        `/ru/journal/${encodeURIComponent(olderName)}`,
        // A second spelling of the address itself.
        `/bg${address}`,
        `/uk${address}`,
        `/@${handle.toUpperCase()}/POST/1`,
      ];
      for (const path of olderSpellings) {
        await expectRedirect(request, baseURL, path, address);
      }
      await expectRedirect(
        request,
        baseURL,
        `/bg/@${handle}/${encodedName}`,
        address,
        "HEAD",
      );
      // The query a reader arrived with survives the redirect.
      const withQuery = await get(
        request,
        `/journal/${encodedName}?from=%2Fjournals`,
      );
      expect(withQuery.status()).toBe(308);
      expect(new URL(withQuery.headers()["location"]!, baseURL).pathname).toBe(
        address,
      );

      // 3. A number the author has not reached is an entry that is not there,
      // and says so in the entry's own words.
      await expectNotFound(
        request,
        `/@${handle}/post/99`,
        getPublicSurfaceCopy("uk").journal.entryNotFound,
      );
      // What is not the one spelling of a number is not an address at all —
      // nothing ever issued it — so it is the site's 404, not an entry's.
      for (const path of [
        `/@${handle}/post/0`,
        `/@${handle}/post/012`,
        `/@${handle}/post/-1`,
        `/@${handle}/post/1a`,
        `/@${handle}/post/1.0`,
        `/@${handle}/post/9999999999`,
        `/@${handle}/post`,
        `/@${handle}/post/1/x`,
        // The same name under a gardener who never wrote it.
        `/@nobody_at_all_3f9c1/${encodedName}`,
        `/@${handle}/${encodeURIComponent("такого-запису-немає")}`,
      ]) {
        const response = await get(request, path);
        expect(response.status(), path).toBe(404);
        expect(response.headers()["x-robots-tag"], path).toBe(
          "noindex, nofollow",
        );
      }

      // 4. A deleted entry keeps its number, and nobody else gets it.
      const gone = await get(request, `/@${handle}/post/3`);
      expect(gone.status()).toBe(410);
      expect(gone.headers()["x-robots-tag"]).toBe("noindex, nofollow");
      const next = await pool.query<{ n: number }>(
        `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
           visibility, lifecycle_state, published_at, public_slug, source_language, client_mutation_id)
         select owner_user_id, space_id, plant_object_id, 'Четвъртият', 'Текст.', 'object',
                'public', 'active', now(), $2, 'bg', $2
         from journal_entries where owner_user_id = $1::uuid and author_entry_number = 1
         returning author_entry_number as n`,
        [fixture.ownerUserId, `ove464-next-${randomUUID().slice(0, 8)}`],
      );
      expect(next.rows[0]?.n).toBe(4);

      // 5. A listing links the number, never the name; the sitemap too. The
      // gardener's own profile is the listing asked, because it is the one
      // page this run can be sure nobody rendered before the fixture existed:
      // `/journals` is cached for hours, and a copy rendered a minute ago by
      // another spec would simply not hold these entries.
      const profile = await get(request, `/@${handle}`);
      expect(profile.status()).toBe(200);
      const profileHtml = await profile.text();
      expect(profileHtml).toContain(`href="${address}"`);
      expect(profileHtml).toContain(`href="/@${handle}/post/2"`);
      expect(profileHtml).not.toContain(`/@${handle}/${encodedName}`);
      expect(profileHtml).not.toContain(`/journal/${encodedName}`);

      // The sitemap chunk is cached for hours as well, so what is asserted is
      // what must hold of *any* copy of it: every entry it lists is a number,
      // and nothing in it is an address that answers 308. When the copy is
      // fresh enough to know this run's gardener, it lists the two live
      // entries and not the deleted one.
      const sitemap = await (
        await request()
      ).get("/sitemaps/entries-0.xml", { maxRedirects: 0 });
      expect(sitemap.status()).toBe(200);
      const locations = [
        ...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/gu),
      ].map((match) => new URL(match[1]!).pathname);
      for (const location of locations) {
        expect(location, "a sitemap lists canonicals only").toMatch(
          /^\/@[a-z0-9][a-z0-9_]{2,29}\/post\/[1-9][0-9]{0,8}$/u,
        );
      }
      const ownLocations = locations.filter((location) =>
        location.startsWith(`/@${handle}/`),
      );
      if (ownLocations.length > 0) {
        expect(ownLocations.sort()).toEqual([address, `/@${handle}/post/2`]);
      }

      console.info(
        JSON.stringify({
          address: 200,
          olderSpellingsEachOne308: olderSpellings.length + 2,
          refusedNumbers: 404,
          deletedNumber: 410,
          nextNumberAfterADeletedOne: next.rows[0]?.n,
          profileLinksTheNumber: true,
          sitemapCanonicalOnly: true,
          charactersBefore: `https://over.garden/@yehor/${encodeURIComponent(SHARED_NAME)}`.length,
          charactersAfter: "https://over.garden/@yehor/post/12".length,
        }),
      );
    } finally {
      await Promise.all(contexts.map((context) => context.dispose()));
      if (fixture) await cleanupEntryFixture(pool, fixture);
      await pool.end();
    }
  });
});

/**
 * One gardener, one plant, three entries: the first renamed once (so it has a
 * name in the history table that is no longer its own), the second plain, the
 * third deleted and inside its retention window.
 */
async function seedEntryFixture(pool: Pool): Promise<EntryFixture> {
  const suffix = randomUUID().slice(0, 8);
  const ownerUserId = randomUUID();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const name = `${SHARED_NAME}-${suffix}`;
  const olderName = `първо-име-${suffix}`;

  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'ove464 gardener', $2, true, now(), now())`,
    [ownerUserId, `ove464-${suffix}@example.test`],
  );
  // Sign-up claims a handle; the spec reads the one it was given.
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
     where user_id = $1 and lifecycle_state = 'current'`,
    [ownerUserId],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error("ove464_fixture_handle_missing");

  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'ove464 garden')`,
    [spaceId, ownerUserId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $2, $3, 'Домат на балкона', 'plant', 'unknown')`,
    [objectId, ownerUserId, spaceId],
  );

  const entry = (
    title: string,
    slug: string,
    daysAgo: number,
    deleted = false,
  ) =>
    pool.query(
      `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
         visibility, lifecycle_state, published_at, public_slug, source_language, client_mutation_id,
         deleted_at, purge_after, public_gone_at)
       values ($1, $2, $3, $4, 'Първият публичен запис за растението на балкона.', 'object',
               'public', $5, now() - make_interval(days => $6), $7, 'bg', $7,
               case when $8 then now() end,
               case when $8 then now() + interval '7 days' end,
               case when $8 then now() end)`,
      [
        ownerUserId,
        spaceId,
        objectId,
        title,
        deleted ? "deleted_retention" : "active",
        daysAgo,
        slug,
        deleted,
      ],
    );
  await entry("Кратък и отговорен запис", olderName, 3);
  await entry("Вторият запис", `втори-${suffix}`, 2);
  await entry("Изтритият запис", `изтрит-${suffix}`, 1, true);
  // The rename: the trigger of `0070` closes the first name and opens this one.
  await pool.query(
    `update journal_entries set public_slug = $2 where owner_user_id = $1 and public_slug = $3`,
    [ownerUserId, name, olderName],
  );

  return { ownerUserId, handle, name, olderName };
}

async function cleanupEntryFixture(pool: Pool, fixture: EntryFixture) {
  await pool.query(`delete from journal_entries where owner_user_id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
  await pool.query(`delete from plant_objects where owner_user_id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
  await pool.query(`delete from spaces where owner_user_id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
  // No foreign key carries this one away (see migration `0076`).
  await pool.query(
    `delete from journal_entry_number_counters where owner_user_id = $1::uuid`,
    [fixture.ownerUserId],
  );
  await pool.query(`delete from "user" where id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
}

/** A new request context per call: no cookie survives from one path to the next. */
type Fresh = () => Promise<APIRequestContext>;

async function get(request: Fresh, path: string) {
  return (await request()).get(path, {
    maxRedirects: 0,
    headers: DOCUMENT_HEADERS,
  });
}

async function expectRedirect(
  request: Fresh,
  baseURL: string,
  path: string,
  target: string,
  method: "GET" | "HEAD" = "GET",
) {
  const response =
    method === "HEAD"
      ? await (
          await request()
        ).head(path, { maxRedirects: 0, headers: DOCUMENT_HEADERS })
      : await get(request, path);
  expect(response.status(), `${method} ${path}`).toBe(308);
  const location = response.headers()["location"];
  expect(location, `${method} ${path} Location`).toBeTruthy();
  // The first response's target is the address itself — not another spelling
  // that would answer 308 in its turn.
  expect(
    new URL(location ?? "", baseURL).pathname,
    `${method} ${path} target`,
  ).toBe(target);
}

async function expectNotFound(request: Fresh, path: string, copyText: string) {
  const response = await get(request, path);
  expect(response.status(), path).toBe(404);
  expect(response.headers()["x-robots-tag"], `${path} X-Robots-Tag`).toBe(
    "noindex, nofollow",
  );
  expect(await response.text(), `${path} body`).toContain(copyText);
}

function canonicalLink(path: string) {
  return new RegExp(`rel="canonical" href="[^"]*${escapeRegExp(path)}"`, "u");
}

function jsonLdGraph(html: string): Record<string, unknown>[] {
  const match =
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/u.exec(html);
  if (!match) throw new Error("The page carries no JSON-LD.");
  const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
  return (
    (parsed["@graph"] as Record<string, unknown>[] | undefined) ?? [parsed]
  );
}

function nodeOfType(graph: Record<string, unknown>[], type: string) {
  const node = graph.find((candidate) => candidate["@type"] === type);
  if (!node) throw new Error(`No ${type} node in the JSON-LD graph.`);
  return node;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
