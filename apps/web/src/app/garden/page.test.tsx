import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GardenWorkspaceReadModel } from "@/server/garden-workspace-repository";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  loadGardenWorkspace: vi.fn(),
  getMySpaceJournalTimeline: vi.fn(),
  findSelectableCatalogItemByPublicSlug: vi.fn(),
  scheduleGardenWorkspaceActivationAnalytics: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  resolveVisualGardenWorkspaceScenario: vi.fn(),
  resolveVisualJournalCreationScenario: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));

vi.mock("@/server/garden-workspace-repository", () => ({
  loadGardenWorkspace: mocks.loadGardenWorkspace,
  withGardenWorkspaceDeadline: (load: () => Promise<unknown>) => load(),
}));

vi.mock("@/server/garden-workspace-after-response", () => ({
  scheduleGardenWorkspaceActivationAnalytics:
    mocks.scheduleGardenWorkspaceActivationAnalytics,
}));

vi.mock("@/server/journal-repository", () => ({
  getMySpaceJournalTimeline: mocks.getMySpaceJournalTimeline,
}));

vi.mock("@/server/catalog-repository", () => ({
  findSelectableCatalogItemByPublicSlug:
    mocks.findSelectableCatalogItemByPublicSlug,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/lib/visual-fixtures/garden-workspace-scenarios", () => ({
  resolveVisualGardenWorkspaceScenario:
    mocks.resolveVisualGardenWorkspaceScenario,
}));

vi.mock("@/lib/visual-fixtures/journal-creation-scenarios", () => ({
  resolveVisualJournalCreationScenario:
    mocks.resolveVisualJournalCreationScenario,
}));

vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: () => false,
}));

vi.mock("../wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction: vi.fn(),
}));

vi.mock("./actions", () => ({
  createSpaceJournalEntryAction: vi.fn(),
}));

vi.mock("./first-entry-composer", () => ({
  FirstEntryComposer: (props: {
    initialSpace?: { id: string; displayName: string } | null;
    visualScenario?: { id: string } | null;
  }) => (
    <form
      data-initial-space-id={props.initialSpace?.id ?? ""}
      data-initial-space-name={props.initialSpace?.displayName ?? ""}
      data-visual-create={props.visualScenario?.id ?? ""}
    >
      First entry composer
    </form>
  ),
}));

vi.mock("./garden-auth-panel", () => ({
  GardenAuthPanel: (props: { postAuthPath?: string | null }) => (
    <section data-post-auth-path={props.postAuthPath ?? ""}>
      Garden auth panel
    </section>
  ),
}));

