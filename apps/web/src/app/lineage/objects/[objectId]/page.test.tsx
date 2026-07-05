import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getPublicObjectPassportPage: vi.fn(),
  getPublicLineageGraphPage: vi.fn(),
  getEngagementSummary: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/public-object-passport-repository", () => ({
  getPublicObjectPassportPage: mocks.getPublicObjectPassportPage,
}));

vi.mock("@/server/public-lineage-repository", () => ({
  getPublicLineageGraphPage: mocks.getPublicLineageGraphPage,
}));

vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: mocks.getEngagementSummary,
}));

const objectId = "00000000-0000-4000-8000-000000000101";
const sourceObjectId = "00000000-0000-4000-8000-000000000102";

const objectPassportPage = {
  object: {
    plantObjectId: objectId,
    displayName: "Balcony tomato",
    objectKind: "plant",
    varietyText: "Red Cherry",
    varietyState: "selected",
    catalogKind: "plant_variety",
    catalogCanonicalName: "Red Cherry tomato",
    catalogPublicSlug: "red-cherry-tomato-0000000101",
    catalogPath: "/variety/red-cherry-tomato-0000000101",
    safeLocationLabel: "Region: Ukraine - Kyiv City",
    publicEntryCount: 2,
    firstEntryDate: new Date("2026-07-01T12:00:00.000Z"),
    latestEntryDate: new Date("2026-07-04T12:00:00.000Z"),
  },
  author: {
    handle: "green_thumb",
    mention: "@green_thumb",
    displayName: "Green Thumb",
    avatarUrl: null,
    profilePath: "/@green_thumb",
  },
  journalPreview: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      title: "First flowering",
      bodyPreview: "Two new flower clusters opened after the balcony warmed.",
      entryDate: new Date("2026-07-04T12:00:00.000Z"),
      publicSlug: "first-flowering",
      publicPath: "/journal/first-flowering",
      mediaPublicUrl:
        "https://media.over.garden/derivatives/first-flowering.webp",
    },
  ],
  coverMediaPublicUrl:
    "https://media.over.garden/derivatives/first-flowering.webp",
};

const lineageGraphPage = {
  root: {
    plantObjectId: objectId,
    displayName: "Balcony tomato",
    objectKind: "plant",
    varietyText: "Red Cherry",
    varietyState: "selected",
    catalogKind: "plant_variety",
    catalogCanonicalName: "Red Cherry tomato",
    catalogPublicSlug: "red-cherry-tomato-0000000101",
    safeLocationLabel: "Region: Ukraine - Kyiv City",
  },
  nodes: [
    {
      plantObjectId: objectId,
      displayName: "Balcony tomato",
      objectKind: "plant",
      varietyText: "Red Cherry",
      varietyState: "selected",
      catalogKind: "plant_variety",
      catalogCanonicalName: "Red Cherry tomato",
      catalogPublicSlug: "red-cherry-tomato-0000000101",
      safeLocationLabel: "Region: Ukraine - Kyiv City",
    },
    {
      plantObjectId: sourceObjectId,
      displayName: "Seed mother",
      objectKind: "plant",
      varietyText: "Red Cherry",
      varietyState: "selected",
      catalogKind: "plant_variety",
      catalogCanonicalName: "Red Cherry tomato",
      catalogPublicSlug: "red-cherry-tomato-0000000101",
      safeLocationLabel: null,
    },
  ],
  edges: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      depth: 1,
      subjectPlantObjectId: objectId,
      sourcePlantObjectId: sourceObjectId,
      createdAt: new Date("2026-07-03T19:00:00.000Z"),
    },
  ],
  depthLimit: 5,
};

describe("/lineage/objects/[objectId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getSessionId.mockReturnValue(null);
    mocks.getEngagementSummary.mockResolvedValue({
      target: {
        kind: "lineage_object",
        ref: objectId,
      },
      activeLikeCount: 0,
      comments: [],
    });
    mocks.getPublicObjectPassportPage.mockResolvedValue(objectPassportPage);
    mocks.getPublicLineageGraphPage.mockResolvedValue(lineageGraphPage);
  });

  it("marks the object passport metadata noindex through the public surface policy", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ objectId }),
    });

    expect(metadata.title).toBe(
      "Balcony tomato living object | OverGarden",
    );
    expect(metadata.alternates?.canonical).toBe(`/lineage/objects/${objectId}`);
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("renders the public-safe passport, journal preview, and lineage without internal payload fields", async () => {
    const { default: PublicLineageObjectRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ objectId }),
      }),
    );

    expect(mocks.getPublicObjectPassportPage).toHaveBeenCalledWith(objectId);
    expect(mocks.getPublicLineageGraphPage).toHaveBeenCalledWith(objectId);
    expect(html).toContain("Public living-object passport");
    expect(html).toContain("Public journal");
    expect(html).toContain("Recent public journal");
    expect(html).toContain("Logbook preview");
    expect(html).toContain("Related public context");
    expect(html).toContain("Confirmed provenance");
    expect(html).toContain("/api/engagement/likes");
    expect(html).toContain("/api/engagement/bookmarks");
    expect(html).toContain("/api/engagement/comments");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("Seed mother");
    expect(html).toContain("First flowering");
    expect(html).toContain("Two new flower clusters opened");
    expect(html).toContain("Green Thumb");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Red Cherry");
    expect(html).toContain("Region: Ukraine - Kyiv City");
    expect(html).toContain("/journal/first-flowering");
    expect(html).toContain("/variety/red-cherry-tomato-0000000101");
    expect(html).toContain("/garden?source=public-object");
    expect(html).toContain(
      "https://media.over.garden/derivatives/first-flowering.webp",
    );
    expect(html).not.toMatch(
      /quarantine_key|quarantine|derivative_key|media key|ip_address|ipaddress|user_agent|useragent|user-agent|email|phone|coarse_region|location_visibility|coordinates|latitude|longitude|@private|draft|clientMutation|owner_user_id|source_reference_label|source_pending_identity_id/i,
    );
  });

  it("keeps missing object passport pages noindex", async () => {
    mocks.getPublicObjectPassportPage.mockResolvedValue(null);

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ objectId }),
    });

    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
