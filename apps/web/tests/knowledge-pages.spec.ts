import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "playwright/test";
import { Pool } from "pg";

import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  scanAccessibility,
  tabToControl,
} from "./helpers/redesign-accessibility";

/**
 * `OVE-498`: knowledge says what each piece is and what it rests on.
 *
 *   pnpm build && pnpm exec tsx scripts/run-browser-gate.ts \
 *     --spec=knowledge-pages.spec.ts
 *
 * The pieces are the product's own: the tomato answer, gardening advice with
 * four cited sources, and the first-record guide, help with OverGarden. Both
 * are prerendered at build, so the gardeners' entries beside them are
 * whatever the gate's database held then — which for the tomato species and
 * for the `plants` topic is nothing a listing can show, and each page says
 * so. The populated side is read on the spec's own topic, `Балконні томати`,
 * with two entries by a gardener who has an address.
 *
 * That fixture is created if it is missing and never deleted. Other specs walk
 * every curated topic and request each one; a topic that vanished between the
 * two would fail them on a line they do not own.
 */

const LOCALE_COOKIE = "overgarden_interface_locale";
const MARKET_COOKIE = "overgarden_interface_market";
const CONSENT_KEY = "overgarden:analytics-consent";
const SCREENSHOTS = path.join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "redesign",
  "2026-09-21",
  "ove-498",
);
const ANSWER = "/answers/why-are-tomato-leaves-yellow";
const GUIDE = "/guides/start-a-living-plant-record";
const TOPIC = "/topics/plants";
const SOURCE_ONE =
  "https://extension.umd.edu/resource/key-common-problems-tomatoes";

/** The spec's own topic and the gardener who wrote under it. */
const FIXTURE = {
  userId: "4e0b0498-0000-4000-8000-000000000001",
  spaceId: "4e0b0498-0000-4000-8000-000000000002",
  objectId: "4e0b0498-0000-4000-8000-000000000003",
  topicId: "4e0b0498-0000-4000-8000-000000000006",
  topicSlug: "ove498-balcony-tomatoes",
  topicLabel: "Балконні томати",
  entries: [
    {
      id: "4e0b0498-0000-4000-8000-000000000004",
      slug: "ove498-entry-yellow-lower-leaves",
      title: "Жовті нижні листки після зливи",
      body: "Після тижня дощів пожовкли три нижні листки. Верхівка зелена, плям немає. Прибрала мульчу від стебла й поливаю лише зранку.",
      daysAgo: 3,
    },
    {
      id: "4e0b0498-0000-4000-8000-000000000005",
      slug: "ove498-entry-ringed-spots",
      title: "Плями з кільцями на старому листі",
      body: "На двох старих листках з'явилися бурі плями з кільцями, як мішень. Зрізала їх і відкрила кущ для провітрювання.",
      daysAgo: 1,
    },
  ],
} as const;

type Locale = "uk" | "bg" | "ru";

let pool: Pool;
/** Whether `plants` held an entry a listing can show when the pages were built. */
let plantsAddressable = 0;
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  pool = new Pool({ connectionString: requiredLocalDatabaseUrl(), max: 2 });
  mkdirSync(SCREENSHOTS, { recursive: true });
  await ensureTopicFixture(pool);
  // The same rule the pages count by: an entry whose author has an address.
  const plants = await pool.query<{ entries: number }>(
    `select count(distinct je.id)::int as entries
       from journal_topics t
       join journal_entry_topic_signals s on s.topic_id = t.id
       join journal_entries je on je.id = s.journal_entry_id
      where t.slug = 'plants' and t.trust_state = 'curated'
        and s.review_state = 'accepted'
        and s.public_membership_state = 'eligible'
        and je.visibility = 'public' and je.lifecycle_state = 'active'
        and exists (select 1 from user_handle_registry h
                     where h.user_id = je.owner_user_id
                       and h.lifecycle_state = 'current')`,
  );
  plantsAddressable = plants.rows[0]?.entries ?? 0;
  const tomato = await pool.query(
    `select 1 from catalog_items where public_slug = 'solanum-lycopersicum'`,
  );
  expect(
    tomato.rowCount,
    "the gate catalogue holds the tomato species, so the answer's evidence is not the empty state this spec reads",
  ).toBe(0);
});