describe("/garden workspace V2", () => {
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
    mocks.findSelectableCatalogItemByPublicSlug.mockResolvedValue(null);
    mocks.scheduleGardenWorkspaceActivationAnalytics.mockReturnValue(undefined);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveVisualGardenWorkspaceScenario.mockReturnValue(null);
    mocks.resolveVisualJournalCreationScenario.mockReturnValue(null);
    mocks.loadGardenWorkspace.mockResolvedValue(workspaceModel());
    mocks.getMySpaceJournalTimeline.mockResolvedValue(spaceTimeline());
  });

  it("renders the shared-shell operational home and preserves write paths", async () => {
    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(mocks.loadGardenWorkspace).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        faultSections: [],
        inventoryExpanded: false,
        inventoryPage: 1,
        spacesExpanded: false,
        spacesPage: 1,
      },
    );
    expect(html).toContain('data-garden-workspace="operational-home"');
    expect(html).toContain("Оновіть Cherry tomato");
    expect(html).toContain("Рослини");
    expect(html).toContain("Тварини");
    expect(html).toContain("Останні події");
    expect(html).toContain("Flowering changed");
    expect(html).toContain("Додати живий об");
    expect(html).toContain("First entry composer");
    expect(html).toContain('data-initial-space-id="space-1"');
    expect(html).toContain('data-initial-space-name="Balcony"');
    // Timeline work is a deferred server boundary: first-entry composition is
    // already present in the initial response instead of waiting for it.
    expect(mocks.getMySpaceJournalTimeline).toHaveBeenCalledWith(
      expect.anything(),
      "space-1",
      { objectLimit: 20, entryLimit: 5 },
    );
    expect(html).not.toContain("Інструменти журналу простору");
    expect(html).not.toContain("Sign-in methods");
    expect(html).not.toContain("Social account link panel");
    expect(html).not.toContain("gardener@example.com");
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|latitude|longitude/i,
    );
  });

  it("parses bounded inventory and space view-all pages from URL state", async () => {
    const { default: GardenPage } = await import("./page");
    await GardenPage({
      searchParams: Promise.resolve({
        inventory: "all",
        inventoryPage: "999999999999999999999999",
        spaces: "all",
        spacesPage: "3",
      }),
    });

    expect(mocks.loadGardenWorkspace).toHaveBeenCalledWith(expect.anything(), {
      faultSections: [],
      inventoryExpanded: true,
      inventoryPage: 100,
      spacesExpanded: true,
      spacesPage: 3,
    });
  });

  it("falls back to the preview space when the requested space is malformed", async () => {
    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({ space: "not-a-uuid" }),
      }),
    );

    expect(html).toContain('data-initial-space-id="space-1"');
    expect(mocks.getMySpaceJournalTimeline).toHaveBeenCalledWith(
      expect.anything(),
      "space-1",
      { objectLimit: 20, entryLimit: 5 },
    );
  });

  it("keeps an empty signed-in user on the first-object path", async () => {
    mocks.loadGardenWorkspace.mockResolvedValueOnce(emptyWorkspaceModel());
    mocks.getMySpaceJournalTimeline.mockResolvedValueOnce(null);

    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Почніть з одного живого об");
    expect(html).toContain("Почати перший об");
    expect(html).toContain("Просторів ще немає");
    expect(html).toContain("Датованих подій ще немає");
    expect(html).toContain("First entry composer");
    expect(html).not.toContain("Інструменти журналу простору");
  });

  it("lets a self-serve gardener write from an authenticated session", async () => {
    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Cherry tomato");
    expect(html).toContain("First entry composer");
    expect(html).not.toContain("Наразі писати можна лише за запрошенням");
    expect(html).not.toContain('data-testid="closed-pilot-write-callout"');
  });

  it("shows a contextual reversible sign-in without querying private rows", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Ваш приватний сад починається тут");
    expect(html).toContain("Garden auth panel");
    expect(html).toContain("Продовжити читати журнали");
    expect(html).toContain('href="/journals"');
    expect(mocks.loadGardenWorkspace).not.toHaveBeenCalled();
    expect(mocks.getMySpaceJournalTimeline).not.toHaveBeenCalled();
  });

  it.each([
    "/\\attacker.example/steal",
    "/%5cattacker.example/steal",
    "/%252f%255cattacker.example/steal",
  ])("falls back from unsafe post-auth return path %s", async (returnTo) => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({
          engagement: "comment-auth",
          returnTo,
        }),
      }),
    );

    expect(html).toContain('data-post-auth-path="/garden"');
    expect(html).not.toContain("attacker");
  });

  it("renders a deterministic owner on the real route without credentials or analytics", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualGardenWorkspaceScenario.mockReturnValueOnce(
      visualScenario("offline"),
    );

    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({ visualWorkspace: "offline" }),
      }),
    );

    expect(mocks.loadGardenWorkspace).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000099",
        sessionId: null,
      },
      expect.objectContaining({ faultSections: [] }),
    );
    expect(html).toContain('data-garden-workspace="operational-home"');
    expect(html).toContain("Офлайн");
    expect(html).toContain("Synthetic draft 1");
    expect(html).toContain("Очікує синхронізації");
    expect(html).not.toContain("Garden auth panel");
    expect(
      mocks.scheduleGardenWorkspaceActivationAnalytics,
    ).not.toHaveBeenCalled();
  });

  it("renders deterministic loading without querying owner rows", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualGardenWorkspaceScenario.mockReturnValueOnce(
      visualScenario("loading"),
    );

    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({ visualWorkspace: "loading" }),
      }),
    );

    expect(html).toContain('data-garden-workspace="loading"');
    expect(mocks.loadGardenWorkspace).not.toHaveBeenCalled();
    expect(mocks.getMySpaceJournalTimeline).not.toHaveBeenCalled();
  });

  it("renders a credential-free first-entry fixture on the real owner form", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualJournalCreationScenario.mockReturnValueOnce(
      visualCreationScenario("first-entry"),
    );

    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({ visualCreate: "ove182-c001" }),
      }),
    );

    expect(html).toContain('data-visual-create="ove182-c001"');
    expect(mocks.scopedToUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
      null,
    );
    expect(mocks.getMySpaceJournalTimeline).toHaveBeenCalledWith(
      expect.anything(),
      "space-1",
      { objectLimit: 20, entryLimit: 5 },
    );
    expect(
      mocks.scheduleGardenWorkspaceActivationAnalytics,
    ).not.toHaveBeenCalled();
  });
});

function visualCreationScenario(flow: "first-entry" | "follow-up") {
  return {
    id: "ove182-c001",
    flow,
    state: "minimum",
    label: "Minimum form",
    ownerActorId: "00000000-0000-4000-8000-000000000099",
    objectId: flow === "follow-up" ? "object-1" : null,
    spaceId: "space-1",
    objectKind: "plant",
    objectName: "Cherry tomato",
    entryTitle: "First flowers",
    entryBody: "Two new flower clusters.",
    entryDate: "2026-07-12",
    catalogQuery: null,
    userAddedCatalogName: null,
    locationVisibility: "hidden",
    coarseRegionCode: null,
    topicTagInput: "",
    mediaFileName: null,
    online: true,
    submitState: "idle",
    message: "Private by default.",
    detailsOpen: false,
    path: "/garden?visualCreate=ove182-c001",
    expectedStatus: 200,
    viewportTargets: ["desktop", "mobile-320"] as const,
  };
}

