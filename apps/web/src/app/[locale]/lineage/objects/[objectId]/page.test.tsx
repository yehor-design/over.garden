import type { PublicLineageGraphPage } from "@/server/public-lineage-repository";
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

vi.mock("@/server/lineage-interactions-repository", () => ({
  listLineageInteractionTargets: mocks.listLineageInteractionTargets,
}));
vi.mock("./actions", () => ({
  askLineageQuestionAction: vi.fn(),
  followLineageNodeAction: vi.fn(),
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
    catalogSpeciesSlug: null,
    catalogPath: "/variety/red-cherry-tomato-0000000101",
    safeRegionCode: "UA-30",
    publicEntryCount: 2,
    firstEntryDate: new Date("2026-07-01T12:00:00.000Z"),
    latestEntryDate: new Date("2026-07-04T12:00:00.000Z"),
    publicPath: "/@green_thumb/objects/balcony-tomato",
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

const lineageGraphPage: PublicLineageGraphPage = {
  root: {
    plantObjectId: objectId,
    displayName: "Balcony tomato",
    objectKind: "plant",
    varietyText: "Red Cherry",
    varietyState: "selected",
    catalogKind: "plant_variety",
    catalogCanonicalName: "Red Cherry tomato",
    catalogPublicSlug: "red-cherry-tomato-0000000101",
    catalogSpeciesSlug: null,
    safeRegionCode: "UA-30",
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
      catalogSpeciesSlug: null,
      safeRegionCode: "UA-30",
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
      catalogSpeciesSlug: null,
      safeRegionCode: null,
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
    vi.stubEnv("DATABASE_URL", "postgres://test@127.0.0.1/test");
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
    // The passport now takes its locale from the address rather than from the
    // reader's cookie, so every case below passes `locale: "bg"` in `params`.
    // The mock stays because the engagement panel still reads it.
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.listLineageInteractionTargets.mockResolvedValue([
      {
        edgeId: lineageGraphPage.edges[0].id,
        targetPlantObjectId: sourceObjectId,
      },
    ]);
  });

  it("indexes a thin object passport with its canonical path", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "bg", objectId }),
    });

    expect(metadata.title).toBe("Balcony tomato · жив обект | OverGarden");
    // One address, under the author and with no locale prefix (ADR-0029 D9,
    // D10), and no `hreflang` (OVE-423): a passport is never translated. The
    // canonical used to name `/bg/lineage/objects/{uuid}` — a path that 308s —
    // and a canonical that redirects is a signal a crawler discards.
    expect(metadata.alternates).toMatchObject({
      canonical: "https://over.garden/@green_thumb/objects/balcony-tomato",
    });
    expect(metadata.alternates?.languages).toBeUndefined();
    expect(metadata.robots).toEqual({
      index: true,
      follow: true,
    });
  });

  it("names the same canonical from every route family", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk", objectId }),
    });

    expect(metadata.alternates).toMatchObject({
      canonical: "https://over.garden/@green_thumb/objects/balcony-tomato",
    });
  });

  it("renders the public-safe passport, journal preview, and lineage without internal payload fields", async () => {
    const { default: PublicLineageObjectRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ locale: "bg", objectId }),
      }),
    );

    expect(mocks.getPublicObjectPassportPage).toHaveBeenCalledWith(
      objectId,
      undefined,
      "bg",
    );
    expect(mocks.getPublicLineageGraphPage).toHaveBeenCalledWith(objectId);
    expect(html).toContain("Публичен паспорт");
    expect(html).toContain("Публичен дневник на обекта");
    expect(html).toContain("Хронология");
    expect(html).toContain("Прочетете последния запис");
    // The link as a sentence with both names, this page's object marked,
    // and what "confirmed" means: the two gardeners' word (`OVE-495`).
    expect(html).toContain("„Balcony tomato“ произхожда от „Seed mother“");
    expect(html).toContain("(този обект)");
    expect(html).toContain("Двамата градинари го потвърдиха");
    expect(html).toContain("не генетичен анализ");
    // A guest may like without an account; bookmark, comment and follow still
    // route through the auth intent (hybrid ownership, 2026-09-04).
    expect(html).toContain("Харесвам");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("/auth/intent/start");
    expect(html).toContain('name="action" value="bookmark"');
    expect(html).toContain('name="action" value="comment"');
    expect(html).toContain('name="action" value="follow"');
    expect(html).not.toContain("/api/engagement");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("Seed mother");
    expect(html).toContain("First flowering");
    expect(html).toContain("Sixth public update");
    expect(html).toContain("Two new flower clusters opened");
    expect(html).toContain("Green Thumb");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Red Cherry");
    // In the reader's language, the region's name as well as the word.
    expect(html).toContain("Регион: Украйна — град Киев");
    expect(html).not.toContain("Ukraine - Kyiv City");
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

  it("builds the provenance list out of the design system, and names its region", async () => {
    const { default: PublicLineageObjectRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ locale: "uk", objectId }),
      }),
    );

    // A `<section>` earns the `region` role only when it is named, and the
    // rail links straight to this one (DESIGN.md §4.2.1).
    expect(html).toContain('id="passport-provenance"');
    expect(html).toMatch(
      /id="passport-provenance"[^>]*aria-labelledby="passport-provenance-heading"/u,
    );
    // Every card is the system's `Card`, every qualifier the system's `Badge`,
    // and the catalog entry is a link because a badge is never a control.
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="badge"');
    expect(html).toContain('data-slot="link"');
    // An edge's date is machine-readable, not only printed.
    expect(html).toMatch(/<time dateTime="20\d\d-/u);
    // Nothing in the passport reaches for the pre-redesign palette any more.
    // The slice stops at the engagement panel, which is the comment surface
    // `OVE-453` rebuilds — this task does not get to claim that page family.
    const passport = html.slice(0, html.indexOf('id="comments"'));
    expect(passport).not.toContain("text-muted-foreground");
    expect(passport).not.toContain("bg-muted");
    expect(passport).not.toContain("text-foreground");
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
    const { ViewerLineageInteraction, PassportViewerEngagement } =
      await import("./passport-regions");
    const searchParams = Promise.resolve({
      authIntent: "follow",
      authControl: followControl,
    });
    const nodesById = new Map(
      lineageGraphPage.nodes.map((node) => [node.plantObjectId, node]),
    );
    const html = renderToStaticMarkup(
      <>
        {await ViewerLineageInteraction({
          edge: lineageGraphPage.edges[0],
          edges: lineageGraphPage.edges,
          nodesById,
          target: nodesById.get(sourceObjectId)!,
          rootPlantObjectId: objectId,
          rootPublicPath: objectPassportPage.object.publicPath,
          locale: "bg",
          searchParams,
        })}
        {await PassportViewerEngagement({
          locale: "bg",
          target: { kind: "lineage_object", ref: objectId },
          returnTo: objectPassportPage.object.publicPath,
          searchParams,
        })}
      </>,
    );

    expect(html).toContain("Запази");
    expect(html).toContain('name="body"');
    expect(html).not.toContain("/api/engagement");
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).toContain('data-auth-intent-resumed="follow"');
    expect(html).toContain(`data-auth-intent-control-ref="${followControl}"`);
    expect(html).toContain(`id="lineage-follow-${followControl}"`);
    expect(html).not.toContain('id="lineage-follow"');
    expect(html).toContain("autofocus");
    expect(mocks.listLineageInteractionTargets).toHaveBeenCalled();
  });

  it("keeps missing object passport pages noindex", async () => {
    mocks.getPublicObjectPassportPage.mockResolvedValue(null);

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "bg", objectId }),
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
      params: Promise.resolve({ locale: "bg", objectId }),
    });
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ locale: "bg", objectId }),
      }),
    );

    expect(metadata.title).toBe("Balcony tomato · жив обект | OverGarden");
    expect(html).toContain("Публичен паспорт");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("First flowering");
  });
});
