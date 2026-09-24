import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import type { PublicJournalEntryPage } from "@/server/journal-repository";
import {
  OwnerEntryControlLink,
  PublicJournalEntryView,
} from "./public-journal-entry";

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    className,
    ...rest
  }: {
    alt: string;
    src: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    // Production uses next/image; SSR assertions only inspect safe output.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      src={typeof src === "string" ? src : ""}
      className={className}
      data-media-presentation={
        typeof rest["data-media-presentation"] === "string"
          ? rest["data-media-presentation"]
          : undefined
      }
      data-media-object-position={
        typeof rest["data-media-object-position"] === "string"
          ? rest["data-media-object-position"]
          : undefined
      }
    />
  ),
}));

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: ({
    modules,
  }: {
    modules: Array<{ key: string; title: string }>;
  }) => (
    <aside data-testid="registered-context-rail">
      {modules.map((module) => (
        <h2 key={module.key}>{module.title}</h2>
      ))}
    </aside>
  ),
  SiteShellContextRailModules: ({
    modules,
  }: {
    modules: Array<{ key: string; title: string }>;
  }) => (
    <aside data-testid="mobile-context-rail">
      {modules.map((module) => (
        <h2 key={module.key}>{module.title}</h2>
      ))}
    </aside>
  ),
}));

const objectPage: PublicJournalEntryPage = {
  entry: {
    id: "entry-1",
    title: "Перший урожай після спеки",
    body: "Перший абзац про стан рослини.\n\nДругий абзац про полив і врожай. Історична згадка: @previous_gardener.",
    contentDocument: null,
    contentSchemaVersion: null,
    entryDate: "2026-07-10",
    createdAt: "2026-07-10T09:00:00.000Z",
    entryScope: "object",
    sourceLanguage: "uk",
    publicSlug: "pershyi-urozhai",
    entryNumber: 7,
    publicPath: "/@gardener/post/7",
    publishedAt: "2026-07-10T10:00:00.000Z",
  },
  context: {
    kind: "object",
    space: {
      displayName: "Теплиця",
      locationVisibility: "region",
      coarseRegionCode: "UA-30",
    },
    object: {
      plantObjectId: "object-1",
      displayName: "Черрі",
      catalogItemId: "00000000-0000-4000-8000-0000000000c1",
      objectKind: "plant",
      catalogKind: "plant_variety",
      catalogCanonicalName: "Помідор чері",
      catalogPublicSlug: "pomidor-cheri",
      catalogSpeciesSlug: null,
      publicPath: "/lineage/objects/object-1",
      varietyText: "Помідор чері",
      varietyState: "selected",
      locationVisibility: "region",
      coarseRegionCode: "UA-30",
    },
  },
  author: {
    handle: "olena",
    mention: "@olena",
    displayName: "Олена",
    avatarUrl: null,
    profilePath: "/@olena",
  },
  mentionedProfiles: [
    {
      handle: "renamed_gardener",
      mention: "@renamed_gardener",
      displayName: "Садівник",
      profilePath: "/@renamed_gardener",
    },
  ],
  topics: [{ slug: "harvest", label: "Врожай", publicPath: "/topics/harvest" }],
  relatedEntries: [
    {
      id: "entry-0",
      title: "Перед цвітінням",
      bodyPreview: "Стабільний ріст після підживлення.",
      entryDate: "2026-07-03",
      publicSlug: "pered-tsvitinniam",
      publicPath: "/journal/pered-tsvitinniam",
    },
  ],
  adjacentEntries: {
    newer: null,
    older: {
      id: "entry-0",
      title: "Перед цвітінням",
      bodyPreview: "Стабільний ріст після підживлення.",
      entryDate: "2026-07-03",
      publicSlug: "pered-tsvitinniam",
      publicPath: "/journal/pered-tsvitinniam",
    },
  },
  media: [
    {
      id: "media-1",
      publicUrl: "https://media.example/landscape.webp",
      altText: "Стиглі томати на кущі",
      caption: "Перша китиця",
      focalX: 0.5,
      focalY: 0.5,
      intrinsicWidth: 1200,
      intrinsicHeight: 900,
      placeholderDataUri: null,
      variantLongEdges: [],
    },
    {
      id: "media-2",
      publicUrl: "https://media.example/portrait.webp",
      altText: null,
      caption: null,
      focalX: 0.25,
      focalY: 0.75,
      intrinsicWidth: 800,
      intrinsicHeight: 1200,
      placeholderDataUri: null,
      variantLongEdges: [],
    },
  ],
};

/**
 * The same entry, written in the composer: its photographs are blocks of the
 * document rather than a list beside it (ADR-0028). `media-1` is the cover.
 */
