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

vi.mock("./catalog-resolve-control", () => ({
  CatalogResolveControl: () => <section>Catalog resolve</section>,
}));

vi.mock("./follow-up-entry-composer", () => ({
  FollowUpEntryComposer: () => <form>Follow-up composer</form>,
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
    mocks.scopedToUser.mockReturnValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.resolvePilotWriteAccess.mockResolvedValue({ invited: true });
    mocks.getObjectProvenancePanel.mockResolvedValue({
      sourceObjectOptions: [],
      edges: [],
    });
    mocks.resolveFollowUpValuePulsePrompt.mockResolvedValue({
      eligible: false,
    });
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
    expect(html).toContain("Journal entries");
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
    expect(html).toContain("Journal entries");
    expect(html).toContain("Second flowering wave");
    expect(html).toContain("First flowers");
    expect(html).not.toMatch(/leaderboard|streak|likes|followers|share modal/i);
  });
});

function plantObjectPage(
  entries: Array<{
    id: string;
    title: string;
    body: string;
    entryDate: string;
  }>,
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
      variety_text: "Cherry tomato",
      variety_state: "selected",
      location_visibility: "hidden",
      coarse_region_code: null,
      source_credit: null,
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      entry_date: entry.entryDate,
      entry_scope: "object",
      visibility: "private",
      lifecycle_state: "active",
      public_slug: null,
      public_gone_at: null,
      timelineRelation: "direct_object",
      mentionedObjects: [],
      media: null,
    })),
  };
}
