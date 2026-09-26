import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Cookie,
} from "playwright/test";

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
import { signInOwnerFixture } from "./helpers/owner-fixture";
import { cleanupCollection } from "./helpers/redesign-fixtures";
import {
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./helpers/synthetic-gardener";

/**
 * Every page family the product serves, for every role and every language,
 * in one sweep (`OVE-478` criteria 1, 3, 6 and 7).
 *
 * Each family's own spec proves what the family does. This one proves what
 * every family owes the reader whatever it is, and proves it for all of them
 * at once — the only place a family nobody owns any more would show up:
 *
 * - the status the address law says (200, or the proxy's real 404 or 410);
 * - the document's `lang` is the language the reader chose;
 * - exactly one `h1` on screen, and one `main`;
 * - exactly one language control (DESIGN.md §6);
 * - no sideways scroll at 320 px — the width of 400 % zoom on a 1280 px
 *   screen (WCAG 1.4.10);
 * - a state that refuses (a guest on a gardener's page, a member on an
 *   owner's) says so in a page, never an error document.
 *
 * The rows, with what each one measured, are written to
 * `test-results/route-families/*.json`; `docs/redesign/2026-09-21/OVE-478-PROOF.md`
 * carries the table.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=route-families.spec.ts
 */

type Locale = "uk" | "bg" | "ru";
type Role = "guest" | "member" | "owner";

interface Row {
  family: string;
  /** The issue whose receipt proves what the family does. */
  owner: string;
  role: Role;
  /** Address for a locale; the unprefixed spelling for Ukrainian. */
  address: (locale: Locale) => string;
  status?: 200 | 404 | 410;
}

/** One same-origin link a page offered, and what asking for it answered. */
interface Crawled {
  role: Role;
  locale: Locale;
  href: string;
  status: number;
  /** An address of a row some spec made, which another spec may remove. */
  entity: boolean;
}

/**
 * Addresses of rows the gate's specs create and delete while this one runs:
 * a missing one of these is another spec's cleanup, not a dead link.
 */
const ENTITY_ADDRESS =
  /^\/(?:(?:bg|ru)\/)?(?:@|garden\/(?:objects|spaces|entries)\/|communities\/[^/]+\/discussions\/|lineage\/objects\/|species\/|variety\/|breed\/|topics\/)/u;

interface Measured {
  family: string;
  owner: string;
  role: Role;
  locale: Locale;
  address: string;
  status: number;
  lang: string;
  headings: number;
  mains: number;
  languageControls: number;
  overflow: number;
  title: string;
  h1: string;
  /** Visible text in Ukrainian letters on a BG or RU page, for review. */
  ukrainianLetters: string[];
  /** Visible error states (`data-screen-state="error"`): a read that failed. */
  errorStates: number;
  /** Two controls drawn over each other: a long label pushing into another. */
  overlaps: string[];
  /** A control whose words are cut off by its own box, with no ellipsis. */
  clippedLabels: string[];
  /**
   * Two words a screen reader reads as one: a margin or padding draws the gap
   * and the text has none («АвторОлена», «Простори3»).
   */
  joinedWords: string[];
}

const PREFIX = "ove478-routes";
const PHONE = { width: 320, height: 720 } as const;

/** `/bg/…` and `/ru/…` for a public address with a translated spelling. */
function localized(pathname: string) {
  return (locale: Locale) =>
    locale === "uk"
      ? pathname
      : pathname === "/"
        ? `/${locale}`
        : `/${locale}${pathname}`;
}

/** An address with one spelling whatever the language (ADR-0029 D10). */
function one(pathname: string) {
  return () => pathname;
}

let pool: Pool;
let entry: PublishedEntryFixture;
let removedEntryPath: string;
let passportPath: string;
let organism: OrganismFixture;
let member: SyntheticGardener;
let memberCookies: Cookie[] = [];
let ownerCookies: Cookie[] = [];
let memberRows: {
  spaceId: string;
  objectId: string;
  entryId: string;
};
let communityPath: string | null = null;
let topicPath: string | null = null;

test.describe.configure({ mode: "parallel" });
test.use({ trace: "off" });

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  pool.on("error", () => undefined);

  entry = await seedPublishedEntryFixture(pool, `${PREFIX}-entry`);
  const passportSlug = `route-sweep-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `update plant_objects set public_slug = $1
      where id = (select plant_object_id from journal_entries where id = $2)
        and owner_user_id = $3`,
    [passportSlug, entry.entryId, entry.ownerUserId],
  );
  passportPath = `/@${entry.handle}/objects/${passportSlug}`;
  // A second entry by the same gardener, deleted inside its retention
  // window: its number answers 410, and the tombstone leads to the author.
  const removed = await pool.query<{ author_entry_number: number }>(
    `insert into journal_entries (owner_user_id, space_id, plant_object_id,
        title, body, content_document, content_schema_version, entry_scope,
        visibility, lifecycle_state, published_at, public_slug,
        source_language, client_mutation_id, deleted_at, purge_after,
        public_gone_at)
     select owner_user_id, space_id, plant_object_id, 'Прибраний запис',
        'Прибраний запис.', content_document, content_schema_version,
        entry_scope, 'public', 'deleted_retention', now(),
        'route-sweep-removed-' || substr(md5(random()::text), 1, 8),
        source_language, gen_random_uuid()::text, now(),
        now() + interval '7 days', now()
       from journal_entries where id = $1
     returning author_entry_number`,
    [entry.entryId],
  );
  removedEntryPath = `/@${entry.handle}/post/${removed.rows[0]!.author_entry_number}`;

  // One organism per worker: the three languages run in parallel, and the
  // fixture clears every earlier run under its prefix before it seeds.
  organism = await seedOrganismFixture(
    pool,
    `${PREFIX}-organism-${test.info().parallelIndex}`,
  );
  const community = await pool.query<{ slug: string }>(
    `select slug from communities where lifecycle_state = 'active'
      order by slug limit 1`,
  );
  communityPath = community.rows[0]
    ? `/communities/${community.rows[0].slug}`
    : null;
  const topic = await pool.query<{ slug: string }>(
    `select slug from journal_topics where trust_state = 'curated'
      order by slug limit 1`,
  );
  topicPath = topic.rows[0] ? `/topics/${topic.rows[0].slug}` : null;

  const memberContext = await browser.newContext();
  try {
    member = await signInSyntheticGardener({
      baseURL: baseURL!,
      context: memberContext,
      pool,
      prefix: PREFIX,
    });
    memberCookies = await memberContext.cookies();
  } finally {
    await memberContext.close();
  }
  memberRows = {
    spaceId: randomUUID(),
    objectId: randomUUID(),
    entryId: randomUUID(),
  };
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name)
     values ($1, $2, 'Балкон — південний бік')`,
    [memberRows.spaceId, member.id],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name,
        object_kind, variety_state)
     values ($1, $2, $3, 'Томат', 'plant', 'unknown')`,
    [memberRows.objectId, member.id, memberRows.spaceId],
  );
  await pool.query(
    // No stored document: the body is read as a legacy one-paragraph
    // document, which the editor opens. A hand-written document that the
    // normalizer refuses opens the edit page on its error state instead.
    `insert into journal_entries (id, owner_user_id, space_id, plant_object_id,
        title, body, entry_scope,
        visibility, lifecycle_state, published_at, public_slug,
        source_language, client_mutation_id)
     values ($1, $2, $3, $4, 'Перша зав''язь', 'Перша зав''язь на нижній китиці.',
        'object', 'public', 'active', now(),
        'route-sweep-' || substr(md5(random()::text), 1, 8), 'uk',
        gen_random_uuid()::text)`,
    [memberRows.entryId, member.id, memberRows.spaceId, memberRows.objectId],
  );

  const ownerContext = await browser.newContext();
  try {
    await signInOwnerFixture({
      request: ownerContext.request,
      baseURL: baseURL!,
    });
    ownerCookies = await ownerContext.cookies();
  } finally {
    await ownerContext.close();
  }
});

test.afterAll(async () => {
  if (member) await cleanupCollection(pool, member.id).catch(() => undefined);
  await cleanupPublishedEntryFixture(pool, entry).catch(() => undefined);
  if (organism)
    await cleanupOrganismFixture(pool, organism).catch(() => undefined);
  await pool?.end();
});

function guestRows(): Row[] {
  const rows: Row[] = [
    {
      family: "Feed · Latest",
      owner: "OVE-492",
      role: "guest",
      address: localized("/"),
    },
    {
      family: "Feed · Following",
      owner: "OVE-492",
      role: "guest",
      address: localized("/feed"),
    },
    {
      family: "Journals directory",
      owner: "OVE-492",
      role: "guest",
      address: localized("/journals"),
    },
    {
      family: "Journals · query view",
      owner: "OVE-482",
      role: "guest",
      address: (l) => `${localized("/journals")(l)}?kind=plant`,
    },
    {
      family: "Entry",
      owner: "OVE-493",
      role: "guest",
      address: one(entry.entryPath),
    },
    {
      family: "Entry · removed (seven-day 410)",
      owner: "OVE-478",
      role: "guest",
      address: one(removedEntryPath),
      status: 410,
    },
    {
      family: "Entry · number nobody has",
      owner: "OVE-478",
      role: "guest",
      address: one(`/@${entry.handle}/post/999999`),
      status: 404,
    },
    {
      family: "Public profile",
      owner: "OVE-494",
      role: "guest",
      address: localized(`/@${entry.handle}`),
    },
    {
      family: "Object passport",
      owner: "OVE-495",
      role: "guest",
      address: one(passportPath),
    },
    {
      family: "Catalogue · door",
      owner: "OVE-496",
      role: "guest",
      address: localized("/catalog"),
    },
    {
      family: "Catalogue · register",
      owner: "OVE-496",
      role: "guest",
      address: (l) => `${localized("/catalog")(l)}?q=tomato`,
    },
    {
      family: "Organism card",
      owner: "OVE-497",
      role: "guest",
      address: localized(`/species/${organism.speciesSlug}`),
    },
    {
      family: "Organism · form",
      owner: "OVE-497",
      role: "guest",
      address: localized(
        `/species/${organism.speciesSlug}/${organism.formSlug}`,
      ),
    },
    {
      family: "Communities",
      owner: "OVE-500",
      role: "guest",
      address: localized("/communities"),
    },
    {
      family: "Knowledge hub",
      owner: "OVE-498",
      role: "guest",
      address: localized("/knowledge"),
    },
    {
      family: "Answer",
      owner: "OVE-498",
      role: "guest",
      address: localized("/answers/why-are-tomato-leaves-yellow"),
    },
    {
      family: "Guide",
      owner: "OVE-498",
      role: "guest",
      address: localized("/guides/start-a-living-plant-record"),
    },
    {
      family: "Notes (blog)",
      owner: "OVE-499",
      role: "guest",
      address: localized("/blog"),
    },
    {
      family: "Note",
      owner: "OVE-499",
      role: "guest",
      address: localized("/blog/ai-garden-advice-vs-real-garden-proof"),
    },
    {
      family: "Market page",
      owner: "OVE-499",
      role: "guest",
      address: (l) =>
        l === "uk" ? "/markets/ukraine" : `/${l}/markets/bulgaria`,
    },
    {
      family: "Source archive (EPPO)",
      owner: "OVE-499",
      role: "guest",
      address: localized("/sources/eppo"),
    },
    {
      family: "Privacy",
      owner: "OVE-505",
      role: "guest",
      address: localized("/privacy"),
    },
    {
      family: "Support",
      owner: "OVE-505",
      role: "guest",
      address: localized("/support"),
    },
    {
      family: "Terms of use",
      owner: "OVE-526",
      role: "guest",
      address: localized("/terms"),
    },
    {
      family: "Cookie rules",
      owner: "OVE-526",
      role: "guest",
      address: localized("/cookies"),
    },
    {
      family: "Sign in",
      owner: "OVE-504",
      role: "guest",
      address: one("/auth/sign-in"),
    },
    {
      family: "Sign up",
      owner: "OVE-504",
      role: "guest",
      address: one("/auth/sign-up"),
    },
    {
      family: "Sign-in help",
      owner: "OVE-504",
      role: "guest",
      address: one("/auth/help"),
    },
    {
      family: "My garden · guest",
      owner: "OVE-489",
      role: "guest",
      address: one("/garden"),
    },
    {
      family: "Write · guest",
      owner: "OVE-486",
      role: "guest",
      address: one("/garden/new"),
    },
    {
      family: "Activity · guest",
      owner: "OVE-501",
      role: "guest",
      address: localized("/notifications"),
    },
    {
      family: "Bookmarks · guest",
      owner: "OVE-502",
      role: "guest",
      address: localized("/bookmarks"),
    },
    {
      family: "Erasure request · guest",
      owner: "OVE-505",
      role: "guest",
      address: one("/erasure"),
    },
    {
      family: "Unknown first segment",
      owner: "OVE-478",
      role: "guest",
      address: one("/no-such-family-here"),
      status: 404,
    },
  ];
  if (communityPath)
    rows.push({
      family: "Community",
      owner: "OVE-500",
      role: "guest",
      address: localized(communityPath),
    });
  if (topicPath)
    rows.push({
      family: "Topic",
      owner: "OVE-498",
      role: "guest",
      address: localized(topicPath),
    });
  return rows;
}

function memberRowsFor(): Row[] {
  const { spaceId, objectId, entryId } = memberRows;
  return [
    {
      family: "My garden",
      owner: "OVE-489",
      role: "member",
      address: one("/garden"),
    },
    {
      family: "Write (global)",
      owner: "OVE-486",
      role: "member",
      address: one("/garden/new"),
    },
    {
      family: "Write (contextual)",
      owner: "OVE-486",
      role: "member",
      address: one(`/garden/new?object=${objectId}`),
    },
    {
      family: "Space setup",
      owner: "OVE-484",
      role: "member",
      address: one("/garden/spaces/new"),
    },
    {
      family: "Object setup",
      owner: "OVE-485",
      role: "member",
      address: one("/garden/objects/new"),
    },
    {
      family: "Space page",
      owner: "OVE-490",
      role: "member",
      address: one(`/garden/spaces/${spaceId}`),
    },
    {
      family: "Space settings",
      owner: "OVE-490",
      role: "member",
      address: one(`/garden/spaces/${spaceId}/settings`),
    },
    {
      family: "Object page",
      owner: "OVE-491",
      role: "member",
      address: one(`/garden/objects/${objectId}`),
    },
    {
      family: "Object settings",
      owner: "OVE-491",
      role: "member",
      address: one(`/garden/objects/${objectId}/settings`),
    },
    {
      family: "Object provenance",
      owner: "OVE-491",
      role: "member",
      address: one(`/garden/objects/${objectId}/provenance`),
    },
    {
      family: "Entry editing",
      owner: "OVE-488",
      role: "member",
      address: one(`/garden/entries/${entryId}/edit`),
    },
    {
      family: "Public profile editing",
      owner: "OVE-503",
      role: "member",
      address: one("/garden/profile"),
    },
    {
      family: "Account settings",
      owner: "OVE-503",
      role: "member",
      address: one("/account/settings"),
    },
    {
      family: "Sign-in and security",
      owner: "OVE-503",
      role: "member",
      address: one("/account/security"),
    },
    {
      family: "Activity",
      owner: "OVE-501",
      role: "member",
      address: localized("/notifications"),
    },
    {
      family: "Activity preferences",
      owner: "OVE-501",
      role: "member",
      address: localized("/notifications/settings"),
    },
    {
      family: "Bookmarks",
      owner: "OVE-502",
      role: "member",
      address: localized("/bookmarks"),
    },
    {
      family: "Erasure request",
      owner: "OVE-505",
      role: "member",
      address: one("/erasure"),
    },
    {
      family: "Lineage · questions",
      owner: "OVE-495",
      role: "member",
      address: one("/garden/lineage/questions"),
    },
    {
      family: "Lineage · claims",
      owner: "OVE-495",
      role: "member",
      address: one("/garden/lineage/claims"),
    },
    {
      family: "Owner queue · refused to a member",
      owner: "OVE-506",
      role: "member",
      address: one("/garden/catalog/queue"),
    },
    {
      family: "Moderation · refused to a member",
      owner: "OVE-500",
      role: "member",
      address: one("/account/communities"),
    },
    {
      family: "Erasure queue · refused to a member",
      owner: "OVE-505",
      role: "member",
      address: one("/garden/privacy/erasure-requests"),
    },
    {
      // Below a section, an address no page serves is a real 404 before
      // anything streams, signed in or not (ADR-0029 D3).
      family: "Workspace · unknown address",
      owner: "OVE-478",
      role: "member",
      address: one("/garden/no-such-page"),
      status: 404,
    },
  ];
}

function ownerRows(): Row[] {
  return [
    {
      family: "Owner · decision queue",
      owner: "OVE-506",
      role: "owner",
      address: one("/garden/catalog/queue"),
    },
    {
      family: "Owner · sources",
      owner: "OVE-506",
      role: "owner",
      address: one("/garden/catalog/sources"),
    },
    {
      family: "Owner · erasure queue",
      owner: "OVE-505",
      role: "owner",
      address: one("/garden/privacy/erasure-requests"),
    },
    {
      family: "Owner · community moderation",
      owner: "OVE-500",
      role: "owner",
      address: one("/account/communities"),
    },
    {
      family: "Owner · comment moderation",
      owner: "OVE-500",
      role: "owner",
      address: one("/account/moderation/comments"),
    },
  ];
}

async function contextFor(
  browser: Browser,
  baseURL: string,
  role: Role,
  locale: Locale,
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies([
    { name: "overgarden_interface_locale", value: locale, url: baseURL },
    { name: "overgarden_interface_market", value: "ukraine", url: baseURL },
    ...(role === "member"
      ? memberCookies
      : role === "owner"
        ? ownerCookies
        : []),
  ]);
  // The consent notice is its own proof (`consent-and-erasure.spec.ts`); here
  // it would only stand between the sweep and the page.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("overgarden:analytics-consent", "declined");
    } catch {
      // Storage blocked: the notice shows and the sweep still measures.
    }
  });
  return context;
}

async function sweep(
  browser: Browser,
  baseURL: string,
  locale: Locale,
): Promise<{ measured: Measured[]; crawled: Crawled[] }> {
  const measured: Measured[] = [];
  const crawled: Crawled[] = [];
  const groups: Array<[Role, Row[]]> = [
    ["guest", guestRows()],
    ["member", memberRowsFor()],
    ["owner", ownerRows()],
  ];
  for (const [role, rows] of groups) {
    const context = await contextFor(browser, baseURL, role, locale);
    const page = await context.newPage();
    const links = new Set<string>();
    try {
      for (const row of rows) {
        const address = row.address(locale);
        const response = await page.goto(address, { waitUntil: "load" });
        // Workspace content streams in behind the shell; the one heading is
        // there once nothing is left to reveal.
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
        // …and React reveals what arrived no sooner than 300 ms after the
        // previous reveal, so the heading is waited for rather than assumed.
        // A page that never shows one is recorded as such, not thrown on.
        await page
          .locator("h1")
          .filter({ visible: true })
          .first()
          .waitFor({ state: "visible", timeout: 10_000 })
          .catch(() => undefined);
        const facts = await page.evaluate(() => {
          const visible = (element: Element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              box.width > 0 &&
              box.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          };
          const headings = [...document.querySelectorAll("h1")].filter(visible);
          return {
            lang: document.documentElement.lang,
            headings: headings.length,
            h1: headings[0]?.textContent?.trim() ?? "",
            mains: document.querySelectorAll("main").length,
            languageControls: document.querySelectorAll(
              "[data-interface-language-control]",
            ).length,
            overflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            title: document.title,
            errorStates: [
              ...document.querySelectorAll('[data-screen-state="error"]'),
            ].filter(visible).length,
            // OVE-478 criterion 2: a long translation never overlaps a
            // control. Measured on the controls' own boxes at 320 px, where
            // Bulgarian and Russian labels are longest against the width.
            ...(() => {
              const controls = [
                ...document.querySelectorAll<HTMLElement>(
                  'a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="tab"]',
                ),
              ].filter(
                (element) =>
                  visible(element) &&
                  !element.closest('[aria-hidden="true"], [hidden]') &&
                  element.getBoundingClientRect().width > 2 &&
                  element.getBoundingClientRect().height > 2,
              );
              const name = (element: HTMLElement) =>
                `${element.tagName.toLowerCase()}:${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 32)}`;
              const overlaps: string[] = [];
              for (let first = 0; first < controls.length; first += 1) {
                const a = controls[first]!.getBoundingClientRect();
                for (
                  let second = first + 1;
                  second < controls.length;
                  second += 1
                ) {
                  const other = controls[second]!;
                  if (
                    other.contains(controls[first]!) ||
                    controls[first]!.contains(other)
                  ) {
                    continue;
                  }
                  const b = other.getBoundingClientRect();
                  const width =
                    Math.min(a.right, b.right) - Math.max(a.left, b.left);
                  const height =
                    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  if (width > 2 && height > 2) {
                    overlaps.push(`${name(controls[first]!)} ↔ ${name(other)}`);
                  }
                }
              }
              const clippedLabels = controls
                .filter((element) => {
                  const style = getComputedStyle(element);
                  return (
                    style.overflowX !== "visible" &&
                    style.textOverflow !== "ellipsis" &&
                    element.scrollWidth > element.clientWidth + 1
                  );
                })
                .map(name);
              return {
                overlaps: overlaps.slice(0, 12),
                clippedLabels: clippedLabels.slice(0, 12),
              };
            })(),
            // OVE-478: words that run together for a screen reader
            // («АвторОлена», «Простори3», heard with Orca). Chromium names a
            // line's text as its text nodes, so two words need a space inside
            // one of them. A margin or padding draws a gap and adds none; and
            // a space alone right after a comment — the `<!-- -->` React
            // writes between two pieces of text, as `{title}{" "}<span>`
            // renders — is dropped from the name. A flex item or an
            // inline-block is kept apart already. Letters and digits only: a
            // joined "·" or ":" reads fine.
            joinedWords: (() => {
              const joined: string[] = [];
              const word = /[\p{L}\p{N}]/u;
              const ends = (text: string) => word.test(text.slice(-1));
              const starts = (text: string) => word.test(text.slice(0, 1));
              const label = (left: string, right: string) =>
                `${left.trim().slice(-24)}|${right.trim().slice(0, 24)}`;
              const hidden = (node: Node) =>
                !!(
                  node instanceof Element ? node : node.parentElement
                )?.closest(
                  '[aria-hidden="true"], [hidden], script, style, template, noscript',
                );
              const isInline = (node: Element) => {
                const style = getComputedStyle(node);
                return (
                  style.display === "inline" && style.position !== "absolute"
                );
              };
              // The text a sibling puts on the line, or "" where the line
              // breaks there or nothing is read.
              const textOf = (node: Node | null) =>
                node === null || hidden(node)
                  ? ""
                  : node.nodeType === Node.TEXT_NODE
                    ? (node.textContent ?? "")
                    : node instanceof Element && isInline(node)
                      ? (node.textContent ?? "")
                      : "";
              const lone = (node: Node | null) =>
                node?.nodeType === Node.TEXT_NODE && !node.textContent?.trim();
              // What stands before a node as Chromium names it: a lone space
              // after a comment is not there.
              const previousOf = (node: Node) => {
                const previous = node.previousSibling;
                return lone(previous) &&
                  previous!.previousSibling?.nodeType === Node.COMMENT_NODE
                  ? previous!.previousSibling.previousSibling
                  : previous;
              };
              const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
              );
              for (
                let node = walker.nextNode();
                node;
                node = walker.nextNode()
              ) {
                if (hidden(node)) continue;
                if (node.nodeType === Node.TEXT_NODE) {
                  // A dropped space between two words.
                  if (
                    lone(node) &&
                    node.previousSibling?.nodeType === Node.COMMENT_NODE
                  ) {
                    const before = textOf(node.previousSibling.previousSibling);
                    // `{a} {b}` writes a comment on both sides of the space.
                    let next = node.nextSibling;
                    while (next?.nodeType === Node.COMMENT_NODE) {
                      next = next.nextSibling;
                    }
                    const after = textOf(next);
                    if (ends(before) && starts(after)) {
                      joined.push(label(before, after));
                    }
                  }
                  continue;
                }
                const element = node as Element;
                if (!isInline(element) || !visible(element)) continue;
                const style = getComputedStyle(element);
                const own = element.textContent ?? "";
                const startGap =
                  parseFloat(style.marginLeft) + parseFloat(style.paddingLeft) >
                  0;
                const endGap =
                  parseFloat(style.marginRight) +
                    parseFloat(style.paddingRight) >
                  0;
                const before = textOf(previousOf(element));
                const after = textOf(element.nextSibling);
                if (own.trim()) {
                  if (startGap && ends(before) && starts(own)) {
                    joined.push(label(before, own));
                  }
                  if (endGap && ends(own) && starts(after)) {
                    joined.push(label(own, after));
                  }
                } else if (
                  (startGap || endGap) &&
                  ends(before) &&
                  starts(after)
                ) {
                  joined.push(label(before, after));
                }
              }
              return [...new Set(joined)].slice(0, 12);
            })(),
            // Neither Bulgarian nor Russian writes і, ї, є or ґ. A gardener's
            // own words may, so this is recorded for review rather than
            // failed on; the language names in the switcher are endonyms.
            ukrainianLetters:
              document.documentElement.lang === "uk"
                ? []
                : [
                    ...new Set(
                      [...document.querySelectorAll("body *")]
                        .filter(
                          (element) =>
                            visible(element) &&
                            !element.closest(
                              "[data-interface-language-control]",
                            ),
                        )
                        .flatMap((element) =>
                          [...element.childNodes]
                            .filter((node) => node.nodeType === Node.TEXT_NODE)
                            .map((node) => node.textContent?.trim() ?? ""),
                        )
                        .filter((text) => /[іїєґІЇЄҐ]/u.test(text)),
                    ),
                  ].slice(0, 12),
          };
        });
        measured.push({
          family: row.family,
          owner: row.owner,
          role,
          locale,
          address,
          status: response?.status() ?? 0,
          ...facts,
        });
        for (const href of await page.evaluate(() =>
          [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
            .map((anchor) => anchor.href)
            .filter((href) => href.startsWith(location.origin)),
        )) {
          const url = new URL(href);
          if (url.pathname.startsWith("/api/")) continue;
          url.hash = "";
          links.add(`${url.pathname}${url.search}`);
        }
      }
      // Every link the pages offered, asked for as this reader: nothing may
      // answer 5xx, and a link in the chrome or to a page family may not
      // answer 404. Redirects are answers, not failures — ADR-0029's 308s.
      for (const href of [...links].sort()) {
        const answer = await context.request.get(href, { maxRedirects: 0 });
        crawled.push({
          role,
          locale,
          href,
          status: answer.status(),
          entity: ENTITY_ADDRESS.test(new URL(href, baseURL).pathname),
        });
      }
    } finally {
      await context.close();
    }
  }
  return { measured, crawled };
}

for (const locale of ["uk", "bg", "ru"] as const) {
  test(`every family, every role, in ${locale}: its status, its language, one heading, one language control, no sideways scroll at 320 px`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(420_000);
    const { measured, crawled } = await sweep(browser, baseURL!, locale);

    const out = path.join(process.cwd(), "test-results", "route-families");
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, `${locale}.json`),
      `${JSON.stringify(measured, null, 2)}\n`,
    );
    writeFileSync(
      path.join(out, `${locale}-links.json`),
      `${JSON.stringify(crawled, null, 2)}\n`,
    );

    const expected = new Map(
      [...guestRows(), ...memberRowsFor(), ...ownerRows()].map((row) => [
        `${row.role}:${row.family}`,
        row.status ?? 200,
      ]),
    );
    const problems = measured.flatMap((row) => {
      const wrong: string[] = [];
      const status = expected.get(`${row.role}:${row.family}`) ?? 200;
      if (row.status !== status)
        wrong.push(`status ${row.status}, not ${status}`);
      if (row.lang !== locale) wrong.push(`lang "${row.lang}"`);
      if (row.headings !== 1) wrong.push(`${row.headings} visible h1`);
      if (row.mains !== 1) wrong.push(`${row.mains} main`);
      if (row.languageControls !== 1)
        wrong.push(`${row.languageControls} language controls`);
      if (row.overflow > 0) wrong.push(`${row.overflow}px sideways at 320`);
      // A page that renders its error state has a read that failed: in a
      // sweep over fixtures that exist, that is a defect, not a state.
      if (row.errorStates > 0) wrong.push(`${row.errorStates} error state(s)`);
      if (row.joinedWords.length > 0) {
        wrong.push(`words read as one: ${row.joinedWords.join(", ")}`);
      }
      return wrong.length
        ? [`${row.role} ${row.family} (${row.address}): ${wrong.join("; ")}`]
        : [];
    });
    const deadLinks = crawled
      .filter(
        (link) =>
          link.status >= 500 ||
          (!link.entity && (link.status === 404 || link.status === 410)),
      )
      .map((link) => `${link.role} ${link.href}: ${link.status}`);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(deadLinks, deadLinks.join("\n")).toEqual([]);
    // The crawl reached something: a sweep that followed no links proves
    // nothing about them.
    expect(crawled.length).toBeGreaterThan(50);
  });
}

/**
 * The addresses no page serves (`OVE-478` criterion 3; `ROUTE_OWNERSHIP.md`
 * gives this issue the 32 `[...missing]` catch-alls). Each answers a real 404
 * decided by the proxy before anything streams (ADR-0029 D3): not a 200 with a
 * `noindex` apology, which is what 23 of them answered, and not the
 * framework's 500, which is what an unknown answer, guide, note or market
 * answered — on production too. The body is the raw lifecycle document: in
 * the reader's language, one heading, one way on.
 */
test("every address no page serves answers a real 404, in the reader's language, with one way on", async ({
  playwright,
  baseURL,
}) => {
  const NOBODY = "ove478-no-such";
  // One address below each catch-all, and each authored name that no page has.
  const CATCH_ALLS = [
    "account",
    "answers",
    "auth",
    "blog",
    "bookmarks",
    "breed",
    "catalog",
    "col",
    "communities",
    "cookies",
    "eppo",
    "erasure",
    "feed",
    "garden",
    "gbif",
    "guides",
    "id",
    "journal",
    "journals",
    "knowledge",
    "lineage",
    "markets",
    "notifications",
    "privacy",
    "skeleton",
    "sources",
    "species",
    "support",
    "terms",
    "topics",
    "variety",
    "wikidata",
  ];
  const addresses: Array<{ path: string; lang: Locale }> = [
    ...CATCH_ALLS.map((family) => ({
      path: `/${family}/${NOBODY}/${NOBODY}`,
      lang: "uk" as const,
    })),
    ...["answers", "guides", "blog", "markets"].flatMap((family) => [
      { path: `/${family}/${NOBODY}`, lang: "uk" as const },
      { path: `/bg/${family}/${NOBODY}`, lang: "bg" as const },
      { path: `/ru/${family}/${NOBODY}`, lang: "ru" as const },
    ]),
    { path: `/bg/catalog/${NOBODY}`, lang: "bg" },
    { path: `/ru/journals/${NOBODY}`, lang: "ru" },
    { path: `/garden/objects/${randomUUID()}/${NOBODY}`, lang: "uk" },
  ];

  const answers: Array<{ path: string; status: number; robots: string }> = [];
  for (const { path: address, lang } of addresses) {
    // A reader with no saved language each time: a prefixed address saves
    // one, and the next unprefixed answer would rightly be in it.
    const request = await playwright.request.newContext({ baseURL });
    const answer = await request.get(address, {
      headers: { accept: "text/html", "sec-fetch-dest": "document" },
      maxRedirects: 0,
    });
    const html = await answer.text();
    await request.dispose();
    answers.push({
      path: address,
      status: answer.status(),
      robots: answer.headers()["x-robots-tag"] ?? "",
    });
    expect(answer.status(), address).toBe(404);
    expect(answer.headers()["x-robots-tag"], address).toBe("noindex, nofollow");
    // The diagnostic namespace answers an empty 404 of its own: it is not a
    // place a reader is ever sent, so there is no page to be lost on.
    if (address.startsWith("/skeleton/")) continue;
    expect(html, address).toContain(`<html lang="${lang}"`);
    const main = /<main>([\s\S]*)<\/main>/u.exec(html)?.[1] ?? "";
    expect(main.match(/<h1[\s>]/gu), address).toHaveLength(1);
    expect(main.match(/<a /gu), address).toHaveLength(1);
  }

  const out = path.join(process.cwd(), "test-results", "route-families");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "unserved.json"),
    `${JSON.stringify(answers, null, 2)}\n`,
  );
});

/**
 * The two horizontal strips — a profile's tabs and the feed's secondary bar —
 * at 100 % and at 200 % zoom (a 1280 × 900 window at twice the pixel ratio is
 * 640 × 450 CSS pixels). OG-UX-031 found vertical scrollbars on them; the fix
 * (`overflow-y-hidden`) shipped with nothing to show the track gone or the
 * focus ring whole (`OVE-478` criterion 12). Each item is reached with Tab,
 * and its ring, which is drawn inside it, must sit inside what the strip
 * shows.
 */
test("the horizontal strips have no vertical track, and clip no focus ring, at 100 % and 200 %", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const measured: unknown[] = [];
  const out = path.join(process.cwd(), "test-results", "route-families");
  mkdirSync(out, { recursive: true });
  for (const zoom of [
    { label: "100", viewport: { width: 1280, height: 900 }, scale: 1 },
    { label: "200", viewport: { width: 640, height: 450 }, scale: 2 },
  ]) {
    const context = await browser.newContext({
      baseURL,
      viewport: zoom.viewport,
      deviceScaleFactor: zoom.scale,
    });
    const page = await context.newPage();
    try {
      for (const [name, address, strip] of [
        ["profile-tabs", `/@${entry.handle}`, '[role="tablist"]'],
        ["feed-bar", "/feed", '[data-site-shell-secondary="feed"]'],
      ] as const) {
        await page.goto(address, { waitUntil: "load" });
        const bar = page.locator(`${strip}:visible`).first();
        await expect(bar, `${name} at ${zoom.label} %`).toBeVisible({
          timeout: 20_000,
        });
        const track = await bar.evaluate((element) => ({
          overflowY: getComputedStyle(element).overflowY,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        }));
        expect(track.overflowY, name).toBe("hidden");
        // Nothing is cut off vertically, so there is nothing to scroll to.
        expect(track.scrollHeight, name).toBeLessThanOrEqual(
          track.clientHeight,
        );

        // Tab into the strip, then through it.
        let inside = false;
        for (let step = 0; step < 80 && !inside; step += 1) {
          await page.keyboard.press("Tab");
          inside = await bar.evaluate((element) =>
            element.contains(document.activeElement),
          );
        }
        expect(inside, `${name}: Tab reaches the strip`).toBe(true);
        const items = await bar.locator("a, button").count();
        for (let item = 0; item < items; item += 1) {
          const ring = await bar.evaluate((element) => {
            const focused = document.activeElement as HTMLElement | null;
            if (!focused || !element.contains(focused)) return null;
            const style = getComputedStyle(focused);
            const extent =
              Number.parseFloat(style.outlineWidth) +
              Number.parseFloat(style.outlineOffset);
            const box = focused.getBoundingClientRect();
            const frame = element.getBoundingClientRect();
            const top = frame.top + element.clientTop;
            const left = frame.left + element.clientLeft;
            return {
              item: focused.textContent?.trim() ?? "",
              focusVisible: focused.matches(":focus-visible"),
              outline: `${style.outlineWidth} ${style.outlineStyle}`,
              clipped:
                box.top - extent < top - 0.5 ||
                box.bottom + extent > top + element.clientHeight + 0.5 ||
                box.left - extent < left - 0.5 ||
                box.right + extent > left + element.clientWidth + 0.5,
            };
          });
          if (!ring) break;
          measured.push({ zoom: zoom.label, strip: name, ...ring });
          expect(ring.focusVisible, `${name}: ${ring.item}`).toBe(true);
          expect(ring.outline, `${name}: ${ring.item}`).not.toMatch(
            /^0px|none/u,
          );
          expect(ring.clipped, `${name} at ${zoom.label} %: ${ring.item}`).toBe(
            false,
          );
          if (item === 0) {
            await bar.screenshot({
              path: path.join(out, `strip-${name}-${zoom.label}.png`),
            });
          }
          await page.keyboard.press("Tab");
        }
      }
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    path.join(out, "strips.json"),
    `${JSON.stringify(measured, null, 2)}\n`,
  );
});

/**
 * OG-UX-011: on a laptop, the directory's first result is on the first
 * screen, below a search and one row of modes rather than a wall of filters.
 * Measured where it was never measured: 1280 × 720, 1366 × 768, 1440 × 900.
 */
test("the first journals result is on the first screen at laptop heights", async ({
  browser,
  baseURL,
}) => {
  const measured: Array<{
    viewport: string;
    firstResultTop: number;
    height: number;
  }> = [];
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ baseURL, viewport });
    const page = await context.newPage();
    try {
      await page.goto("/journals", { waitUntil: "load" });
      const first = page
        .locator(
          '[data-public-journal-directory="true"] [data-slot="entry-card"]:visible',
        )
        .first();
      await expect(first).toBeVisible({ timeout: 20_000 });
      const heading = first.getByRole("heading").first();
      const top = await heading.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      );
      measured.push({
        viewport: `${viewport.width}×${viewport.height}`,
        firstResultTop: Math.round(top),
        height: viewport.height,
      });
      // The first result's title, whole, without scrolling.
      expect(top, `${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(
        viewport.height,
      );
    } finally {
      await context.close();
    }
  }
  const out = path.join(process.cwd(), "test-results", "route-families");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "journals-first-result.json"),
    `${JSON.stringify(measured, null, 2)}\n`,
  );
});

