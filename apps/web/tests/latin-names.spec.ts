import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "playwright/test";
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";

/**
 * A passport and a topic at their Latin names (OVE-465, ADR-0029 D4 as amended
 * 2026-09-18), over HTTP alone against a production build and a real database:
 *
 *   1. `/@{handle}/objects/{latin}` and `/topics/{latin}` answer 200 and name
 *      themselves in their canonical, with nothing in the address to encode;
 *   2. the Cyrillic name each of them was issued before answers **one** 308
 *      to the Latin one — for a passport from any locale prefix to its single
 *      unprefixed address, for a topic keeping the prefix the reader asked
 *      under, since a topic page exists in every locale;
 *   3. a Cyrillic name nothing ever held is a real 404, not a redirect to a
 *      guess: the matcher lets an old spelling through to the history lookup,
 *      and the history is what answers.
 *
 * The fixture cannot write a Cyrillic name into the columns — on a database
 * with none, migration `0077` has already narrowed them to Latin — so it
 * writes what the romanize run leaves behind: the Latin name on the row, and
 * the Cyrillic one as a closed row in the history.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/latin-names.spec.ts
 */
const DOCUMENT_HEADERS = { accept: "text/html", "sec-fetch-dest": "document" };

test.use({ trace: "off" });

interface NamesFixture {
  ownerUserId: string;
  handle: string;
  topicId: string;
  passport: { latin: string; cyrillic: string };
  topic: { latin: string; cyrillic: string };
}

