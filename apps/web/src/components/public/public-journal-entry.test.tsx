import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import type { PublicJournalEntryPage } from "@/server/journal-repository";
import { PublicJournalEntryView } from "./public-journal-entry";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // Production uses next/image; SSR assertions only inspect safe output.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
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
    publicSlug: "pershyi-urozhai",
    publicPath: "/journal/pershyi-urozhai",
    publicNoindex: true,
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
      objectKind: "plant",
      catalogKind: "plant_variety",
      catalogCanonicalName: "Помідор чері",
      catalogPublicSlug: "pomidor-cheri",
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
    },
    {
      id: "media-2",
      publicUrl: "https://media.example/portrait.webp",
      altText: null,
      caption: null,
    },
  ],
};

describe("public journal entry V2", () => {
  it("renders an object-first chapter with gallery, chronology and owner-only control", () => {
    const html = renderToStaticMarkup(
      <PublicJournalEntryView
        locale="uk"
        copy={getPublicJournalEntryCopy("uk")}
        page={objectPage}
        directoryReturnTo="/journals?kind=plant"
        ownerControl={{
          entryId: "entry-1",
          managePath: "/garden/objects/object-1#passport-entry-entry-1",
        }}
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
    expect(html).toContain('data-journal-media-count="2"');
    expect(html).toContain('alt="Стиглі томати на кущі"');
    expect(html).toContain("Перша китиця");
    expect(html).toContain('href="/topics/harvest"');
    expect(html).toContain('href="/journal/pered-tsvitinniam"');
    expect(html).toContain('data-journal-chronology="true"');
    expect(html).toContain("max-w-full");
    expect(html).toContain("min-w-0 items-center");
    expect(html).toContain(
      'href="/garden/objects/object-1#passport-entry-entry-1"',
    );
    expect(html).toContain('data-testid="registered-context-rail"');
    expect(html).toContain('data-testid="mobile-context-rail"');
    expect(html).not.toMatch(
      /ownerUserId|owner_user_id|derivativeKey|quarantine|coordinates|latitude|longitude/i,
    );
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
