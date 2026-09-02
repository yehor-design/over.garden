import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getAuthoritativeCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  getPlantObjectPage: vi.fn(),
  getObjectProvenancePanel: vi.fn(),
  resolveFollowUpValuePulsePrompt: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  createAuthIntentControlRef: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getAuthoritativeCurrentSession: mocks.getAuthoritativeCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));

vi.mock("@/server/journal-repository", () => ({
  getPlantObjectPage: mocks.getPlantObjectPage,
}));

vi.mock("@/server/lineage-repository", () => ({
  getObjectProvenancePanel: mocks.getObjectProvenancePanel,
}));

vi.mock("@/server/follow-up-value-pulse", () => ({
  resolveFollowUpValuePulsePrompt: mocks.resolveFollowUpValuePulsePrompt,
}));

vi.mock("@/server/analytics-events", () => ({
  recordAnalyticsEventSafely: mocks.recordAnalyticsEventSafely,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/auth-intent-control", () => ({
  createAuthIntentControlRef: mocks.createAuthIntentControlRef,
}));

vi.mock("./catalog-resolve-control", () => ({
  CatalogResolveControl: () => <section>Catalog resolve</section>,
}));

vi.mock("./follow-up-entry-composer", () => ({
  FollowUpEntryComposer: (props: {
    objectKind: string;
    requiresFirstPublicationDisclosure: boolean;
  }) => (
    <form
      data-object-kind={props.objectKind}
      data-requires-first-publication-disclosure={String(
        props.requiresFirstPublicationDisclosure,
      )}
    >
      Follow-up composer
    </form>
  ),
}));

vi.mock("./follow-up-value-pulse", () => ({
  FollowUpValuePulse: () => <section>Follow-up pulse</section>,
}));

vi.mock("./location-privacy-control", () => ({
  LocationPrivacyControl: () => <section>Location privacy</section>,
}));

vi.mock("./object-progress-moment", () => ({
  ObjectProgressMoment: () => <section>Private progress timeline</section>,
}));