const COVER_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

const composerPage: PublicJournalEntryPage = {
  ...objectPage,
  entry: {
    ...objectPage.entry,
    contentSchemaVersion: 1,
    contentDocument: {
      schemaVersion: 1,
      blocks: [
        {
          id: "b1",
          type: "image",
          mediaAssetId: COVER_ID,
          caption: "Перша китиця",
        },
        { id: "b2", type: "paragraph", spans: [{ text: "Полив увечері." }] },
        { id: "b3", type: "image", mediaAssetId: SECOND_ID },
      ],
    },
  },
  media: [
    { ...objectPage.media[0]!, id: COVER_ID },
    { ...objectPage.media[1]!, id: SECOND_ID },
  ],
};

/** Every `<img>` whose `src` is this file, however it was rendered. */
function timesShown(html: string, file: string) {
  return [...html.matchAll(/<img\b[^>]*>/giu)].filter((match) =>
    match[0].includes(file),
  ).length;
}

describe("an entry whose photographs are in its document (OVE-471)", () => {
  it("shows each photograph once, where the gardener put it", () => {
    const html = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={composerPage}
        directoryReturnTo="/journals"
      />,
    );

    // The defect this test exists for: the page drew `media[0]` as a cover and
    // the renderer drew the same block under it, so a reader met the entry's
    // lead photograph twice, one directly below the other — seen on production
    // on 2026-09-20. The gallery at the foot repeated the rest.
    // The document itself renders, rather than falling back to the plain body:
    // without this the counts below would be 1 for the wrong reason.
    expect(html).toContain('data-journal-document="v1"');
    expect(html).toContain("Полив увечері.");

    expect(timesShown(html, "landscape.webp")).toBe(1);
    expect(timesShown(html, "portrait.webp")).toBe(1);
    expect(html).not.toContain('data-journal-cover="true"');
    expect(html).not.toContain("data-journal-media-count");
    // It is the document that shows them, at the photograph's own ratio.
    expect(html.match(/data-block-type="image"/gu)).toHaveLength(2);
    expect(html).not.toContain("aspect-cover");
  });

  it("asks for the lead photograph at once, and leaves the rest to the browser", () => {
    const html = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={composerPage}
        directoryReturnTo="/journals"
      />,
    );

    // Whatever draws the page's first photograph carries the priority the
    // cover used to (DESIGN.md §9) — otherwise removing the cover would cost
    // the page its LCP element.
    const images = [...html.matchAll(/<img\b[^>]*>/giu)].map((m) => m[0]);
    const lead = images.find((tag) => tag.includes("landscape.webp"));
    const second = images.find((tag) => tag.includes("portrait.webp"));
    expect(lead).toMatch(/loading="eager"/u);
    expect(lead).toMatch(/fetchPriority="high"/iu);
    expect(second).toMatch(/loading="lazy"/u);
    expect(second).not.toMatch(/fetchPriority=/iu);
    // React hoists the preload for an eager, high-priority image, so the
    // photograph is asked for from `<head>` rather than when the parser
    // reaches it.
    expect(html).toMatch(/<link rel="preload" as="image"[^>]*landscape\.webp/u);
  });

  it("keeps a separate cover, which no block of the document shows", () => {
    // A cover uploaded on its own (`cover_only`) is not in the story, so the
    // page is the only thing that can show it — and it keeps the 16:9 hero.
    const html = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={{
          ...composerPage,
          entry: {
            ...composerPage.entry,
            contentDocument: {
              schemaVersion: 1,
              blocks: [{ id: "b3", type: "image", mediaAssetId: "media-2" }],
            },
          },
        }}
        directoryReturnTo="/journals"
      />,
    );

    expect(html).toContain('data-journal-cover="true"');
    expect(timesShown(html, "landscape.webp")).toBe(1);
    expect(timesShown(html, "portrait.webp")).toBe(1);
  });
});

