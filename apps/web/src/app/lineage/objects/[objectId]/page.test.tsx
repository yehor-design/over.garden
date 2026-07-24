import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getPublicObjectPassportPage: vi.fn(),
  getPublicLineageGraphPage: vi.fn(),
  getEngagementSummary: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  resolvePilotWriteAccess: vi.fn(),
  listLineageInteractionTargets: vi.fn(),
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

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/pilot-write-access", () => ({
  resolvePilotWriteAccess: mocks.resolvePilotWriteAccess,
}));

vi.mock("@/server/lineage-interactions-repository", () => ({
  listLineageInteractionTargets: mocks.listLineageInteractionTargets,
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
      mediaFocalX: 0.5,
      mediaFocalY: 0.5,
      mediaIntrinsicWidth: 1200,
      mediaIntrinsicHeight: 900,
    },
  ],
  journalContinuation: [
    {
      id: "00000000-0000-4000-8000-000000000302",
      title: "Sixth public update",
      bodyPreview: "A real page-size overflow record.",
      entryDate: new Date("2026-07-01T12:00:00.000Z"),
      publicSlug: "sixth-public-update",
      publicPath: "/journal/sixth-public-update",
      mediaPublicUrl: null,
      mediaFocalX: null,
      mediaFocalY: null,
      mediaIntrinsicWidth: null,
      mediaIntrinsicHeight: null,
    },
  ],
  coverMediaPublicUrl:
    "https://media.over.garden/derivatives/first-flowering.webp",
  coverMediaFocalX: 0.5,
  coverMediaFocalY: 0.5,
  coverMediaIntrinsicWidth: 1200,
  coverMediaIntrinsicHeight: 900,
  galleryMedia: [
    {
      publicUrl: "https://media.over.garden/derivatives/first-flowering.webp",
      focalX: 0.5,
      focalY: 0.5,
      intrinsicWidth: 1200,
      intrinsicHeight: 900,
    },
  ],
  galleryMediaPublicUrls: [
    "https://media.over.garden/derivatives/first-flowering.webp",
  ],
  timelineHasMore: false,
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
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.resolvePilotWriteAccess.mockResolvedValue({ canWrite: true, invited: false, actorClass: "real_self_serve" });
    mocks.listLineageInteractionTargets.mockResolvedValue([
      {
        edgeId: lineageGraphPage.edges[0].id,
        targetPlantObjectId: sourceObjectId,
      },
    ]);
  });

  it("marks the object passport metadata noindex through the public surface policy", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ objectId }),
    });

    expect(metadata.title).toBe("Balcony tomato · жив обект | OverGarden");
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
    expect(html).toContain("Публичен паспорт");
    expect(html).toContain("Публичен дневник на обекта");
    expect(html).toContain("Хронология");
    expect(html).toContain("Прочетете последния запис");
    expect(html).toContain("Потвърден произход");
    expect(html).toContain("/api/engagement/likes");
    expect(html).toContain("/auth/intent/start");
    expect(html).toContain('name="action" value="bookmark"');
    expect(html).toContain('name="action" value="comment"');
    expect(html).toContain('name="action" value="follow"');
    expect(html).not.toContain("/api/engagement/bookmarks");
    expect(html).not.toContain("/api/engagement/comments");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("Seed mother");
    expect(html).toContain("First flowering");
    expect(html).toContain("Sixth public update");
    expect(html).toContain("Two new flower clusters opened");
    expect(html).toContain("Green Thumb");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Red Cherry");
    expect(html).toContain("Регион: Ukraine - Kyiv City");
    expect(html).toContain("/journal/first-flowering");
    expect(html).toContain("/variety/red-cherry-tomato-0000000101");
    expect(html).not.toContain("/garden?source=public-object");
    expect(html).not.toContain('href="/">OverGarden</a>');
    expect(html).toContain(
      "https://media.over.garden/derivatives/first-flowering.webp",
    );
    expect(html).not.toMatch(
      /quarantine_key|quarantine|derivative_key|media key|ip_address|ipaddress|user_agent|useragent|user-agent|email|phone|coarse_region|location_visibility|coordinates|latitude|longitude|@private|draft|clientMutation|owner_user_id|source_reference_label|source_pending_identity_id/i,
    );
  });

  it("keeps signed-in follow and engagement mutations on their canonical authorization boundaries", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    const followControl = createAuthIntentControlRef(
      "follow",
      `${lineageGraphPage.edges[0].id}:${sourceObjectId}`,
    );
    const { default: PublicLineageObjectRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ objectId }),
        searchParams: Promise.resolve({
          authIntent: "follow",
          authControl: followControl,
        }),
      }),
    );

    expect(html).toContain("/api/engagement/bookmarks");
    expect(html).toContain("/api/engagement/comments");
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).toContain('data-auth-intent-resumed="follow"');
    expect(html).toContain(`data-auth-intent-control-ref="${followControl}"`);
    expect(html).toContain(`id="lineage-follow-${followControl}"`);
    expect(html).not.toContain('id="lineage-follow"');
    expect(html).toContain("autofocus");
    expect(mocks.resolvePilotWriteAccess).toHaveBeenCalled();
    expect(mocks.listLineageInteractionTargets).toHaveBeenCalled();
  });

  it("focuses a bounded status when resumed follow permission is no longer available", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.resolvePilotWriteAccess.mockResolvedValue({ canWrite: false, invited: false, actorClass: "real_self_serve" });
    const followControl = createAuthIntentControlRef(
      "follow",
      `${lineageGraphPage.edges[0].id}:${sourceObjectId}`,
    );
    const { default: PublicLineageObjectRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ objectId }),
        searchParams: Promise.resolve({
          authIntent: "follow",
          authControl: followControl,
        }),
      }),
    );

    expect(html).toContain(
      "За да следите този произход, е необходим активен достъп за записване.",
    );
    expect(html).toContain(
      `id="lineage-follow-${followControl}" role="status" tabindex="-1" data-auth-intent-control="follow" data-auth-intent-control-ref="${followControl}"`,
    );
    expect(html).not.toContain("Follow updates</button>");
    expect(mocks.listLineageInteractionTargets).not.toHaveBeenCalled();
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

  it("localizes passport chrome and metadata without translating the public object", async () => {
    const { default: PublicLineageObjectRoute, generateMetadata } =
      await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ objectId }),
    });
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ objectId }),
      }),
    );

    expect(metadata.title).toBe("Balcony tomato · жив обект | OverGarden");
    expect(html).toContain("Публичен паспорт");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("First flowering");
  });
});
