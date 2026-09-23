import { renderServerHtml } from "@test/render-server-html";
import { missingRelationRejection } from "@test/postgres-rejection";
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

// The owner's public links hang from the registry handle (ADR-0029 D9); a
// fixture without one keeps the legacy addresses these cases pin.
vi.mock("@/server/author-handle-repository", () => ({
  getPublicAuthorHandle: vi.fn().mockResolvedValue(null),
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

vi.mock("@/components/garden/entry-composer", () => ({
  EntryComposer: (props: {
    initialDestination: { kind: string; objectKind?: string } | null;
    requiresFirstPublicationDisclosure: boolean;
  }) => (
    <form
      data-object-kind={props.initialDestination?.objectKind}
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

const OBJECT_ID = "10000000-0000-4000-8000-000000000001";

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

  // OVE-491 (OG-UX-007): the history is the page; settings and provenance
  // are pages of their own, reached from the object's sections.
  it("keeps the rare settings off the history page and links its three pages", async () => {
    const page = plantObjectPage([]);
    page.plantObject.variety_state = "unknown";
    mocks.getPlantObjectPage.mockResolvedValue(page);
    mocks.getObjectProvenancePanel.mockResolvedValueOnce({
      sourceObjectOptions: [],
      edges: [provenanceEdge()],
    });
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Follow-up composer");
    expect(html).not.toContain("Catalog resolve");
    expect(html).not.toContain("Location privacy");
    expect(html).not.toContain('id="passport-management"');
    expect(html).not.toContain('id="passport-provenance"');
    expect(html).not.toContain("passport-photo-identification");
    expect(html).toMatch(
      new RegExp(
        `aria-current="page" data-object-section="history"[^>]*href="/garden/objects/${OBJECT_ID}"`,
        "u",
      ),
    );
    expect(html).toContain(`href="/garden/objects/${OBJECT_ID}/settings"`);
    expect(html).toContain(`href="/garden/objects/${OBJECT_ID}/provenance"`);
    // The provenance count rides on its section link, not a block here.
    expect(html).toMatch(
      /data-object-section="provenance"[^>]*>Походження<span[^>]*>1<\/span>/u,
    );
    // One page heading: the shell's. The object's name is the next one.
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toMatch(/<h2[^>]*>Cherry tomato<\/h2>/u);
  });

  // OVE-491 criterion 2: the specimen's public page, the organism's
  // catalogue card and the garden are three different things, each named.
  it("names the public passport and the catalogue apart from the garden breadcrumb", async () => {
    const page = plantObjectPage([
      {
        id: "entry-1",
        title: "First public flowers",
        body: "Public story.",
        entryDate: "2026-07-04",
        visibility: "public",
        publicSlug: "first-public-flowers",
      },
    ]);
    page.plantObject.catalog_canonical_name = "Solanum lycopersicum";
    page.plantObject.catalog_public_slug = "solanum-lycopersicum";
    page.plantObject.catalogKind = "species";
    mocks.getPlantObjectPage.mockResolvedValue(page);
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toMatch(/<a[^>]*href="\/garden"[^>]*>Мій сад<\/a>/u);
    expect(html).toMatch(
      /<a[^>]*href="\/garden\/spaces\/space-1"[^>]*>Balcony<\/a>/u,
    );
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/lineage/objects/${OBJECT_ID}"[^>]*>Публічний паспорт цього об&#x27;єкта</a>`,
        "u",
      ),
    );
    expect(html).toMatch(
      /<a[^>]*href="\/species\/solanum-lycopersicum"[^>]*>Solanum lycopersicum у каталозі<\/a>/u,
    );
    // The garden is the breadcrumb, not a third button; "you" is not a line.
    expect(html).not.toContain("До мого саду");
    expect(html).not.toContain("Доглядальник");
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

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('lang="uk"');
    expect(html).toContain("Мій сад");
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

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
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

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
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
      "Відкрити публічну сторінку",
      "/journal/first-public-flowers",
      `/lineage/objects/${OBJECT_ID}`,
    ],
    [
      "bg",
      "Отвори публичната страница",
      "/journal/first-public-flowers",
      `/bg/lineage/objects/${OBJECT_ID}`,
    ],
    [
      "ru",
      "Открыть публичную страницу",
      "/journal/first-public-flowers",
      `/ru/lineage/objects/${OBJECT_ID}`,
    ],
  ] as const)(
    "localizes owner actions in %s while preserving journal content and locale-aware public links",
    async (locale, openPublic, journalPath, passportPath) => {
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

      const html = await renderServerHtml(
        await PlantObjectReadbackPage({
          params: Promise.resolve({ objectId: OBJECT_ID }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(openPublic);
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

  it("leaves provenance records and the data source to their own pages", async () => {
    mocks.getObjectProvenancePanel.mockResolvedValueOnce({
      sourceObjectOptions: [],
      edges: [provenanceEdge()],
    });
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([], false, {
        sourceCredit: {
          sourceSlug: "eu_oj_eur_lex_common_catalogue",
          sourceName: "EU Official Journal / EUR-Lex Common Catalogue",
          sourceUrl: "https://eur-lex.europa.eu/",
          attributionText: null,
        },
      }),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).not.toContain("Maria&#x27;s saved seeds");
    expect(html).not.toContain("EU Official Journal");
    expect(html).not.toContain("Записати приватне джерело");
  });

  it("answers a malformed id with the missing record, before any read", async () => {
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('data-workspace-record="missing"');
    expect(mocks.getPlantObjectPage).not.toHaveBeenCalled();
  });

  // OVE-353 / AC-03, reshaped by `OVE-488` (OG-UX-045): deletion is no longer
  // a form repeated under every entry. Each entry has its own menu, named with
  // the entry; the confirmation it opens names the entry and the seven-day
  // technical window, and offers no archive or restore.
  it.each([
    ["uk", "Дії із записом «Winter pruning note»", "Редагувати"],
    ["bg", "Действия със записа „Winter pruning note“", "Редактирай"],
    ["ru", "Действия с записью «Winter pruning note»", "Редактировать"],
  ] as const)(
    "puts the irreversible delete behind the entry's own menu in %s",
    async (locale, menuLabel, editLabel) => {
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

      const html = await renderServerHtml(
        await PlantObjectReadbackPage({
          params: Promise.resolve({ objectId: OBJECT_ID }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain(`aria-label="${menuLabel}"`);
      expect(html).toContain('data-entry-actions-trigger="entry-active"');
      // No delete form on the page until the owner asks for it.
      expect(html).not.toContain('name="deleteAccepted"');
      // Editing returns to this entry's place in the timeline.
      expect(html).toContain(editLabel);
      expect(html).toContain(
        `returnTo=%2Fgarden%2Fobjects%2F${OBJECT_ID}%23passport-entry-entry-active`,
      );
      // Active history stays readable; deletion is the only way it leaves.
      expect(html).toContain("Winter pruning note");
      expect(html).toContain("Owner-visible active history.");
      expect(html).not.toContain('data-owner-entry-controls="archived"');
    },
  );

  it("keeps both WAIT-01 controls enabled beside the entry's menu", async () => {
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

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    // "return to active journal link" and "object navigation link".
    expect(html).toContain('href="/garden"');
    expect(html).toContain('href="/journal/winter-pruning-note"');
    expect(html).toContain('data-entry-actions-trigger="entry-active"');
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

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
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

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain(
      'data-requires-first-publication-disclosure="false"',
    );
    expect(html).not.toContain('name="publicationDisclosureAccepted"');
    expect(html).not.toContain('data-auth-intent-control="publish"');
  });

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.getPlantObjectPage.mockRejectedValue(
      missingRelationRejection("plant_objects"),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('data-workspace-surface="object"');
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("plant_objects");
    expect(html).not.toContain('data-workspace-state="loading"');
    expect(html).not.toContain('data-workspace-section="loading"');
  });

  it("says an absent object is absent instead of throwing a not-found", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(null);
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = await renderServerHtml(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: OBJECT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('data-workspace-record="missing"');
    expect(html).toContain('data-workspace-surface="object"');
    expect(html).not.toContain("Follow-up composer");
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
      id: OBJECT_ID,
      display_name: "Cherry tomato",
      object_kind: "plant",
      catalogKind: "plant_variety" as string,
      catalog_item_id: null,
      catalog_canonical_name: null as string | null,
      catalog_public_slug: null as string | null,
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

function provenanceEdge() {
  return {
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
  };
}