describe("public journal entry V2", () => {
  it("renders an object-first chapter with gallery, chronology and owner-only control", () => {
    const html = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={objectPage}
        directoryReturnTo="/journals?kind=plant"
        ownerControl={
          <OwnerEntryControlLink
            managePath="/garden/objects/object-1#passport-entry-entry-1"
            label={getPublicJournalEntryCopy("uk").manageEntry}
          />
        }
      />,
    );

    expect(html).toContain('data-public-journal-entry="true"');
    expect(html).toContain('data-entry-context="object"');
    expect(html).toContain('href="/journals?kind=plant"');
    expect(html).toContain('href="/lineage/objects/object-1"');
    expect(html).toContain('href="/@olena"');
    expect(html).toContain("Помідор чері");
    expect(html).toContain("Перший абзац про стан рослини.");
    expect(html).toContain("Другий абзац про полив і врожай.");
    expect(html).toContain("@previous_gardener");
    expect(html).toContain('data-dynamic-person-mentions="stable-user-id"');
    expect(html).toContain('href="/@renamed_gardener"');
    expect(html).toContain("@renamed_gardener");
    expect(html).toContain("Згадані садівники");

    // Criterion 2: exactly one `h1`, and it is the entry's title. A level-1
    // heading inside the document renders as `h2` (ADR-0028).
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Перший урожай після спеки<\/h1>/u);

    // Criterion 3: the landscape cover reserves a 16:9 box and keeps its
    // srcset. The rest stand at their own shape (`OVE-493`): the portrait in
    // this fixture is 800 × 1200, and a 4:3 crop kept a strip of it.
    expect(html).toContain('data-journal-cover="true"');
    expect(html).toContain('data-media-aspect="cover"');
    expect(html).toContain("aspect-cover");
    expect(html).toMatch(
      /data-media-aspect="auto"[\s\S]*?width="800" height="1200"/u,
    );
    expect(html).not.toContain("aspect-card");
    expect(html).not.toContain("/_next/image");
    expect(html).toContain('data-journal-media-count="2"');
    // The caption is the `alt` (OVE-432): one sentence describes the photo,
    // wherever it is read from. The second photo has none, so it falls back to
    // the entry's title — never to a number, which is what it used to be.
    expect(html).toContain('alt="Перша китиця"');
    expect(html).toContain('alt="Перший урожай після спеки"');
    expect(html).not.toContain('alt="Перший урожай після спеки, 1"');
    expect(html).not.toContain('alt="Перший урожай після спеки 2"');
    expect(html).toContain("<figcaption");

    // Criterion 6: the entry says what it is about, and each of them is a
    // link that was already in the entity graph.
    expect(html).toContain('id="journal-entry-about"');
    expect(html).toContain('href="/topics/harvest"');
    expect(html).toContain('href="/journal/pered-tsvitinniam"');
    expect(html).toContain('data-journal-chronology="true"');
    expect(html).toContain(
      'href="/garden/objects/object-1#passport-entry-entry-1"',
    );

    // Criterion 8: the rail is registered for the shell and **not** drawn a
    // second time inside the column. Everything in it is reachable from the
    // "what this is about" block or the related strip.
    expect(html).toContain('data-testid="registered-context-rail"');
    expect(html).not.toContain('data-testid="mobile-context-rail"');

    expect(html).not.toMatch(
      /ownerUserId|owner_user_id|derivativeKey|quarantine|coordinates|latitude|longitude/i,
    );
  });

  it("marks a species' canonical name as Latin, and a cultivar's not at all", () => {
    if (objectPage.context.kind !== "object") {
      throw new Error("the fixture is an object-context entry");
    }
    const objectContext = objectPage.context;
    // DESIGN.md §6: a species' canonical name is Latin and says so; a variety's
    // or a breed's is a cultivar name in somebody's language.
    const withSpecies = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={{
          ...objectPage,
          context: {
            kind: "object",
            space: objectPage.context.space,
            object: {
              ...objectContext.object,
              catalogKind: "species",
              catalogCanonicalName: "Solanum lycopersicum",
            },
          },
        }}
        directoryReturnTo="/journals"
        ownerControl={null}
      />,
    );
    expect(withSpecies).toContain('lang="la"');
    expect(withSpecies).toContain("Solanum lycopersicum");

    const withVariety = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={{
          ...objectPage,
          context: {
            kind: "object",
            space: objectPage.context.space,
            object: {
              ...objectContext.object,
              catalogKind: "plant_variety",
              catalogCanonicalName: "Черрі Іванівський",
            },
          },
        }}
        directoryReturnTo="/journals"
        ownerControl={null}
      />,
    );
    expect(withVariety).toContain("Черрі Іванівський");
    expect(withVariety).not.toContain('lang="la"');
  });

  it("renders a space chapter and only independently public mentioned objects", () => {
    const page: PublicJournalEntryPage = {
      ...objectPage,
      entry: {
        ...objectPage.entry,
        entryScope: "space",
        title: "Ранковий обхід двору",
      },
      context: {
        kind: "space",
        space: {
          displayName: "Подвір'я",
          locationVisibility: "hidden",
          coarseRegionCode: null,
        },
        mentionedObjects: [
          {
            plantObjectId: "animal-1",
            displayName: "Марта",
            objectKind: "animal",
            catalogCanonicalName: "Domestic Shorthair",
            catalogPublicSlug: "domestic-shorthair",
            catalogSpeciesSlug: null,
            publicPath: "/lineage/objects/animal-1",
            varietyText: null,
            varietyState: "selected",
          },
        ],
      },
      media: [],
      topics: [],
    };
    const html = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="bg"
        copy={getPublicJournalEntryCopy("bg")}
        page={page}
        directoryReturnTo="/bg/journals"
        ownerControl={null}
      />,
    );

    expect(html).toContain('data-entry-context="space"');
    expect(html).toContain("Ранковий обхід двору");
    expect(html).toContain("Подвір&#x27;я");
    expect(html).toContain('href="/lineage/objects/animal-1"');
    expect(html).toContain("Марта");
    expect(html).toContain("Местоположението е скрито");
    expect(html).not.toContain("Управление на записа");
    expect(html).not.toContain("<img");
  });
});

