import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GardenObjectsGroup,
  GardenSpacesGroup,
} from "@/lib/garden/garden-collection";
import type { GardenWorkspaceContext } from "@/server/garden-workspace-repository";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  listGardenObjects: vi.fn(),
  listGardenSpaces: vi.fn(),
  loadGardenWorkspaceContext: vi.fn(),
  getMySpaceJournalTimeline: vi.fn(),
  hasPriorPublicationDisclosure: vi.fn(),
  findSelectableCatalogItemByPublicSlug: vi.fn(),
  scheduleGardenWorkspaceActivationAnalytics: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  railModules: vi.fn(),
}));

// The signed-out path asks whether the reader arrived with a session cookie
// before deciding that "no session" means "signed out" (`OVE-457`), and that
// question reads the request's own `cookie` header.
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: ({ modules }: { modules: unknown }) => {
    mocks.railModules(modules);
    return null;
  },
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));

vi.mock("@/server/garden-collection-repository", () => ({
  GARDEN_COLLECTION_GROUP_QUERY_COUNT: 3,
  listGardenObjects: mocks.listGardenObjects,
  listGardenSpaces: mocks.listGardenSpaces,
}));

vi.mock("@/server/garden-workspace-repository", () => ({
  loadGardenWorkspaceContext: mocks.loadGardenWorkspaceContext,
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

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "10000000-0000-4000-8000-000000000001";
const OBJECT_ID = "20000000-0000-4000-8000-000000000001";

async function renderGarden(params: Record<string, string> = {}) {
  const { default: GardenPage } = await import("./page");
  return renderServerHtml(
    await GardenPage({ searchParams: Promise.resolve(params) }),
  );
}

describe("/garden, the collection home (OVE-489)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: USER_ID, email: "gardener@example.com" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.scopedToUser.mockImplementation(
      (userId: string, sessionId: string | null) => ({ userId, sessionId }),
    );
    mocks.findSelectableCatalogItemByPublicSlug.mockResolvedValue(null);
    mocks.scheduleGardenWorkspaceActivationAnalytics.mockReturnValue(undefined);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listGardenSpaces.mockResolvedValue(spacesGroup());
    mocks.listGardenObjects.mockResolvedValue(objectsGroup());
    mocks.loadGardenWorkspaceContext.mockResolvedValue(workspaceContext());
    mocks.getMySpaceJournalTimeline.mockResolvedValue(spaceTimeline());
    mocks.hasPriorPublicationDisclosure.mockResolvedValue(false);
  });

  it("leads with the actions and lists spaces and plants as facts, with Write on each", async () => {
    const html = await renderGarden();

    expect(mocks.listGardenObjects).toHaveBeenCalledWith(
      { userId: USER_ID, sessionId: "session-1" },
      { q: "", sort: "recent", kind: "all", page: 1 },
    );
    expect(html).toContain('data-garden-workspace="collection"');
    expect(html).toContain('data-garden-action="new-entry"');
    expect(html).toContain('href="/garden/objects/new"');
    expect(html).toContain('href="/garden/spaces/new"');
    // Identity: kind, species and space beside the name.
    expect(html).toContain("Cherry tomato");
    expect(html).toContain("Рослина · Balcony · Solanum lycopersicum");
    expect(html).toContain('<time dateTime="2026-07-04">');
    expect(html).toContain("Ще без записів");
    expect(html).toContain(
      `href="/garden/new?object=${OBJECT_ID}&amp;returnTo=%2Fgarden%23garden-object-${OBJECT_ID}"`,
    );
    expect(html).toContain('aria-label="Записати: Cherry tomato"');
    expect(html).toContain(`href="/garden/spaces/${SPACE_ID}"`);
    // Recency is stated, never diagnosed (OG-UX-023).
    expect(html).not.toMatch(/Потребує уваги|Оновіть|needs attention/iu);
    // A small garden is read whole: no search over three things.
    expect(html).toContain('data-garden-collection-simple="true"');
    expect(html).not.toContain('data-garden-search="true"');
    // The returning gardener's home carries no editor.
    expect(html).not.toContain("First entry composer");
    expect(html).not.toContain("data-local-composer-kind");
    expect(
      mocks.scheduleGardenWorkspaceActivationAnalytics,
    ).not.toHaveBeenCalled();
    expect(html).not.toContain("gardener@example.com");
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|latitude|longitude/i,
    );
  });

  it("registers the last entries and the inbox in the context rail", async () => {
    await renderGarden();

    const modules = mocks.railModules.mock.calls.at(-1)?.[0] as Array<{
      key: string;
      items: Array<{ href: string; label: string }>;
    }>;
    expect(modules.map((module) => module.key)).toEqual([
      "garden-next",
      "garden-recent",
      "garden-inbox",
    ]);
    expect(modules[0]?.items[0]?.href).toBe("/garden/new");
    expect(
      (modules[2]?.items as Array<{ meta?: string }>).map((item) => item.meta),
    ).toEqual(["2", "1"]);
    expect(modules[1]?.items).toEqual([
      expect.objectContaining({
        href: `/garden/objects/${OBJECT_ID}`,
        label: "Flowering changed",
      }),
      expect.objectContaining({
        href: `/garden/spaces/${SPACE_ID}`,
        label: "Morning round",
      }),
    ]);
  });

  it("offers search, orders and modes once the garden is bigger than a glance", async () => {
    mocks.listGardenObjects.mockResolvedValueOnce(
      objectsGroup({ total: 40, owned: 40 }),
    );
    const html = await renderGarden();

    expect(html).toContain('data-garden-search="true"');
    expect(html).toContain('name="q"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Спершу нещодавні записи");
    expect(html).toContain("Сторінка 1 з 2");
    expect(html).toContain('href="/garden?page=2#garden-collection"');
    expect(html).toContain("У саду — простори: 1, рослини й тварини: 40");
  });

  it("reads the query, order, mode and page from the address", async () => {
    await renderGarden({
      q: "  томат  ",
      sort: "name",
      kind: "object",
      page: "3",
    });

    const request = { q: "томат", sort: "name", kind: "object", page: 3 };
    expect(mocks.listGardenObjects).toHaveBeenCalledWith(
      expect.anything(),
      request,
    );
    expect(mocks.listGardenSpaces).toHaveBeenCalledWith(
      expect.anything(),
      request,
    );
  });

  it("keeps the query in each Write's way back", async () => {
    const html = await renderGarden({ q: "tomato", sort: "name" });

    expect(html).toContain(
      `returnTo=%2Fgarden%3Fq%3Dtomato%26sort%3Dname%23garden-object-${OBJECT_ID}`,
    );
    expect(html).toContain("Знайдено — простори: 1, рослини й тварини: 2");
  });

  it("says nothing was found, and offers to add it, when a search matches nothing", async () => {
    mocks.listGardenSpaces.mockResolvedValueOnce(
      spacesGroup({ items: [], total: 0 }),
    );
    mocks.listGardenObjects.mockResolvedValueOnce(
      objectsGroup({ items: [], total: 0 }),
    );
    const html = await renderGarden({ q: "кактус" });

    expect(html).toContain('data-garden-no-results="true"');
    expect(html).toContain("Нічого не знайдено");
    expect(html).toContain("Очистити пошук");
    expect(html).not.toContain('data-garden-setup="true"');
  });

  // ADR-0035 D1: the combined space + object + first entry form is gone.
  it("treats an empty garden as setup: one picture, two buttons, no form and no collection", async () => {
    mocks.listGardenSpaces.mockResolvedValueOnce(
      spacesGroup({ items: [], total: 0, owned: 0 }),
    );
    mocks.listGardenObjects.mockResolvedValueOnce(
      objectsGroup({ items: [], total: 0, owned: 0 }),
    );
    const html = await renderGarden();

    expect(html).toContain('data-garden-workspace="setup"');
    expect(html).toContain('data-garden-setup="true"');
    expect(html).toContain("Почніть свій сад");
    expect(html).toContain("/illustrations/empty-garden.webp");
    expect(html).toContain("Створити простір");
    expect(html).toContain("Додати рослину чи тварину");
    expect(html).not.toContain("data-local-composer-kind");
    expect(html).not.toContain('data-garden-collection="true"');
    expect(html).not.toMatch(/<form[^>]*data-entry-composer/u);
  });

  it("shows the collection of a garden with spaces and no plant yet, and no form", async () => {
    mocks.listGardenObjects.mockResolvedValueOnce(
      objectsGroup({ items: [], total: 0, owned: 0 }),
    );
    const html = await renderGarden();

    expect(html).toContain('data-garden-collection="true"');
    expect(html).toContain("Рослин і тварин ще немає.");
    expect(html).not.toContain("data-local-composer-kind");
  });

  it("sends a catalogue launch and a resumed object create on to object setup", async () => {
    await expect(renderGarden({ catalog: "solanum-lycopersicum" })).rejects.toMatchObject({
      digest: expect.stringContaining("/garden/objects/new?catalog=solanum-lycopersicum"),
    });
    await expect(renderGarden({ authIntent: "create_object" })).rejects.toMatchObject({
      digest: expect.stringContaining("/garden/objects/new"),
    });
  });

  it("does not treat an activation source as a request to create", async () => {
    const html = await renderGarden({ source: "direct-garden" });

    expect(html).toContain('data-garden-collection="true"');
    expect(html).not.toContain("data-local-composer-kind");
  });

  it("keeps the spaces when the plants cannot be read, and never calls the garden empty", async () => {
    mocks.listGardenObjects.mockRejectedValueOnce(
      postgresRejection(
        "57014",
        "canceling statement due to statement timeout",
      ),
    );
    const html = await renderGarden();

    expect(html).toContain('id="garden-objects"');
    expect(html).toContain('data-section-failure="query_timeout"');
    expect(html).toContain("Не вдалося показати рослини й тварин");
    expect(html).toContain('href="/garden#garden-objects"');
    expect(html).toContain("Balcony");
    expect(html).not.toContain('data-garden-setup="true"');
    expect(html).not.toContain("First entry composer");
    expect(html).not.toContain("Рослин і тварин ще немає.");
  });

  it("keeps the plants when the spaces cannot be read", async () => {
    mocks.listGardenSpaces.mockRejectedValueOnce(
      postgresRejection("ECONNREFUSED"),
    );
    const html = await renderGarden();

    expect(html).toContain('id="garden-spaces"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain("Cherry tomato");
    expect(html).not.toContain('data-garden-setup="true"');
  });

  it("leaves a space's journal to the space's own page", async () => {
    // `/garden?space=…` answers 308 in the proxy since OVE-490; the garden
    // page itself never reads one space.
    await renderGarden({ space: SPACE_ID });

    expect(mocks.getMySpaceJournalTimeline).not.toHaveBeenCalled();
  });

  it("shows a contextual reversible sign-in without querying private rows", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const html = await renderGarden();

    expect(html).toContain("Ведіть історію свого саду");
    expect(html).toContain("Sign in prompt");
    expect(html).toContain("Продовжити читати журнали");
    expect(html).toContain('href="/journals"');
    expect(mocks.listGardenObjects).not.toHaveBeenCalled();
    expect(mocks.listGardenSpaces).not.toHaveBeenCalled();
    expect(mocks.getMySpaceJournalTimeline).not.toHaveBeenCalled();
  });

  it.each([
    "/\\attacker.example/steal",
    "/%5cattacker.example/steal",
    "/%252f%255cattacker.example/steal",
  ])("falls back from unsafe post-auth return path %s", async (returnTo) => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const html = await renderGarden({ engagement: "comment-auth", returnTo });

    expect(html).toContain('data-next="/garden"');
    expect(html).not.toContain("attacker");
  });

  it("renders its own shell and bounded failures when every read rejects", async () => {
    const missing = postgresRejection(
      "42P01",
      'relation "plant_objects" does not exist',
    );
    mocks.listGardenObjects.mockRejectedValueOnce(missing);
    mocks.listGardenSpaces.mockRejectedValueOnce(missing);
    mocks.loadGardenWorkspaceContext.mockRejectedValueOnce(missing);
    const html = await renderGarden();

    expect(html).toContain('data-workspace-surface="garden-home"');
    expect(html).toContain("Простір саду");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain('data-workspace-state="loading"');
    // The sections' fallback may stream ahead of them; what ADR-0023 forbids
    // is one left standing, with no completion to replace it.
    if (html.includes('data-garden-workspace="loading"')) {
      expect(html).toMatch(/\$RC\(/u);
    }
    expect(html).not.toContain('data-garden-setup="true"');
  });

  it("says the session store is unreachable instead of asking for a sign-in", async () => {
    mocks.getCurrentSession.mockRejectedValueOnce(
      postgresRejection("ECONNREFUSED"),
    );
    const html = await renderGarden();

    expect(html).toContain('data-workspace-surface="garden-home"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).not.toContain("Sign in prompt");
    expect(mocks.listGardenObjects).not.toHaveBeenCalled();
  });
});

