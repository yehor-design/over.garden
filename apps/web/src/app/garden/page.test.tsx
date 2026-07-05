import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  resolvePilotWriteAccess: vi.fn(),
  ensureUserPublicProfile: vi.fn(),
  listMyPlantObjects: vi.fn(),
  listMySpaceJournalTimelines: vi.fn(),
  listMyRecentJournalEntries: vi.fn(),
  findSelectableCatalogItemByPublicSlug: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
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

vi.mock("@/server/public-profile-repository", () => ({
  ensureUserPublicProfile: mocks.ensureUserPublicProfile,
}));

vi.mock("@/server/journal-repository", () => ({
  listMyPlantObjects: mocks.listMyPlantObjects,
  listMySpaceJournalTimelines: mocks.listMySpaceJournalTimelines,
  listMyRecentJournalEntries: mocks.listMyRecentJournalEntries,
}));

vi.mock("@/server/catalog-repository", () => ({
  findSelectableCatalogItemByPublicSlug:
    mocks.findSelectableCatalogItemByPublicSlug,
}));

vi.mock("@/server/analytics-events", () => ({
  recordAnalyticsEventSafely: mocks.recordAnalyticsEventSafely,
}));

vi.mock("@/lib/auth/facebook-oauth", () => ({
  isFacebookSignInEnabled: () => false,
}));

vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: () => false,
}));

vi.mock("@/lib/auth/social-oauth", () => ({
  oauthErrorRecoveryMessage: () => null,
}));

vi.mock("../wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction: vi.fn(),
}));

vi.mock("./actions", () => ({
  createSpaceJournalEntryAction: vi.fn(),
}));

vi.mock("./draft-resume-panel", () => ({
  GardenDraftResumePanel: () => <section>Draft resume panel</section>,
}));

vi.mock("./first-entry-composer", () => ({
  FirstEntryComposer: () => <form>First entry composer</form>,
}));

vi.mock("./garden-auth-panel", () => ({
  GardenAuthPanel: () => <section>Garden auth panel</section>,
  SocialAccountLinkPanel: () => <section>Social account link panel</section>,
}));

describe("/garden workspace", () => {
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
    mocks.scopedToUser.mockReturnValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.resolvePilotWriteAccess.mockResolvedValue({ invited: true });
    mocks.ensureUserPublicProfile.mockResolvedValue({
      user_id: "00000000-0000-4000-8000-000000000001",
      handle: "green_thumb",
    });
    mocks.findSelectableCatalogItemByPublicSlug.mockResolvedValue(null);
    mocks.recordAnalyticsEventSafely.mockResolvedValue(undefined);
    mocks.listMyPlantObjects.mockResolvedValue([workspaceObject()]);
    mocks.listMySpaceJournalTimelines.mockResolvedValue([spaceTimeline()]);
    mocks.listMyRecentJournalEntries.mockResolvedValue([recentEntry()]);
  });

  it("renders a repeat-use workspace for a returning gardener", async () => {
    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(mocks.listMyPlantObjects).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      20,
    );
    expect(mocks.listMyRecentJournalEntries).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      8,
    );
    expect(html).toContain("Garden workspace");
    expect(html).toContain("Update Cherry tomato");
    expect(html).toContain("Living objects");
    expect(html).toContain("Cherry tomato");
    expect(html).toContain("3 entries");
    expect(html).toContain("1 public · 2 private");
    expect(html).toContain("Needs current note");
    expect(html).toContain("Add update/photo");
    expect(html).toContain("Recent activity");
    expect(html).toContain("Flowering changed");
    expect(html).toContain("Object note · Public page");
    expect(html).toContain("Draft resume panel");
    expect(html).toContain("First entry composer");
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine|latitude|longitude/i,
    );
  });

  it("pushes an empty signed-in workspace toward the first object path", async () => {
    mocks.listMyPlantObjects.mockResolvedValueOnce([]);
    mocks.listMySpaceJournalTimelines.mockResolvedValueOnce([]);
    mocks.listMyRecentJournalEntries.mockResolvedValueOnce([]);
    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Start with one living object");
    expect(html).toContain("No living objects yet");
    expect(html).toContain("Start first object");
    expect(html).toContain("First living object");
    expect(html).toContain("No dated activity yet");
    expect(html).toContain("First entry composer");
    expect(html).not.toContain("Space journals");
  });

  it("keeps signed-out visitors behind the garden auth panel", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: GardenPage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Garden auth panel");
    expect(mocks.listMyPlantObjects).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
  });
});

function workspaceObject() {
  return {
    id: "object-1",
    displayName: "Cherry tomato",
    objectKind: "plant",
    spaceDisplayName: "Balcony",
    catalogItemId: null,
    catalogKind: "plant_variety",
    varietyText: "Cherry tomato",
    varietyState: "selected",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    entryCount: 3,
    publicEntryCount: 1,
    privateEntryCount: 2,
    latestEntryDate: new Date("2020-06-01T00:00:00.000Z"),
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
    entries: [],
  };
}

function recentEntry() {
  return {
    id: "entry-1",
    owner_user_id: "00000000-0000-4000-8000-000000000001",
    space_id: "space-1",
    plant_object_id: "object-1",
    title: "Flowering changed",
    body: "Flowers opened on the east side.",
    entry_scope: "object",
    entry_date: new Date("2026-07-04T00:00:00.000Z"),
    visibility: "public",
    lifecycle_state: "active",
    public_slug: "flowering-changed",
    public_noindex: true,
    published_at: new Date("2026-07-04T08:00:00.000Z"),
    archived_at: null,
    public_gone_at: null,
    first_publication_disclosure_version: "2026-07-01",
    first_publication_disclosed_at: new Date("2026-07-04T08:00:00.000Z"),
    client_mutation_id: "mutation-private-test",
    created_at: new Date("2026-07-04T08:00:00.000Z"),
    updated_at: new Date("2026-07-04T08:00:00.000Z"),
  };
}
