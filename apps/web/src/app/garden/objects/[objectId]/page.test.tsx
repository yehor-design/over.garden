import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  resolvePilotWriteAccess: vi.fn(),
  getPlantObjectPage: vi.fn(),
  getObjectProvenancePanel: vi.fn(),
  resolveFollowUpValuePulsePrompt: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  createAuthIntentControlRef: vi.fn(),
  resolveVisualJournalCreationScenario: vi.fn(),
  resolveVisualJournalCreationResultScenario: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));

vi.mock("@/server/pilot-write-access", () => ({
  resolvePilotWriteAccess: mocks.resolvePilotWriteAccess,
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

vi.mock("@/lib/visual-fixtures/journal-creation-scenarios", () => ({
  resolveVisualJournalCreationScenario:
    mocks.resolveVisualJournalCreationScenario,
  resolveVisualJournalCreationResultScenario:
    mocks.resolveVisualJournalCreationResultScenario,
}));

vi.mock("./catalog-resolve-control", () => ({
  CatalogResolveControl: () => <section>Catalog resolve</section>,
}));

vi.mock("./follow-up-entry-composer", () => ({
  FollowUpEntryComposer: (props: {
    objectKind: string;
    visualScenario?: { id: string } | null;
  }) => (
    <form
      data-object-kind={props.objectKind}
      data-visual-create={props.visualScenario?.id ?? ""}
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
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.scopedToUser.mockImplementation(
      (userId: string, sessionId: string | null) => ({ userId, sessionId }),
    );
    mocks.resolvePilotWriteAccess.mockResolvedValue({ invited: true });
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
    mocks.resolveVisualJournalCreationScenario.mockReturnValue(null);
    mocks.resolveVisualJournalCreationResultScenario.mockReturnValue(null);
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

    expect(html).toContain("Your garden record has started");
    expect(html).toContain("Cherry tomato now has its first dated note");
    expect(html).toContain("1 / 4 starter notes");
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

    expect(html).toContain("This record is getting useful");
    expect(html).toContain("Cherry tomato now has 2 dated notes");
    expect(html).toContain("Add dated entry");
    expect(html).toContain("Follow-up composer");
    expect(html).toContain("Повна історія об&#x27;єкта");
    expect(html).toContain("Second flowering wave");
    expect(html).toContain("First flowers");
    expect(html).not.toMatch(/leaderboard|streak|likes|followers|share modal/i);
  });

  it("renders signed-in journal entries as object logbook readbacks with public links", async () => {
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

    expect(html).toContain("Запис об&#x27;єкта");
    expect(html).toContain("Public page available");
    expect(html).toContain("Open public page");
    expect(html).toContain("/journal/first-public-flowers");
    expect(html).toContain("Open public passport");
    expect(html).toContain("/lineage/objects/object-1");
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine|latitude|longitude/i,
    );
  });

  it("resumes publishing at only the exact private journal entry control", async () => {
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

    expect(html).toContain(
      'id="entry-publish-publish-ref-entry-2" data-auth-intent-control="publish" data-auth-intent-control-ref="publish-ref-entry-2" autofocus=""',
    );
    expect(html).toContain(
      'data-auth-intent-control-ref="publish-ref-entry-1"',
    );
    expect(html).not.toContain('id="entry-publish-publish-ref-entry-1"');
    expect(html.match(/autofocus=""/g)).toHaveLength(1);
  });

  it("renders a credential-free follow-up fixture without analytics or write gating", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualJournalCreationScenario.mockReturnValueOnce({
      id: "ove182-c012",
      flow: "follow-up",
      ownerActorId: "00000000-0000-4000-8000-000000000099",
      objectId: "object-1",
    });
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
        searchParams: Promise.resolve({ visualCreate: "ove182-c012" }),
      }),
    );

    expect(html).toContain('data-object-kind="plant"');
    expect(html).toContain('data-visual-create="ove182-c012"');
    expect(mocks.scopedToUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
      null,
    );
    expect(mocks.resolvePilotWriteAccess).not.toHaveBeenCalled();
    expect(mocks.recordAnalyticsEventSafely).not.toHaveBeenCalled();
  });

  it("renders the canonical scenario result for its fixture owner", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualJournalCreationResultScenario.mockReturnValueOnce({
      id: "ove182-c001",
      ownerActorId: "00000000-0000-4000-8000-000000000099",
      expectedObjectId: "object-1",
    });
    mocks.getPlantObjectPage.mockResolvedValue(
      plantObjectPage([
        {
          id: "expected-entry",
          title: "First fixture update",
          body: "Canonical repository readback.",
          entryDate: "2026-07-12",
        },
      ]),
    );
    const { default: PlantObjectReadbackPage } = await import("./page");

    const html = renderToStaticMarkup(
      await PlantObjectReadbackPage({
        params: Promise.resolve({ objectId: "object-1" }),
        searchParams: Promise.resolve({ visualCreateResult: "ove182-c001" }),
      }),
    );

    expect(html).toContain('data-visual-creation-result="ove182-c001"');
    expect(html).toContain("Canonical repository readback.");
    expect(html).not.toContain('data-visual-create="ove182-c001"');
    expect(mocks.scopedToUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
      null,
    );
    expect(mocks.resolvePilotWriteAccess).not.toHaveBeenCalled();
    expect(mocks.recordAnalyticsEventSafely).not.toHaveBeenCalled();
  });

  it("asks for the full publication disclosure only before the first publish", async () => {
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

    expect(html).toContain("public-sharing choices you have already reviewed");
    expect(html).not.toContain('name="publicationDisclosureAccepted"');
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
  }>,
  hasPriorPublicationDisclosure = false,
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
      source_credit: null,
    },
    hasPriorPublicationDisclosure,
    entries: entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      entry_date: entry.entryDate,
      entry_scope: "object",
      visibility: entry.visibility ?? "private",
      lifecycle_state: "active",
      public_slug: entry.publicSlug ?? null,
      public_gone_at: null,
      timelineRelation: "direct_object",
      mentionedObjects: [],
      media: null,
    })),
    gallery_media: [],
  };
}