describe("the entry reads as the card did (OVE-493)", () => {
  function renderEntry(
    page: PublicJournalEntryPage,
    locale: "uk" | "bg" | "ru" = "uk",
  ) {
    return renderToStaticMarkup(
      <PublicJournalEntryView
        locale={locale}
        copy={getPublicJournalEntryCopy(locale)}
        page={page}
        directoryReturnTo="/journals"
      />,
    );
  }

  it("leads with who and when, then where it belongs, then the title", () => {
    const html = renderEntry(objectPage);
    const at = (needle: string) => html.indexOf(needle);
    expect(at('data-entry-byline="true"')).toBeGreaterThan(-1);
    expect(at('data-entry-byline="true"')).toBeLessThan(
      at('data-entry-context="true"'),
    );
    expect(at('data-entry-context="true"')).toBeLessThan(at("<h1"));
    // The byline names the author for a screen reader and hides the
    // avatar's initials, which would read the author twice.
    expect(html).toMatch(
      /<span aria-hidden="true" class="contents"><span data-slot="avatar"/u,
    );
    // "Автор", the name and the handle, as the link's name: a visually
    // hidden prefix lost its space in Chromium and Orca read one word.
    expect(html).toContain('aria-label="Автор Олена @olena"');
    expect(html).not.toContain('<span class="sr-only">Автор');
    // The kind in words beside the object.
    expect(html).toMatch(/data-entry-context="true"[\s\S]*?Рослина/u);
  });

  it("dates the entry by its observation and names a later publication", () => {
    const sameDay = renderEntry(objectPage);
    expect(sameDay).not.toContain('data-entry-published="true"');

    const backdated = renderEntry({
      ...objectPage,
      entry: { ...objectPage.entry, publishedAt: "2026-09-12T18:40:00.000Z" },
    });
    expect(backdated).toContain('<time dateTime="2026-07-10"');
    expect(backdated).toMatch(
      /data-entry-published="true"[^>]*>Опубліковано 12 вер\. 2026 р\.<\/time>/u,
    );
  });

  // OG-UX-030: the page speaks the reader's language; the gardener's words
  // carry theirs.
  it("marks the gardener's words with their language and nothing else", () => {
    const html = renderEntry(
      {
        ...objectPage,
        entry: { ...objectPage.entry, sourceLanguage: "bg" },
      },
      "uk",
    );
    expect(html).toContain('<main lang="uk"');
    expect(html).toMatch(/<h1[^>]*lang="bg"[^>]*>Перший урожай/u);
    expect(html).toMatch(/data-journal-prose="true"[^>]*lang="bg"/u);
    const byline = html.slice(
      html.indexOf('data-entry-byline="true"'),
      html.indexOf('data-entry-context="true"'),
    );
    expect(byline).not.toContain('lang="bg"');
    // Same language, no redundant attribute.
    expect(renderEntry(objectPage)).not.toContain('lang="bg"');
  });

  // OG-UX-018: the previous entry is not listed a second time below it.
  it("gathers the rest of the journal in one section, each entry once", () => {
    const html = renderEntry({
      ...objectPage,
      relatedEntries: [
        ...objectPage.relatedEntries,
        {
          id: "entry-x",
          title: "Пересадка",
          bodyPreview: "У більший горщик.",
          entryDate: "2026-06-20",
          publicSlug: "peresadka",
          publicPath: "/@olena/post/3",
        },
      ],
    });
    expect(html.match(/data-related-history="true"/gu)).toHaveLength(1);
    expect(html.match(/href="\/journal\/pered-tsvitinniam"/gu)).toHaveLength(1);
    expect(html).toContain('data-journal-chronology="true"');
    expect(html).toContain('data-related-entries="true"');
    expect(html).toContain('href="/@olena/post/3"');
  });
});