/**
 * The reader's own settings, on the pages most readers see (`OVE-478`
 * criterion 11): text at 200 % (WCAG 1.4.4), forced colours and reduced
 * motion together, and a phone held upright and on its side, where the fixed
 * header and tab bar leave least room and a focused control must not end up
 * under them (WCAG 2.4.11). 400 % zoom is the 320 px sweep above.
 */
test("at 200 % text, in forced colours with reduced motion, and on a phone held both ways", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const addresses = [
    "/",
    entry.entryPath,
    "/journals",
    "/catalog",
    `/species/${organism.speciesSlug}`,
    `/@${entry.handle}`,
    "/auth/sign-in",
    "/answers/ove478-no-such",
  ];
  const out = path.join(process.cwd(), "test-results", "route-families");
  mkdirSync(out, { recursive: true });
  const measured: unknown[] = [];

  // 1. Text at 200 %: the tokens are rem, so this is the browser's text size.
  {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    try {
      for (const address of addresses) {
        await page.goto(address, { waitUntil: "load" });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(
          () =>
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        );
        measured.push({ setting: "text-200", address, overflow });
        expect(overflow, `${address} at 200 % text`).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  }

  // 2. Forced colours and reduced motion: the ring is still drawn, the
  //    current page is still marked without colour, and nothing moves.
  {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1280, height: 900 },
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      for (const address of addresses) {
        await page.goto(address, { waitUntil: "load" });
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        // Hydration can restyle the control a moment after the press; the
        // ring is asked for until it is drawn, and fails if it never is.
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const focused = document.activeElement as HTMLElement | null;
                if (!focused || focused === document.body) return "none";
                const style = getComputedStyle(focused);
                return `${style.outlineWidth} ${style.outlineStyle}`;
              }),
            {
              message: `${address}: the ring in forced colours`,
              timeout: 3_000,
            },
          )
          .not.toMatch(/^0px|none/u);
        const facts = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null;
          const style = focused ? getComputedStyle(focused) : null;
          const current = document.querySelector('[aria-current="page"]');
          const moving = [...document.querySelectorAll("body *")].filter(
            (element) => {
              const computed = getComputedStyle(element);
              return (
                Number.parseFloat(computed.transitionDuration) > 0.001 ||
                Number.parseFloat(computed.animationDuration) > 0.001
              );
            },
          ).length;
          return {
            focused: focused?.tagName.toLowerCase() ?? null,
            outline: style ? `${style.outlineWidth} ${style.outlineStyle}` : "",
            currentUnderlined: current
              ? getComputedStyle(current).textDecorationLine.includes(
                  "underline",
                )
              : null,
            moving,
          };
        });
        measured.push({
          setting: "forced-colours+reduced-motion",
          address,
          ...facts,
        });
        expect(
          facts.outline,
          `${address}: the ring in forced colours`,
        ).not.toMatch(/^0px|none/u);
        if (facts.currentUnderlined !== null) {
          expect(facts.currentUnderlined, `${address}: the current page`).toBe(
            true,
          );
        }
        expect(facts.moving, `${address}: nothing moves`).toBe(0);
      }
    } finally {
      await context.close();
    }
  }

  // 3. A phone, upright and on its side: no sideways scroll, and every
  //    control Tab reaches is at least partly in view, not under the chrome.
  for (const [label, viewport] of [
    ["portrait", { width: 390, height: 844 }],
    ["landscape", { width: 844, height: 390 }],
  ] as const) {
    const context = await browser.newContext({
      baseURL,
      viewport,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      for (const address of addresses) {
        await page.goto(address, { waitUntil: "load" });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${address} ${label}`).toBeLessThanOrEqual(0);
        const hidden: string[] = [];
        for (let step = 0; step < 25; step += 1) {
          await page.keyboard.press("Tab");
          const obscured = await page.evaluate(() => {
            const focused = document.activeElement as HTMLElement | null;
            if (!focused || focused === document.body) return null;
            const box = focused.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return null;
            // What sits on top of the control's centre and corners.
            const points = [
              [box.left + box.width / 2, box.top + box.height / 2],
              [box.left + 2, box.top + 2],
              [box.right - 2, box.bottom - 2],
            ];
            const covered = points.every(([x, y]) => {
              if (y! < 0 || y! > innerHeight || x! < 0 || x! > innerWidth) {
                return true;
              }
              const top = document.elementFromPoint(x!, y!);
              return (
                !!top &&
                top !== focused &&
                !focused.contains(top) &&
                !top.contains(focused)
              );
            });
            return covered
              ? `${focused.tagName.toLowerCase()}:${(focused.getAttribute("aria-label") ?? focused.textContent ?? "").trim().slice(0, 30)}`
              : null;
          });
          if (obscured) hidden.push(obscured);
        }
        measured.push({ setting: `phone-${label}`, address, overflow, hidden });
        expect(hidden, `${address} ${label}: focus under the chrome`).toEqual(
          [],
        );
      }
      await page.goto(entry.entryPath, { waitUntil: "load" });
      await page.screenshot({
        path: path.join(out, `phone-${label}-entry.png`),
      });
    } finally {
      await context.close();
    }
  }
  // 4. The composer with a phone's keyboard up. An emulator cannot raise the
  //    on-screen keyboard; what it does to the page is leave a visual
  //    viewport about half the height, which is what this is. The destination
  //    field, the text and Publish must each be reachable by keyboard and in
  //    view, not under the header or the tab bar.
  {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addCookies([
      { name: "overgarden_interface_locale", value: "uk", url: baseURL! },
      ...memberCookies,
    ]);
    const page = await context.newPage();
    try {
      await page.goto("/garden/new", { waitUntil: "load" });
      const picker = page.getByRole("combobox").first();
      await expect(picker).toBeVisible({ timeout: 20_000 });
      // The text is an editor only once it has hydrated; before that Tab has
      // nothing to land on there.
      await expect(
        page
          .locator("[data-lexical-journal-canvas] [contenteditable='true']")
          .first(),
      ).toBeAttached({ timeout: 20_000 });
      const reached: string[] = [];
      const hidden: string[] = [];
      const isPublish = (name: string) =>
        name.startsWith("button:") && name.includes("Опублікувати");
      for (let step = 0; step < 60; step += 1) {
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return null;
          const box = element.getBoundingClientRect();
          // As the phone check above: hidden when its centre and both
          // corners are off screen or under something else (WCAG 2.4.11).
          const points = [
            [box.left + box.width / 2, box.top + box.height / 2],
            [box.left + 2, box.top + 2],
            [box.right - 2, box.bottom - 2],
          ];
          const over: string[] = [];
          const covered = points.every(([x, y]) => {
            if (y! < 0 || y! > innerHeight || x! < 0 || x! > innerWidth) {
              over.push("off screen");
              return true;
            }
            const top = document.elementFromPoint(x!, y!);
            const under =
              !!top &&
              top !== element &&
              !element.contains(top) &&
              !top.contains(element);
            if (under)
              over.push(
                `${top.tagName.toLowerCase()}.${[...top.classList].slice(0, 3).join(".")}`,
              );
            return under;
          });
          const role = element.getAttribute("role");
          const name = `${element.tagName.toLowerCase()}${role ? `[${role}]` : ""}:${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 30)}`;
          return {
            name,
            obscured: covered
              ? `${name} (${[...new Set(over)].join(", ")}; ${Math.round(box.top)}–${Math.round(box.bottom)} of ${innerHeight})`
              : null,
            unticked:
              element instanceof HTMLInputElement &&
              element.type === "checkbox" &&
              !element.checked,
          };
        });
        if (focused) {
          reached.push(focused.name);
          if (focused.obscured) hidden.push(focused.obscured);
          if (isPublish(focused.name)) break;
          // Publish is unavailable until the first-publication box is
          // ticked, so a keyboard ticks it on the way, as a person would.
          if (focused.unticked) await page.keyboard.press("Space");
        }
        await page.keyboard.press("Tab");
      }
      measured.push({
        setting: "phone-keyboard-up",
        address: "/garden/new",
        reached,
        hidden,
      });
      const walked = reached.join(" | ");
      expect(
        reached.some((name) => name.startsWith("input[combobox]:")),
        `the destination field: ${walked}`,
      ).toBe(true);
      expect(
        reached.some((name) => name.includes("Вміст запису")),
        `the text: ${walked}`,
      ).toBe(true);
      expect(reached.some(isPublish), `Publish: ${walked}`).toBe(true);
      expect(hidden, "/garden/new with the keyboard up").toEqual([]);
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    path.join(out, "reader-settings.json"),
    `${JSON.stringify(measured, null, 2)}\n`,
  );
});