describe("/garden/objects/[objectId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "gardener@example.com",
      },
    });
    mocks.getAuthoritativeCurrentSession.mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "gardener@example.com",
      },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.scopedToUser.mockImplementation(
      (userId: string, sessionId: string | null) => ({ userId, sessionId }),
    );
    mocks.getObjectProvenancePanel.mockResolvedValue({
      sourceObjectOptions: [],
      edges: [],
    });
    mocks.resolveFollowUpValuePulsePrompt.mockResolvedValue({
      eligible: false,
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.createAuthIntentControlRef.mockImplementation(
      (_namespace: string, source: string) => `publish-ref-${source}`,
    );
  });

  it("preserves manual catalog resolution without rendering external photo identification", async () => {
    const page = plantObjectPage([]);
    page.plantObject.variety_state = "unknown";
    mocks.getPlantObjectPage.mockResolvedValue(page);
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Catalog resolve");
    expect(html).toContain("Follow-up composer");
    expect(html).not.toContain("passport-photo-identification");
  });

  it("keeps Ukrainian chrome on deep object readback without translating user content", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([
        {
          id: "entry-1",
          title: "First flowers",
          body: "Two new flower clusters.",
          entryDate: "2026-07-04",
        },
      ]),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('lang="uk"');
    expect(html).toContain("До моєї градини");
    expect(html).toContain("Cherry tomato");
    expect(html).toContain("First flowers");
    expect(html).not.toContain("Перші квіти");
  });

  it("renders the first-save progress moment inside the object readback path", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([
        {
          id: "entry-1",
          title: "First flowers",
          body: "Two new flower clusters.",
          entryDate: "2026-07-04",
        },
      ]),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({ saveProgress: "first-entry" }),
      }),
    );

    expect(html).toContain("Історію вашого саду розпочато");
    expect(html).toContain("Cherry tomato тепер має першу датовану нотатку");
    expect(html).toContain("1 / 4 початкових нотаток");
    expect(html).toContain("#follow-up-composer");
    expect(html).toContain("Повна історія об&#x27;єкта");
    expect(html).toContain("First flowers");
    expect(html).not.toMatch(/leaderboard|streak|likes|followers|share modal/i);
  });

  it("renders the follow-up progress moment without hiding the timeline or composer", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([
        {
          id: "entry-2",
          title: "Second flowering wave",
          body: "The same plant has stronger new leaves.",
          entryDate: "2026-07-05",
        },
        {
          id: "entry-1",
          title: "First flowers",
          body: "Two new flower clusters.",
          entryDate: "2026-07-04",
        },
      ]),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({ saveProgress: "follow-up" }),
      }),
    );

    expect(html).toContain("Цей запис стає кориснішим");
    expect(html).toContain("Cherry tomato тепер має 2 датовані нотатки");
    expect(html).toContain("Додати ще один запис");
    expect(html).toContain("Follow-up composer");
    expect(html).toContain("Повна історія об&#x27;єкта");
    expect(html).toContain("Second flowering wave");
    expect(html).toContain("First flowers");
    expect(html).not.toMatch(/leaderboard|streak|likes|followers|share modal/i);
  });

  it.each([
    [
      "uk",
      "Публічна сторінка доступна",
      "/journal/first-public-flowers",
      "/lineage/objects/object-1",
    ],
    [
      "bg",
      "Публичната страница е достъпна",
      "/bg/journal/first-public-flowers",
      "/bg/lineage/objects/object-1",
    ],
    [
      "ru",
      "Публичная страница доступна",
      "/ru/journal/first-public-flowers",
      "/ru/lineage/objects/object-1",
    ],
  ] as const)(
    "localizes owner actions in %s while preserving journal content and locale-aware public links",
    async (locale, publicAvailable, journalPath, passportPath) => {
      mocks.getRequestInterfaceLocale.mockResolvedValueOnce(locale);
      mocks.getPlantObjectPage.mockResolvedValue(
        plantObjectPage([
          {
            id: "entry-1",
            title: "First public flowers",
            body: "Two new flower clusters with the public-safe story.",
            entryDate: "2026-07-04",
            visibility: "public",
            publicSlug: "first-public-flowers",
          },
        ]),
      );
      const { default: PlantObjectReadbackPage } = await import("./page");

      const html = renderToStaticMarkup(
        await PlantObjectReadbackPage({
          params: Promise.resolve({ objectId: "object-1" }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(publicAvailable);
      expect(html).toContain(journalPath);
      expect(html).toContain(passportPath);
      expect(html).toContain("First public flowers");
      expect(html).toContain(
        "Two new flower clusters with the public-safe story.",
      );
      expect(html).not.toMatch(/Public page available|Open public page/i);
      expect(html).not.toMatch(
        /owner_user_id|client_mutation_id|quarantine|latitude|longitude/i,
      );
    },
  );

  it.each([
    [
      "uk",
      "Походження",
      "Походить від Maria&#x27;s saved seeds · Пакет насіння",
      "Джерело: EU Official Journal / EUR-Lex Common Catalogue. Нормалізовано OverGarden.",
      "Відкрити джерело",
    ],
    [
      "bg",
      "Произход",
      "Произхожда от Maria&#x27;s saved seeds · Пакет семена",
      "Източник: EU Official Journal / EUR-Lex Common Catalogue. Нормализирано от OverGarden.",
      "Отваряне на източника",
    ],
    [
      "ru",
      "Происхождение",
      "Происходит от Maria&#x27;s saved seeds · Пакет семян",
      "Источник: EU Official Journal / EUR-Lex Common Catalogue. Нормализовано OverGarden.",
      "Открыть источник",
    ],
  ] as const)(
    "localizes provenance and source attribution in %s without translating source values",
    async (locale, title, edgeLabel, sourceSummary, openSource) => {
      mocks.getRequestInterfaceLocale.mockResolvedValueOnce(locale);
      mocks.getObjectProvenancePanel.mockResolvedValueOnce({
        sourceObjectOptions: [],
        edges: [
          {
            id: "edge-1",
            sourceKind: "source_reference",
            consentState: "confirmed",
            visibilityPolicy: "owner_only_until_confirmed",
            erasureState: "active",
            sourceObject: null,
            pendingIdentity: null,
            sourceReferenceKind: "seed_packet",
            sourceReferenceLabel: "Maria's saved seeds",
            sourcePersonMention: null,
            createdAt: "2026-07-04T12:00:00.000Z",
          },
        ],
      });
      mocks.getPlantObjectPage.mockResolvedValue(
        plantObjectPage([], false, {
          sourceCredit: {
            sourceSlug: "eu_oj_eur_lex_common_catalogue",
            sourceName: "EU Official Journal / EUR-Lex Common Catalogue",
            sourceUrl: "https://eur-lex.europa.eu/",
            attributionText:
              "European Union, Official Journal of the European Union / EUR-Lex, Common Catalogue.",
          },
        }),
      );
      const { default: PlantObjectReadbackPage } = await import("./page");

      const html = renderToStaticMarkup(
        await PlantObjectReadbackPage({
          params: Promise.resolve({ objectId: "object-1" }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain(title);
      expect(html).toContain(edgeLabel);
      expect(html).toContain(sourceSummary);
      expect(html).toContain(openSource);
      expect(html).toContain("EU Plant Variety Portal");
      expect(html).toContain("Official Journal of the European Union");
      expect(html).not.toMatch(
        />Provenance<|>Record private source<|>Open source</,
      );
      expect(html).not.toMatch(/owner_user_id|latitude|longitude|quarantine/i);
    },
  );

  it("renders the current structured person mention without rewriting a stored label", async () => {
    mocks.getObjectProvenancePanel.mockResolvedValueOnce({
      sourceObjectOptions: [],
      edges: [
        {
          id: "edge-person-1",
          sourceKind: "source_reference",
          consentState: "confirmed",
          visibilityPolicy: "owner_only_until_confirmed",
          erasureState: "active",
          sourceObject: null,
          pendingIdentity: null,
          sourceReferenceKind: "person",
          sourceReferenceLabel: null,
          sourcePersonMention: "@renamed_gardener",
          createdAt: "2026-07-04T12:00:00.000Z",
        },
      ],
    });
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("@renamed_gardener");
    expect(html).not.toContain("handle previous_gardener");
    expect(html).not.toMatch(/source_owner_user_id|owner_user_id|email/i);
  });

  it("fails a person reference closed to the generic private source when no safe current identity resolves", async () => {
    mocks.getObjectProvenancePanel.mockResolvedValueOnce({
      sourceObjectOptions: [],
      edges: [
        {
          id: "edge-person-private",
          sourceKind: "source_reference",
          consentState: "confirmed",
          visibilityPolicy: "owner_only_until_confirmed",
          erasureState: "active",
          sourceObject: null,
          pendingIdentity: null,
          sourceReferenceKind: "person",
          sourceReferenceLabel: null,
          sourcePersonMention: null,
          createdAt: "2026-07-04T12:00:00.000Z",
        },
      ],
    });
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("приватне джерело");
    expect(html).not.toMatch(/@renamed_gardener|source_owner_user_id|email/i);
  });

  // OVE-353 / AC-03: the owner control is an irreversible delete in every
  // market. It must state the seven-day technical window, require an explicit
  // acknowledgement, and offer no archive or restore affordance anywhere.
  it.each([
    ["uk", "Видалити запис назавжди"],
    ["bg", "Изтриване на записа окончателно"],
    ["ru", "Удалить запись навсегда"],
  ] as const)(
    "localizes the irreversible delete control in %s",
    async (locale, deleteLabel) => {
      mocks.getRequestInterfaceLocale.mockResolvedValueOnce(locale);
      mocks.getPlantObjectPage.mockResolvedValue(
        plantObjectPage([
          {
            id: "entry-active",
            title: "Winter pruning note",
            body: "Owner-visible active history.",
            entryDate: "2026-07-04",
            visibility: "public",
            publicSlug: "winter-pruning-note",
            lifecycleState: "active",
          },
        ]),
      );
      const { default: PlantObjectReadbackPage } = await import("./page");

      const html = renderToStaticMarkup(
        await PlantObjectReadbackPage({
          params: Promise.resolve({ objectId: "object-1" }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain(deleteLabel);
      expect(html).toContain('name="deleteAccepted"');
      expect(html).toContain("7");
      // Active history stays readable; deletion is the only way it leaves.
      expect(html).toContain("Winter pruning note");
      expect(html).toContain("Owner-visible active history.");
      expect(html).not.toContain('data-owner-entry-controls="archived"');
    },
  );

  it("keeps both WAIT-01 controls enabled alongside the delete form", async () => {
    // WAIT-01: the owner must stay able to leave while a delete is in flight.
    // Both named controls are plain links rendered outside the form, so a
    // pending submission cannot disable them and no overlay covers them.
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([
        {
          id: "entry-active",
          title: "Winter pruning note",
          body: "Owner-visible active history.",
          entryDate: "2026-07-04",
          visibility: "public",
          publicSlug: "winter-pruning-note",
          lifecycleState: "active",
        },
      ]),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    // "return to active journal link" and "object navigation link".
    expect(html).toContain('href="/garden"');
    expect(html).toContain('href="/journal/winter-pruning-note"');
    expect(html).toContain('name="deleteAccepted"');
    // No blocking alert, global wait overlay, or pointer trap around them.
    expect(html).not.toMatch(/aria-modal|role="alertdialog"|\binert\b/);
    expect(html).not.toContain("<a disabled");
  });

  it("does not resurrect a publish action for compatibility private rows", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([
        {
          id: "entry-2",
          title: "Second private note",
          body: "Private follow-up body.",
          entryDate: "2026-07-05",
        },
        {
          id: "entry-1",
          title: "First private note",
          body: "Private first body.",
          entryDate: "2026-07-04",
        },
      ]),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({
          authIntent: "publish",
          authControl: "publish-ref-entry-2",
        }),
      }),
    );

    expect(html).toContain("Second private note");
    expect(html).toContain("First private note");
    expect(html).not.toContain('data-auth-intent-control="publish"');
    expect(html).not.toContain("entry-publish-");
  });

  it("keeps first-publication disclosure on atomic composition only", async () => {
    mocks.getPlantObjectPage.mockResolvedValueOnce(
      plantObjectPage(
        [
          {
            id: "entry-private",
            title: "Later private note",
            body: "Ready for another explicit publication.",
            entryDate: "2026-07-12",
          },
        ],
        true,
      ),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain(
      'data-requires-first-publication-disclosure="false"',
    );
    expect(html).not.toContain('name="publicationDisclosureAccepted"');
    expect(html).not.toContain('data-auth-intent-control="publish"');
  });
});

function plantObjectPage(
  entries: Array<{
    id: string;
    title: string;
    body: string;
    entryDate: string;
    visibility?: "private" | "public";
    publicSlug?: string | null;
    lifecycleState?: "active" | "deleted_retention";
    publicGoneAt?: string | null;
  }>,
  hasPriorPublicationDisclosure = false,
  options: {
    sourceCredit?: {
      sourceSlug: string;
      sourceName: string;
      sourceUrl: string;
      attributionText: string | null;
    } | null;
  } = {},
) {
  return {
    space: {
      id: "space-1",
      display_name: "Balcony",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    plantObject: {
      id: "object-1",
      display_name: "Cherry tomato",
      object_kind: "plant",
      catalog_kind: "plant_variety",
      catalog_item_id: null,
      catalog_canonical_name: null,
      catalog_public_slug: null,
      variety_text: "Cherry tomato",
      variety_state: "selected",
      location_visibility: "hidden",
      coarse_region_code: null,
      source_credit: options.sourceCredit ?? null,
    },
    hasPriorPublicationDisclosure,
    entries: entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      entry_date: entry.entryDate,
      entry_scope: "object",
      visibility: entry.visibility ?? "private",
      lifecycle_state: entry.lifecycleState ?? "active",
      public_slug: entry.publicSlug ?? null,
      public_gone_at: entry.publicGoneAt ?? null,
      timelineRelation: "direct_object",
      mentionedObjects: [],
      media: null,
    })),
    gallery_media: [],
  };
}