function visualScenario(state: "offline" | "loading") {
  return {
    id: `workspace-${state}`,
    state,
    ownerActorId: "00000000-0000-4000-8000-000000000099",
    path: `/garden?visualWorkspace=${state}`,
    expectedSpaceCount: 5,
    expectedObjectCount: 12,
    expectedPlantCount: 10,
    expectedAnimalCount: 1,
    expectedRecentCount: 8,
    expectedSpaceIds: ["space-1"],
    expectedObjectIds: ["object-1"],
    expectedRecentEntryIds: ["entry-1"],
    online: state !== "offline",
    draftCount: state === "offline" ? 2 : 0,
    queuedCount: state === "offline" ? 1 : 0,
    failedCount: state === "offline" ? 1 : 0,
    mediaProcessingCount: state === "offline" ? 1 : 0,
    mediaFailedCount: state === "offline" ? 1 : 0,
    faultSections: [],
    viewportTargets: ["desktop", "mobile-320"] as const,
  };
}

function workspaceModel(): GardenWorkspaceReadModel {
  return {
    inventory: {
      status: "ready",
      value: {
        totalCount: 3,
        plantCount: 1,
        animalCount: 1,
        archivedEntryCount: 0,
        objects: [workspaceObject()],
        hasMore: false,
        page: 1,
        pageSize: 8,
      },
    },
    spaces: {
      status: "ready",
      value: {
        totalCount: 1,
        spaces: [
          {
            id: "space-1",
            displayName: "Balcony",
            objectCount: 3,
            plantCount: 1,
            animalCount: 1,
          },
        ],
        hasMore: false,
        page: 1,
        pageSize: 4,
      },
    },
    recent: {
      status: "ready",
      value: [
        {
          id: "entry-1",
          title: "Flowering changed",
          entryScope: "object",
          entryDate: new Date("2026-07-04T00:00:00.000Z"),
          visibility: "public",
          lifecycleState: "active",
          objectId: "object-1",
          objectDisplayName: "Cherry tomato",
          spaceId: "space-1",
          spaceDisplayName: "Balcony",
        },
      ],
    },
    inbox: {
      status: "ready",
      value: { notificationCount: 2, claimCount: 1 },
    },
    media: {
      status: "ready",
      value: { processingCount: 0, failedCount: 0 },
    },
    allFailed: false,
  };
}

function emptyWorkspaceModel(): GardenWorkspaceReadModel {
  return {
    inventory: {
      status: "ready",
      value: {
        totalCount: 0,
        plantCount: 0,
        animalCount: 0,
        archivedEntryCount: 0,
        objects: [],
        hasMore: false,
        page: 1,
        pageSize: 8,
      },
    },
    spaces: {
      status: "ready",
      value: {
        totalCount: 0,
        spaces: [],
        hasMore: false,
        page: 1,
        pageSize: 4,
      },
    },
    recent: { status: "ready", value: [] },
    inbox: {
      status: "ready",
      value: { notificationCount: 0, claimCount: 0 },
    },
    media: {
      status: "ready",
      value: { processingCount: 0, failedCount: 0 },
    },
    allFailed: false,
  };
}

function workspaceObject() {
  return {
    id: "object-1",
    displayName: "Cherry tomato",
    objectKind: "plant" as const,
    spaceDisplayName: "Balcony",
    catalogItemId: null,
    catalogKind: "plant_variety" as const,
    varietyText: "Cherry tomato",
    varietyState: "selected" as const,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    entryCount: 3,
    publicEntryCount: 1,
    privateEntryCount: 2,
    archivedEntryCount: 0,
    latestEntryDate: new Date("2020-06-01T00:00:00.000Z"),
    coverMedia: null,
  };
}

function spaceTimeline() {
  return {
    space: {
      id: "space-1",
      display_name: "Balcony",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    objects: [
      {
        id: "object-1",
        displayName: "Cherry tomato",
        objectKind: "plant",
        catalogKind: "plant_variety",
        varietyText: "Cherry tomato",
        varietyState: "selected",
      },
    ],
    entries: [
      {
        id: "entry-space-1",
        title: "Shared morning round",
        body: "Watered the shared balcony containers.",
        entry_date: new Date("2026-07-04T00:00:00.000Z"),
        visibility: "private",
        lifecycle_state: "active",
        entry_scope: "space",
        media: null,
        mentionedObjects: [],
        timelineRelation: "space_timeline",
      },
    ],
  };
}
