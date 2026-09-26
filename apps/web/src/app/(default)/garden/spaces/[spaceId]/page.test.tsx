import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GardenObjectsGroup } from "@/lib/garden/garden-collection";
import type {
  OwnedSpaceSummary,
  SpaceHistoryPage,
} from "@/lib/garden/space-page";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  readSpacePageSummary: vi.fn(),
  listSpaceHistory: vi.fn(),
  listGardenObjects: vi.fn(),
  getPublicAuthorHandle: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));
vi.mock("@/server/space-page-repository", () => ({
  readSpacePageSummary: mocks.readSpacePageSummary,
  listSpaceHistory: mocks.listSpaceHistory,
}));
vi.mock("@/server/garden-collection-repository", () => ({
  listGardenObjects: mocks.listGardenObjects,
}));
vi.mock("@/server/author-handle-repository", () => ({
  getPublicAuthorHandle: mocks.getPublicAuthorHandle,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: () => false,
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string }) => (
    <section data-sign-in-prompt="true" data-next={props.next ?? ""}>
      Sign in prompt
    </section>
  ),
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "10000000-0000-4000-8000-000000000001";
const OBJECT_ID = "20000000-0000-4000-8000-000000000001";

async function renderSpace(
  params: Record<string, string> = {},
  spaceId = SPACE_ID,
) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({
      params: Promise.resolve({ spaceId }),
      searchParams: Promise.resolve(params),
    }),
  );
}