test.describe("OVE-465 Latin names", () => {
  test("answers 200 at the Latin name and one 308 from the Cyrillic one", async ({
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
    let fixture: NamesFixture | null = null;

    try {
      fixture = await seedNamesFixture(pool);
      const { handle, passport, topic } = fixture;
      const passportPath = `/@${handle}/objects/${passport.latin}`;
      const oldPassport = encodeURIComponent(passport.cyrillic);
      const oldTopic = encodeURIComponent(topic.cyrillic);

      // 1. The Latin addresses answer and name themselves.
      const passportPage = await get(request, passportPath);
      expect(passportPage.status()).toBe(200);
      expect(await passportPage.text()).toMatch(canonicalLink(passportPath));
      expect(encodeURI(passportPath)).toBe(passportPath);

      // The topic is asked for its status and its own name only. It carries no
      // entries, so it is an empty listing — `noindex`, and a page that is not
      // indexed declares no canonical (AGENTS.md hard rule 4).
      for (const prefix of ["", "/bg", "/ru"]) {
        const topicPath = `${prefix}/topics/${topic.latin}`;
        const topicPage = await get(request, topicPath);
        expect(topicPage.status(), topicPath).toBe(200);
        expect(await topicPage.text(), topicPath).toContain("Помідори");
        expect(encodeURI(topicPath)).toBe(topicPath);
      }

      // 2. One 308 from the Cyrillic name. A passport has one address, so
      // every prefix lands on it; a topic keeps the prefix it was asked under.
      for (const prefix of ["", "/uk", "/bg", "/ru"]) {
        await expectRedirect(
          request,
          baseURL,
          `${prefix}/@${handle}/objects/${oldPassport}`,
          passportPath,
        );
      }
      await expectRedirect(
        request,
        baseURL,
        `/bg/@${handle}/objects/${oldPassport}`,
        passportPath,
        "HEAD",
      );
      await expectRedirect(request, baseURL, `/bg${passportPath}`, passportPath);

      await expectRedirect(
        request,
        baseURL,
        `/topics/${oldTopic}`,
        `/topics/${topic.latin}`,
      );
      await expectRedirect(
        request,
        baseURL,
        `/bg/topics/${oldTopic}`,
        `/bg/topics/${topic.latin}`,
      );
      await expectRedirect(
        request,
        baseURL,
        `/ru/topics/${oldTopic}`,
        `/ru/topics/${topic.latin}`,
        "HEAD",
      );

      // 3. A Cyrillic name nothing ever held is nothing.
      for (const path of [
        `/@${handle}/objects/${encodeURIComponent("такого-паспорта-немає")}`,
        `/topics/${encodeURIComponent("такої-теми-немає")}`,
        `/bg/topics/${encodeURIComponent("няма-такава-тема")}`,
      ]) {
        const response = await get(request, path);
        expect(response.status(), path).toBe(404);
        expect(response.headers()["x-robots-tag"], path).toBe(
          "noindex, nofollow",
        );
      }

      console.info(
        JSON.stringify({
          passportLatin: 200,
          topicLatinInThreeLocales: 200,
          passportCyrillicFromFourPrefixes: 308,
          topicCyrillicKeepsItsPrefix: 308,
          cyrillicNeverHeld: 404,
        }),
      );
    } finally {
      await Promise.all(contexts.map((context) => context.dispose()));
      if (fixture) await cleanupNamesFixture(pool, fixture);
      await pool.end();
    }
  });
});

async function seedNamesFixture(pool: Pool): Promise<NamesFixture> {
  const suffix = randomUUID().slice(0, 8);
  const ownerUserId = randomUUID();
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const topicId = randomUUID();
  const passport = {
    latin: `chornyi-prynts-${suffix}`,
    cyrillic: `чорний-принц-${suffix}`,
  };
  const topic = { latin: `pomidory-${suffix}`, cyrillic: `помідори-${suffix}` };

  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'ove465 gardener', $2, true, now(), now())`,
    [ownerUserId, `ove465-${suffix}@example.test`],
  );
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
     where user_id = $1 and lifecycle_state = 'current'`,
    [ownerUserId],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error("ove465_fixture_handle_missing");

  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'ove465 garden')`,
    [spaceId, ownerUserId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state, public_slug)
     values ($1, $2, $3, 'Чорний принц', 'plant', 'unknown', $4)`,
    [objectId, ownerUserId, spaceId, passport.latin],
  );
  // A passport is an address only while its object has a public entry.
  await pool.query(
    `insert into journal_entries (owner_user_id, space_id, plant_object_id, title, body, entry_scope,
       visibility, lifecycle_state, published_at, public_slug, source_language, client_mutation_id)
     values ($1, $2, $3, 'Перша китиця', 'Перший публічний запис про томат на грядці.', 'object',
             'public', 'active', now() - interval '1 day', $4, 'uk', $4)`,
    [ownerUserId, spaceId, objectId, `ove465-entry-${suffix}`],
  );
  // What the romanize run leaves behind: the name the passport used to have,
  // closed, beside the open row the insert's trigger wrote for the Latin one.
  await pool.query(
    `insert into plant_object_slug_history (author_handle, slug, plant_object_id, valid_from, valid_to)
     values ($1, $2, $3, now() - interval '7 days', now() - interval '1 hour')`,
    [handle, passport.cyrillic, objectId],
  );

  await pool.query(
    `insert into journal_topics (id, slug, label, trust_state) values ($1, $2, 'Помідори', 'curated')`,
    [topicId, topic.latin],
  );
  await pool.query(
    `insert into journal_topic_slug_history (slug, journal_topic_id, valid_from, valid_to)
     values ($1, $2, now() - interval '7 days', now() - interval '1 hour')`,
    [topic.cyrillic, topicId],
  );

  return { ownerUserId, handle, topicId, passport, topic };
}

async function cleanupNamesFixture(pool: Pool, fixture: NamesFixture) {
  await pool.query(`delete from journal_topics where id = $1::uuid`, [
    fixture.topicId,
  ]);
  await pool.query(`delete from journal_entries where owner_user_id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
  await pool.query(`delete from plant_objects where owner_user_id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
  await pool.query(`delete from spaces where owner_user_id = $1::uuid`, [
    fixture.ownerUserId,
  ]);
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
  expect(
    new URL(location ?? "", baseURL).pathname,
    `${method} ${path} target`,
  ).toBe(target);
}

function canonicalLink(path: string) {
  return new RegExp(`rel="canonical" href="[^"]*${escapeRegExp(path)}"`, "u");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
