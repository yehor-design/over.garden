import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GardenWorkspaceReadModel } from "@/server/garden-workspace-repository";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  loadGardenWorkspace: vi.fn(),
  getMySpaceJournalTimeline: vi.fn(),
  hasPriorPublicationDisclosure: vi.fn(),
  findSelectableCatalogItemByPublicSlug: vi.fn(),
  scheduleGardenWorkspaceActivationAnalytics: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
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
}));

vi.mock("@/server/garden-workspace-after-response", () => ({
  scheduleGardenWorkspaceActivationAnalytics:
    mocks.scheduleGardenWorkspaceActivationAnalytics,
}));

vi.mock("@/server/journal-repository", () => ({
  getMySpaceJournalTimeline: mocks.getMySpaceJournalTimeline,
  hasPriorPublicationDisclosure: mocks.hasPriorPublicationDisclosure,
}));

vi.mock("@/server/catalog-repository", () => ({
  findSelectableCatalogItemByPublicSlug:
    mocks.findSelectableCatalogItemByPublicSlug,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: () => false,
}));

vi.mock("../../wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction: vi.fn(),
}));

vi.mock("../first-entry-composer", () => ({
  FirstEntryComposer: (props: {
    initialSpace?: { id: string; displayName: string } | null;
    requiresFirstPublicationDisclosure: boolean;
  }) => (
    <form
      data-initial-space-id={props.initialSpace?.id ?? ""}
      data-initial-space-name={props.initialSpace?.displayName ?? ""}
      data-requires-first-publication-disclosure={String(
        props.requiresFirstPublicationDisclosure,
      )}
    >
      First entry composer
    </form>
  ),
}));

vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: {
    next?: string;
    locale?: string;
    description?: string;
  }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
      {props.description ?? ""}
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
    mocks.loadGardenWorkspace.mockResolvedValue(workspaceModel());
    mocks.getMySpaceJournalTimeline.mockResolvedValue(spaceTimeline());
    mocks.hasPriorPublicationDisclosure.mockResolvedValue(false);
  });

  it("renders the shared-shell operational home and preserves write paths", async () => {
    const { default: GardenPage } = await import("./page");
    const html = await renderServerHtml(
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
    expect(html).toContain('data-requires-first-publication-disclosure="true"');
    // Timeline work stays behind its own Suspense boundary: the composer is
    // written into the shell ahead of it, so a slow timeline never delays the
    // control a gardener came here to use.
    expect(mocks.getMySpaceJournalTimeline).toHaveBeenCalledWith(
      expect.anything(),
      "space-1",
      { objectLimit: 20, entryLimit: 5 },
    );
    expect(html.indexOf("First entry composer")).toBeLessThan(
      html.indexOf("Інструменти журналу простору"),
    );
    expect(html).not.toContain("Sign-in methods");
    expect(html).not.toContain("Social account link panel");
    expect(html).not.toContain("gardener@example.com");
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|latitude|longitude/i,
    );
  });

  it("does not ask a previously disclosed owner for first-publication consent again", async () => {
    mocks.hasPriorPublicationDisclosure.mockResolvedValueOnce(true);
    const { default: GardenPage } = await import("./page");
    const html = await renderServerHtml(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain(
      'data-requires-first-publication-disclosure="false"',
    );
    expect(html).not.toContain("Я розумію, що цей запис");
  });

  it("parses bounded inventory and space view-all pages from URL state", async () => {
    const { default: GardenPage } = await import("./page");
    await renderServerHtml(
      await GardenPage({
        searchParams: Promise.resolve({
          inventory: "all",
          inventoryPage: "999999999999999999999999",
          spaces: "all",
          spacesPage: "3",
        }),
      }),
    );

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
    const html = await renderServerHtml(
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
    const html = await renderServerHtml(
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
    const html = await renderServerHtml(
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
    const html = await renderServerHtml(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Ваш приватний сад починається тут");
    expect(html).toContain("Sign in prompt");
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
    const html = await renderServerHtml(
      await GardenPage({
        searchParams: Promise.resolve({
          engagement: "comment-auth",
          returnTo,
        }),
      }),
    );

    expect(html).toContain('data-next="/garden"');
    expect(html).not.toContain("attacker");
  });

  it("renders its own shell and a bounded failure when the read model rejects", async () => {
    mocks.loadGardenWorkspace.mockRejectedValueOnce(
      postgresRejection("42P01", 'relation "plant_objects" does not exist'),
    );

    const { default: GardenPage } = await import("./page");
    const html = await renderServerHtml(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-workspace-surface="garden-home"');
    expect(html).toContain("Простір саду");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain('data-workspace-state="loading"');
    expect(html).not.toContain('data-garden-workspace="loading"');
  });

  it("says the session store is unreachable instead of asking for a sign-in", async () => {
    mocks.getCurrentSession.mockRejectedValueOnce(
      postgresRejection("ECONNREFUSED"),
    );

    const { default: GardenPage } = await import("./page");
    const html = await renderServerHtml(
      await GardenPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-workspace-surface="garden-home"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).not.toContain("Sign in prompt");
    expect(mocks.loadGardenWorkspace).not.toHaveBeenCalled();
  });
});

function workspaceModel(): GardenWorkspaceReadModel {
  return {
    inventory: {
      status: "ready",
      value: {
        totalCount: 3,
        plantCount: 1,
        animalCount: 1,
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
    publicEntryCount: 3,
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
        visibility: "public",
        lifecycle_state: "active",
        entry_scope: "space",
        media: null,
        mentionedObjects: [],
        timelineRelation: "space_timeline",
      },
    ],
  };
}