function spacesGroup(
  overrides: Partial<GardenSpacesGroup> = {},
): GardenSpacesGroup {
  return {
    items: [
      {
        kind: "space",
        id: SPACE_ID,
        displayName: "Balcony",
        objectCount: 2,
        lastEntryDate: "2026-07-04",
      },
    ],
    total: 1,
    owned: 1,
    ...overrides,
  };
}

function objectsGroup(
  overrides: Partial<GardenObjectsGroup> = {},
): GardenObjectsGroup {
  return {
    items: [
      {
        kind: "object",
        id: OBJECT_ID,
        displayName: "Cherry tomato",
        objectKind: "plant",
        species: "Solanum lycopersicum",
        space: { id: SPACE_ID, displayName: "Balcony" },
        lastEntryDate: "2026-07-04",
      },
      {
        kind: "object",
        id: "20000000-0000-4000-8000-000000000002",
        displayName: "Rex",
        objectKind: "animal",
        species: null,
        space: { id: SPACE_ID, displayName: "Balcony" },
        lastEntryDate: null,
      },
    ],
    total: 2,
    owned: 2,
    ...overrides,
  };
}

function workspaceContext(): GardenWorkspaceContext {
  return {
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
          objectId: OBJECT_ID,
          objectDisplayName: "Cherry tomato",
          spaceId: SPACE_ID,
          spaceDisplayName: "Balcony",
        },
        {
          id: "entry-2",
          title: "Morning round",
          entryScope: "space",
          entryDate: new Date("2026-07-03T00:00:00.000Z"),
          visibility: "public",
          lifecycleState: "active",
          objectId: null,
          objectDisplayName: null,
          spaceId: SPACE_ID,
          spaceDisplayName: "Balcony",
        },
      ],
    },
    inbox: {
      status: "ready",
      value: { notificationCount: 2, claimCount: 1 },
    },
  };
}

function spaceTimeline() {
  return {
    space: {
      id: SPACE_ID,
      display_name: "Balcony",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    objects: [
      {
        id: OBJECT_ID,
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