describe("/garden/spaces/[spaceId] (OVE-490)", () => {
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
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getPublicAuthorHandle.mockResolvedValue("gardener");
    mocks.readSpacePageSummary.mockResolvedValue(summary());
    mocks.listGardenObjects.mockResolvedValue(objects());
    mocks.listSpaceHistory.mockResolvedValue(history());
  });

  it("names the space and offers Write, add a plant here, and settings", async () => {
    const html = await renderSpace();

    expect(html).toContain('data-workspace-surface="space"');
    expect(html).toContain(">Теплиця</h2>");
    expect(html).toContain("Рослин і тварин: 2 · Записів: 2");
    expect(html).toContain("Регіон: ");
    expect(html).toContain(
      `href="/garden/new?space=${SPACE_ID}&amp;returnTo=%2Fgarden%2Fspaces%2F${SPACE_ID}%23space-history"`,
    );
    expect(html).toContain('aria-label="Записати в «Теплиця»"');
    expect(html).toContain(
      `href="/garden/objects/new?space=${SPACE_ID}&amp;returnTo=%2Fgarden%2Fspaces%2F${SPACE_ID}%23space-objects"`,
    );
    expect(html).toContain(`href="/garden/spaces/${SPACE_ID}/settings"`);
    expect(mocks.listGardenObjects).toHaveBeenCalledWith(
      { userId: USER_ID, sessionId: "session-1" },
      { q: "", sort: "recent", kind: "object", page: 1 },
      { spaceId: SPACE_ID },
    );
  });

  it("lists its plants without repeating the space, each with Write back to this page", async () => {
    const html = await renderSpace();

    expect(html).toContain("Cherry tomato");
    expect(html).toContain("Рослина · Solanum lycopersicum");
    expect(html).not.toContain("Рослина · Теплиця");
    expect(html).toContain(
      `href="/garden/new?object=${OBJECT_ID}&amp;returnTo=%2Fgarden%2Fspaces%2F${SPACE_ID}%23garden-object-${OBJECT_ID}"`,
    );
  });

  it("labels each history entry by what it is about, once, under its one address", async () => {
    const html = await renderSpace();

    expect(html).toContain('data-space-history-about="space"');
    expect(html).toContain("Про простір");
    expect(html).toContain('data-space-history-about="object"');
    expect(html).toContain("Про «Cherry tomato»");
    expect(html).toContain('href="/@gardener/post/12"');
    expect(html).toContain(`href="/garden/objects/${OBJECT_ID}"`);
    expect(html.match(/data-space-history-entry="entry-1"/gu)).toHaveLength(1);
    expect(html).toContain(
      `href="/garden/entries/entry-1/edit?returnTo=%2Fgarden%2Fspaces%2F${SPACE_ID}%23space-entry-entry-1"`,
    );
    // The old garden-page anchor still lands on the history.
    expect(html).toContain('id="space-journal"');
  });

  it("offers every plant and the whole history as their own views when they outgrow the page", async () => {
    mocks.readSpacePageSummary.mockResolvedValueOnce(
      summary({ objectCount: 30, entryCount: 45 }),
    );
    mocks.listGardenObjects.mockResolvedValueOnce(objects({ total: 30 }));
    mocks.listSpaceHistory.mockResolvedValueOnce(history({ total: 45 }));
    const html = await renderSpace();

    expect(html).toContain('data-space-views="true"');
    expect(html).toContain(`href="/garden/spaces/${SPACE_ID}?view=objects"`);
    expect(html).toContain("Усі (30)");
    expect(html).toContain("Уся історія (45)");
  });

  it("pages the history view and reads nothing it does not show", async () => {
    mocks.listSpaceHistory.mockResolvedValueOnce(history({ total: 45 }));
    const html = await renderSpace({ view: "history", page: "2" });

    expect(mocks.listGardenObjects).not.toHaveBeenCalled();
    expect(mocks.listSpaceHistory).toHaveBeenCalledWith(
      expect.anything(),
      SPACE_ID,
      { view: "history", page: 2 },
      "gardener",
    );
    // The next portion of the history, as a real link (OVE-518).
    expect(html).toMatch(
      new RegExp(
        `<a href="/garden/spaces/${SPACE_ID}\\?view=history&amp;page=3#space-history"[^>]*data-show-more-link="true"`,
        "u",
      ),
    );
  });

  it("says an empty space is empty, in words, with the way to fill it", async () => {
    mocks.readSpacePageSummary.mockResolvedValueOnce(
      summary({ objectCount: 0, entryCount: 0, lastEntryDate: null }),
    );
    mocks.listGardenObjects.mockResolvedValueOnce(
      objects({ items: [], total: 0, owned: 0 }),
    );
    mocks.listSpaceHistory.mockResolvedValueOnce({ entries: [], total: 0 });
    const html = await renderSpace();

    expect(html).toContain("Ще без записів");
    expect(html).not.toContain("Рослин і тварин: 0");
    expect(html).toContain("У цьому просторі ще немає рослин і тварин.");
    expect(html).toContain("Тут ще нічого не записано.");
  });

  it("keeps the plants when the history cannot be read, and never calls it empty", async () => {
    mocks.listSpaceHistory.mockRejectedValueOnce(
      postgresRejection(
        "57014",
        "canceling statement due to statement timeout",
      ),
    );
    const html = await renderSpace();

    expect(html).toContain('id="space-history"');
    expect(html).toContain('data-section-failure="query_timeout"');
    expect(html).toContain("Не вдалося показати історію");
    expect(html).toContain("Cherry tomato");
    expect(html).not.toContain("Тут ще нічого не записано.");
  });

  it("tells a space that is not the reader's apart from nothing — by saying nothing about it", async () => {
    mocks.readSpacePageSummary.mockResolvedValueOnce(null);
    const html = await renderSpace();

    expect(html).toContain('data-workspace-record="missing"');
    expect(mocks.listSpaceHistory).not.toHaveBeenCalled();
    expect(mocks.listGardenObjects).not.toHaveBeenCalled();

    const malformed = await renderSpace({}, "not-a-uuid");
    expect(malformed).toContain('data-workspace-record="missing"');
    expect(mocks.readSpacePageSummary).toHaveBeenCalledTimes(1);
  });

  it("asks a guest to sign in and reads nothing", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const html = await renderSpace();

    expect(html).toContain(`data-next="/garden/spaces/${SPACE_ID}"`);
    expect(mocks.readSpacePageSummary).not.toHaveBeenCalled();
  });
});

function summary(
  overrides: Partial<OwnedSpaceSummary> = {},
): OwnedSpaceSummary {
  return {
    id: SPACE_ID,
    displayName: "Теплиця",
    photo: null,
    locationVisibility: "region",
    coarseRegionCode: "UA-32",
    objectCount: 2,
    entryCount: 2,
    lastEntryDate: "2026-09-20",
    ...overrides,
  };
}

function objects(
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
        space: { id: SPACE_ID, displayName: "Теплиця" },
        lastEntryDate: "2026-09-20",
      },
    ],
    total: 2,
    owned: 2,
    ...overrides,
  };
}

function history(overrides: Partial<SpaceHistoryPage> = {}): SpaceHistoryPage {
  return {
    entries: [
      {
        id: "entry-1",
        title: "Полив усієї теплиці",
        entryDate: "2026-09-20",
        about: { kind: "space" },
        publicPath: "/@gardener/post/11",
      },
      {
        id: "entry-2",
        title: "Перші квіти",
        entryDate: "2026-09-19",
        about: {
          kind: "object",
          objectId: OBJECT_ID,
          displayName: "Cherry tomato",
          objectKind: "plant",
        },
        publicPath: "/@gardener/post/12",
      },
    ],
    total: 2,
    ...overrides,
  };
}