/** Idempotent: every row by a fixed id, inserted only when it is missing. */
async function ensureTopicFixture(pool: Pool) {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Ірина з Черкас', 'ove498-knowledge@example.test', true, now(), now())
     on conflict (id) do nothing`,
    [FIXTURE.userId],
  );
  const handle = await pool.query(
    `select 1 from user_handle_registry where user_id = $1 and lifecycle_state = 'current'`,
    [FIXTURE.userId],
  );
  expect(handle.rowCount, "the fixture gardener holds no handle").toBe(1);
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Балкон')
     on conflict (id) do nothing`,
    [FIXTURE.spaceId, FIXTURE.userId],
  );
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
     values ($1, $2, $3, 'Томат у вазоні', 'plant', 'unknown')
     on conflict (id) do nothing`,
    [FIXTURE.objectId, FIXTURE.userId, FIXTURE.spaceId],
  );
  await pool.query(
    `insert into journal_topics (id, slug, label, trust_state) values ($1, $2, $3, 'curated')
     on conflict (id) do nothing`,
    [FIXTURE.topicId, FIXTURE.topicSlug, FIXTURE.topicLabel],
  );
  for (const entry of FIXTURE.entries) {
    await pool.query(
      `insert into journal_entries (id, owner_user_id, space_id, plant_object_id, title, body, entry_scope,
         visibility, lifecycle_state, published_at, public_slug, source_language, client_mutation_id)
       values ($1, $2, $3, $4, $5, $6, 'object', 'public', 'active',
               now() - make_interval(days => $7), $8, 'uk', $8)
       on conflict (id) do nothing`,
      [
        entry.id,
        FIXTURE.userId,
        FIXTURE.spaceId,
        FIXTURE.objectId,
        entry.title,
        entry.body,
        entry.daysAgo,
        entry.slug,
      ],
    );
    // Observed on the day it was published, as a gardener's entry is.
    await pool.query(
      `update journal_entries set entry_date = published_at::date where id = $1`,
      [entry.id],
    );
    await pool.query(
      `insert into journal_entry_topic_signals (journal_entry_id, topic_id, signal_source, review_state, public_membership_state)
       values ($1, $2, 'operator_curated', 'accepted', 'eligible')
       on conflict do nothing`,
      [entry.id, FIXTURE.topicId],
    );
  }
}

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await pool?.end();
});

const localized = (address: string, locale: Locale) =>
  locale === "uk" ? address : `/${locale}${address}`;

async function readerContext(
  browser: Browser,
  baseURL: string,
  options: {
    locale?: Locale;
    viewport?: { width: number; height: number };
    javaScriptEnabled?: boolean;
  } = {},
) {
  const locale = options.locale ?? "uk";
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  contexts.push(context);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: MARKET_COOKIE,
      value: locale === "bg" ? "bulgaria" : "ukraine",
      url: baseURL,
    },
  ]);
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "declined");
    } catch {
      // Storage may be blocked; the notice is then simply drawn.
    }
  }, CONSENT_KEY);
  // Another site, answered here: the journey leaves for a source and comes
  // back, and a gate must not depend on a university's server.
  await context.route("https://extension.umd.edu/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html lang=en><title>Key to Common Problems of Tomatoes</title><h1>Key to Common Problems of Tomatoes</h1></html>",
    }),
  );
  return context;
}

/** The `<main>` of a served document, and its `<h2>` ids in order. */
function mainOf(html: string) {
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const headings = [...main.matchAll(/<h2[^>]*\sid="([^"]+)"/gu)].map(
    (match) => match[1],
  );
  return { main, headings };
}

test.describe("knowledge that says what it rests on (OVE-498)", () => {
  test("the answer, from the served bytes: advice, its sources, what it is not, and help kept apart", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`${baseURL}${ANSWER}`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    const { main, headings } = mainOf(html);

    // What it is, before what shape it has; the byline points down to the
    // provenance rather than naming a product principle as the source.
    expect(main).toMatch(/<h1[^>]*>Чому жовтіє листя томатів\?<\/h1>/u);
    expect(main).toContain("Садівництво · Відповідь");
    expect(main).toMatch(
      /<a href="#answer-about"[^>]*>4 джерела й обмеження<\/a>/u,
    );
    expect(main).not.toMatch(
      /Продуктові|принцип|перевірюваним досвідом|Поточна версія|MVP|Авторський матеріал/u,
    );

    // The page's outline, in the order a reader needs it. The related
    // section is its one topic, `plants`, listed only while the topic holds
    // an entry a listing can show.
    expect(headings).toEqual([
      "answer-concise",
      "answer-causes",
      "answer-observations",
      "answer-faq",
      "answer-evidence",
      "answer-product-help",
      "answer-about",
      ...(plantsAddressable > 0 ? ["answer-related"] : []),
    ]);

    // Every citation lands on a source the page lists, and every source is
    // another site's page in its own language.
    const cited = new Set(
      [...main.matchAll(/href="#knowledge-source-(\d+)"/gu)].map(
        (match) => match[1],
      ),
    );
    expect([...cited].sort()).toEqual(["1", "2", "3", "4"]);
    for (const number of cited) {
      expect(main).toContain(`id="knowledge-source-${number}"`);
    }
    expect(main).toMatch(
      new RegExp(
        `<li id="knowledge-source-1"[^>]*><span lang="en"><a[^>]*href="${SOURCE_ONE.replaceAll(".", "\\.")}"`,
        "u",
      ),
    );
    expect(main).toContain("Royal Horticultural Society");
    expect(main).toContain("переглянуто 23 вер. 2026");
    // What it is not.
    expect(main).toContain("Це не діагноз");
    expect(main).toContain(
      "Агроном чи фахівець із захисту рослин цей текст не перевіряв.",
    );

    // The help with OverGarden is its own section, labelled, and not in the
    // FAQ; the FAQ is the gardening questions only.
    const faq = main.slice(
      main.indexOf('id="answer-faq"'),
      main.indexOf('id="answer-evidence"'),
    );
    expect(faq).not.toMatch(/OverGarden|WebP|Опублікувати/u);
    const help = main.slice(
      main.indexOf('data-knowledge-subject="product"'),
      main.indexOf('data-knowledge-about="true"'),
    );
    expect(help).toContain("Довідка OverGarden");
    expect(help).toContain("OverGarden не ставить діагнозів");
    expect(help).toContain(`href="${GUIDE}"`);

    // Nobody here has written about the tomato species yet, and the page
    // says so instead of counting nothing.
    expect(main).toContain('data-knowledge-evidence="empty"');
    expect(main).toContain("Записів садівників тут поки немає");
    expect(main).not.toContain("data-knowledge-evidence-count");

    // One related section, of what exists — or none over nothing.
    if (plantsAddressable > 0) {
      const related = main.slice(main.indexOf('data-knowledge-related="true"'));
      expect(related).toContain(`href="${TOPIC}"`);
    } else {
      expect(main).not.toContain('data-knowledge-related="true"');
    }

    // What stays as it was: the address, the language alternates, the
    // index decision and the structured data (criterion 5).
    expect(html).toMatch(
      /<link rel="canonical" href="[^"]*\/answers\/why-are-tomato-leaves-yellow"/u,
    );
    const alternates = [...html.matchAll(/<link[^>]*rel="alternate"[^>]*>/giu)]
      .map((match) => match[0])
      .filter((tag) => /hreflang=/iu.test(tag));
    for (const locale of ["bg", "ru"] as const) {
      expect(
        alternates.some(
          (tag) =>
            new RegExp(`hreflang="${locale}"`, "iu").test(tag) &&
            tag.includes(`/${locale}${ANSWER}"`),
        ),
        `${locale} alternate`,
      ).toBe(true);
    }
    expect(html).not.toMatch(/<meta name="robots" content="noindex/u);
    const graphs = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu,
      ),
    ].map(
      (match) =>
        (
          JSON.parse(match[1]!) as { "@graph"?: Array<Record<string, unknown>> }
        )["@graph"] ?? [],
    );
    const faqNode = graphs
      .flat()
      .find((node) => node["@type"] === "FAQPage") as
      | {
          mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
        }
      | undefined;
    expect(faqNode, "the answer has no FAQPage node").toBeTruthy();
    expect(faqNode?.mainEntity.map((question) => question.name)).toEqual([
      "Яка деталь найважливіша при жовтінні листя?",
      "Коли жовте листя — не привід для тривоги?",
    ]);
    for (const question of faqNode!.mainEntity) {
      expect(question.acceptedAnswer.text).not.toMatch(/\[\d\]/u);
    }
  });

  test("the guide is help with OverGarden, and says it rests on the product itself", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`${baseURL}${GUIDE}`, {
      headers: { cookie: `${LOCALE_COOKIE}=uk` },
    });
    expect(response.status()).toBe(200);
    const { main, headings } = mainOf(await response.text());

    expect(main).toContain("Довідка OverGarden · Посібник");
    expect(main).toMatch(
      /<a href="#guide-about"[^>]*>Основа й обмеження<\/a>/u,
    );
    expect(headings.slice(-3)).toEqual([
      "guide-evidence",
      "guide-about",
      "guide-related",
    ]);
    const about = main.slice(main.indexOf('data-knowledge-about="true"'));
    expect(about).toContain(
      "Зовнішніх джерел немає: текст описує сам OverGarden.",
    );
    expect(about).toContain(
      "Це довідка про OverGarden, а не садівнича порада.",
    );
    expect(about).not.toContain("Перевірка фахівцем");
    // Other gardeners' plant records beside it — the `plants` topic's — and
    // the rest one document request away, the journals' query view
    // (`public-query-twin.ts`). With none a listing can show, it says so.
    if (plantsAddressable > 0) {
      expect(main).toContain('data-knowledge-evidence="ready"');
      expect(main).toMatch(
        /<a href="\/journals\?topic=plants" data-knowledge-evidence-all="true"[^>]*>Усі записи \(\d+\)/u,
      );
    } else {
      expect(main).toContain('data-knowledge-evidence="empty"');
      expect(main).toContain("Записів садівників тут поки немає");
    }
    const related = main.slice(main.indexOf('data-knowledge-related="true"'));
    expect(related).toContain(`href="${ANSWER}"`);
    expect(related).toContain("Садівництво · Відповідь");
  });

  test("Bulgarian and Russian say the same things in their own words", async ({
    request,
    baseURL,
  }) => {
    const expected = {
      bg: {
        answer: "Защо листата на доматите пожълтяват?",
        subject: "Градинарство · Отговор",
        about: "4 източника и ограничения",
        aboutTitle: "За този текст",
        evidence: "Какво са записали градинари за доматите",
        guide: "Помощ за OverGarden · Ръководство",
        hub: "Градинарство · Отговор",
      },
      ru: {
        answer: "Почему желтеют листья томатов?",
        subject: "Садоводство · Ответ",
        about: "4 источника и ограничения",
        aboutTitle: "Об этом тексте",
        evidence: "Что садоводы записали о томатах",
        guide: "Справка OverGarden · Руководство",
        hub: "Садоводство · Ответ",
      },
    } as const;
    for (const locale of ["bg", "ru"] as const) {
      const words = expected[locale];
      const answer = mainOf(
        await (
          await request.get(`${baseURL}${localized(ANSWER, locale)}`)
        ).text(),
      ).main;
      expect(answer).toContain(`lang="${locale}"`);
      expect(answer).toContain(`>${words.answer}</h1>`);
      expect(answer).toContain(words.subject);
      expect(answer).toContain(`>${words.about}</a>`);
      expect(answer).toContain(`>${words.aboutTitle}</h2>`);
      expect(answer).toContain(`>${words.evidence}</h2>`);
      expect(answer).toContain(`href="#knowledge-source-4"`);
      expect(answer).toContain(`href="/${locale}${GUIDE}"`);

      const guide = mainOf(
        await (
          await request.get(`${baseURL}${localized(GUIDE, locale)}`)
        ).text(),
      ).main;
      expect(guide).toContain(words.guide);

      const hub = mainOf(
        await (
          await request.get(`${baseURL}${localized("/knowledge", locale)}`)
        ).text(),
      ).main;
      expect(hub).toContain(words.hub);
      expect(hub).not.toMatch(/индекс/u);
    }
  });

  test("a topic with gardeners' entries: real counts, the entries once, and a search of its own", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    const address = `/topics/${FIXTURE.topicSlug}`;
    await page.goto(address, { waitUntil: "load" });
    const topic = page.locator('main[data-public-knowledge-topic="true"]');
    await expect(topic.locator("h1")).toHaveText(FIXTURE.topicLabel);
    // What the topic holds and how recently: facts about it, not about
    // whether a crawler admits it (OG-UX-032).
    await expect(topic.locator('[data-slot="page-header"]')).toContainText(
      /2 записи садівників · останній запис \d{1,2} \S+ 2026/u,
    );
    await expect(topic).not.toContainText("індексац");
    await expect(topic).not.toContainText("Перевірена");
    // Each entry once, as a heading under the section, newest first — and
    // neither the count nor "why it is related" said a second time.
    const evidence = topic.locator('[data-knowledge-evidence="ready"]');
    await expect(
      evidence.locator('[data-knowledge-evidence-count="true"]'),
    ).toHaveCount(0);
    await expect(evidence).not.toContainText("Чому це пов'язано");
    await expect(evidence.locator("h2")).toHaveText("Записи садівників");
    await expect(evidence.locator("h3")).toHaveText([
      FIXTURE.entries[1].title,
      FIXTURE.entries[0].title,
    ]);
    await expect(
      page.locator('aside[data-site-shell-region="context"]'),
    ).toHaveCount(0);
    // The rest is the journals' view of the topic, reached as a document.
    const all = evidence.locator('a[data-knowledge-evidence-all="true"]');
    await expect(all).toHaveText("Усі записи (2)");
    await expect(all).toHaveAttribute(
      "href",
      `/journals?topic=${FIXTURE.topicSlug}`,
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "topic-populated-1280.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "topic-populated-uk-1280");

    // Its own search: the journals' search, narrowed to the topic, by
    // keyboard.
    const search = topic.locator('form[data-topic-search="true"]');
    await expect(search.locator("label")).toHaveText(
      `Пошук у записах теми «${FIXTURE.topicLabel}»`,
    );
    const field = search.locator('input[name="q"]');
    await tabToControl(page, field, 200);
    await page.keyboard.type("кільцями");
    await page.keyboard.press("Enter");
    await page.waitForURL(
      new RegExp(`/journals\\?topic=${FIXTURE.topicSlug}&q=`, "u"),
    );
    // The journals stream their listing, so their own `<main>`, not the
    // loading one beside it.
    const journals = page.locator('main[data-public-journal-directory="true"]');
    await expect(journals).toContainText(FIXTURE.entries[1].title);
    await expect(journals).not.toContainText(FIXTURE.entries[0].title);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "topic-search-1280.png"),
    });
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${address}$`, "u"));
    await expect(page.locator("main h1")).toHaveText(FIXTURE.topicLabel);

    // Narrow: the same page, no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(address, { waitUntil: "load" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "topic-populated-390.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "topic-populated-uk-390");
  });

  test("from a topic to an answer, to its source and back", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();

    await page.goto(TOPIC, { waitUntil: "load" });
    const topic = page.locator('main[data-public-knowledge-topic="true"]');
    await expect(topic.locator("h1")).toHaveText("Рослини");
    // Never whether a crawler may index it, and no rail repeating the
    // entries beside the page.
    await expect(topic).not.toContainText("індексац");
    await expect(
      page.locator('aside[data-site-shell-region="context"]'),
    ).toHaveCount(0);
    await expect(
      topic.locator(
        `[data-knowledge-evidence="${plantsAddressable > 0 ? "ready" : "empty"}"]`,
      ),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "topic-1280.png"),
      fullPage: true,
    });
    await scanAccessibility(page, testInfo, "topic-uk-1280");

    // The answers and guides drawing on the topic are its related section.
    const related = topic.locator('[data-knowledge-related="true"]');
    await expect(related).toContainText("Відповіді й посібники на цю тему");
    await related
      .getByRole("link", { name: "Чому жовтіє листя томатів?" })
      .click();
    await page.waitForURL(`**${ANSWER}`);
    const article = page.locator('main[data-public-article="true"]');
    await expect(article.locator("h1")).toHaveText(
      "Чому жовтіє листя томатів?",
    );

    // A citation by keyboard: to the source it names, in this document.
    const citation = article
      .locator("#answer-concise")
      .locator("..")
      .locator('a[data-knowledge-citation="1"]');
    await tabToControl(page, citation, 200);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#knowledge-source-1$/u);
    const source = page.locator("#knowledge-source-1");
    await expect(source).toBeInViewport();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "answer-source-1280.png"),
    });

    // To the source itself, and Back to the same place, then to the topic.
    await source
      .getByRole("link", { name: "Key to Common Problems of Tomatoes" })
      .click();
    await page.waitForURL(SOURCE_ONE);
    await expect(page.locator("h1")).toHaveText(
      "Key to Common Problems of Tomatoes",
    );
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`${ANSWER}#knowledge-source-1$`, "u"),
    );
    await expect(page.locator("#knowledge-source-1")).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${ANSWER}$`, "u"));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${TOPIC}$`, "u"));
    await expect(page.locator("main h1")).toHaveText("Рослини");
  });

  test("the contents list every heading on the page, above and below xl", async ({
    browser,
    baseURL,
  }, testInfo) => {
    for (const width of [1280, 390] as const) {
      const context = await readerContext(browser, baseURL!, {
        viewport: { width, height: width < 768 ? 844 : 900 },
      });
      const page = await context.newPage();
      await page.goto(ANSWER, { waitUntil: "load" });
      const ids = await page
        .locator('main[data-public-article="true"] h2[id]')
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      expect(ids).toHaveLength(plantsAddressable > 0 ? 8 : 7);
      // Above xl the rail is the contents; below it, the foot of the article.
      const contents =
        width >= 1280
          ? page.locator('aside[data-site-shell-region="context"]')
          : page.locator('main [data-site-shell-context="route-owned"]');
      await expect(contents).toBeVisible();
      const targets = await contents
        .locator('a[href^="#"]')
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href")!.slice(1)),
        );
      expect(targets).toEqual(ids);
      // Following one lands on its heading.
      await contents.locator('a[href="#answer-about"]').click();
      await expect(page).toHaveURL(/#answer-about$/u);
      await expect(page.locator("#answer-about")).toBeInViewport();
      await page.screenshot({
        path: path.join(SCREENSHOTS, `answer-${width}.png`),
        fullPage: width < 768,
      });
      await scanAccessibility(page, testInfo, `answer-uk-${width}`);

      await page.goto(GUIDE, { waitUntil: "load" });
      await expect(page.locator("main h1")).toHaveText(
        "Як почати живий запис рослини",
      );
      await scanAccessibility(page, testInfo, `guide-uk-${width}`);
      if (width < 768) {
        await page.screenshot({
          path: path.join(SCREENSHOTS, "guide-390.png"),
          fullPage: true,
        });
      }

      await page.goto("/knowledge", { waitUntil: "load" });
      await expect(page.locator("main h1")).toHaveText("Знання");
      await scanAccessibility(page, testInfo, `hub-uk-${width}`);
      // The rows say what each piece is; no rail repeats them.
      await expect(
        page.locator('aside[data-site-shell-region="context"]'),
      ).toHaveCount(0);
      await page.screenshot({
        path: path.join(SCREENSHOTS, `hub-${width}.png`),
        fullPage: true,
      });
    }

    for (const locale of ["bg", "ru"] as const) {
      const context = await readerContext(browser, baseURL!, { locale });
      const page = await context.newPage();
      await page.goto(localized(ANSWER, locale), { waitUntil: "load" });
      await scanAccessibility(page, testInfo, `answer-${locale}-1280`);
      await page.screenshot({
        path: path.join(SCREENSHOTS, `answer-${locale}-1280.png`),
      });
      await page.goto(localized(TOPIC, locale), { waitUntil: "load" });
      await scanAccessibility(page, testInfo, `topic-${locale}-1280`);
    }
  });

  test("the hub finds an answer by a word inside it", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!);
    const page = await context.newPage();
    await page.goto("/knowledge", { waitUntil: "load" });
    const hub = page.locator('main[data-public-knowledge-hub="true"]');
    await expect(
      hub.locator('[data-knowledge-subject="gardening"]'),
    ).toContainText("Чому жовтіє листя томатів?");
    await expect(hub).toContainText("Садівництво · Відповідь");
    await expect(hub).toContainText("4 джерела");
    await expect(hub).toContainText("Довідка OverGarden · Посібник");
    await expect(hub).not.toContainText("індексац");

    // "азот" is in the answer's causes, not in its title or its lead.
    const field = hub.locator('input[type="search"][name="q"]');
    await field.fill("азот");
    await field.press("Enter");
    await page.waitForURL(/\/knowledge\?q=/u);
    await expect(hub.locator('[data-slot="list-row"]')).toHaveCount(1);
    await expect(hub.locator('[data-slot="list-row"]')).toContainText(
      "Чому жовтіє листя томатів?",
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS, "hub-search-1280.png"),
    });

    // Nothing matched is its own screen, with the way back out.
    await field.fill("кактусові мушки");
    await field.press("Enter");
    await page.waitForURL(/q=%D0%BA%D0%B0%D0%BA/u);
    await expect(
      hub.locator('[data-screen-state="empty-no-results"]'),
    ).toBeVisible();
  });

  test("without JavaScript: the answer and its sources, and the topic's own search", async ({
    browser,
    baseURL,
  }) => {
    const context = await readerContext(browser, baseURL!, {
      javaScriptEnabled: false,
    });
    const page = await context.newPage();

    await page.goto(ANSWER, { waitUntil: "load" });
    await expect(page.locator("main h1")).toHaveText(
      "Чому жовтіє листя томатів?",
    );
    await expect(page.locator("#answer-concise")).toBeVisible();
    await page.locator('a[data-knowledge-citation="3"]').first().click();
    await expect(page).toHaveURL(/#knowledge-source-3$/u);
    await expect(page.locator("#knowledge-source-3")).toBeInViewport();

    // The topic's search is the journals' search, narrowed to the topic: a
    // real form, so it works before any script, and Back returns.
    const address = `/topics/${FIXTURE.topicSlug}`;
    await page.goto(address, { waitUntil: "load" });
    const search = page.locator('form[data-topic-search="true"]');
    await search.locator('input[name="q"]').fill("зливи");
    await search.getByRole("button").click();
    await page.waitForURL(
      new RegExp(`/journals\\?topic=${FIXTURE.topicSlug}&q=`, "u"),
    );
    await expect(
      page.locator('main[data-public-journal-directory="true"]'),
    ).toContainText(FIXTURE.entries[0].title);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${address}$`, "u"));
    await expect(page.locator("main h1")).toHaveText(FIXTURE.topicLabel);
  });
});
