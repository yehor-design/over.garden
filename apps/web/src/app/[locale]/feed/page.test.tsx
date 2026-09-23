import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listFollowedFeedPage: vi.fn(),
  readPublicFeedPage: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/social-return-repository", () => ({
  listFollowedFeedPage: mocks.listFollowedFeedPage,
}));

vi.mock("@/server/public-cache", () => ({
  readPublicFeedPage: mocks.readPublicFeedPage,
}));

const publicEntry = {
  id: "entry-public",
  title: "Ранкове спостереження",
  excerpt: "Новий приріст рівний, листя без плям.",
  sourceLanguage: "uk" as const,
  entryDate: "2026-07-10",
  publishedAt: "2026-07-10T12:00:00.000Z",
  publicPath: "/@demo_olena/morning-check",
  object: {
    id: "object-1",
    displayName: "Томат Черрі",
    kind: "plant" as const,
    publicPath: "/@demo_olena/objects/tomato",
    safeRegionCode: null,
  },
  author: {
    handle: "demo_olena",
    displayName: "Олена",
    avatarUrl: null,
    profilePath: "/@demo_olena",
  },
  media: [],
  topics: [],
};

describe("/{locale}/feed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.readPublicFeedPage.mockResolvedValue({
      entries: [publicEntry],
      nextCursor: null,
    });
    mocks.listFollowedFeedPage.mockResolvedValue({
      items: [
        {
          key: "feed:safe",
          href: "/@green_thumb/public-story",
          title: "First ripe cluster",
          excerpt: "A bounded public excerpt.",
          author: {
            handle: "green_thumb",
            label: "@green_thumb",
            href: "/@green_thumb",
          },
          object: {
            id: "opaque-object",
            displayName: "Balcony tomato",
            kind: "plant",
            catalogKind: "plant_variety",
            varietyText: "Red Cherry",
            href: "/@green_thumb/objects/public-object",
          },
          entryDate: "2026-07-04",
          publishedAt: "2026-07-04T08:00:00.000Z",
          reasons: ["people", "objects"],
          mediaUrl: null,
        },
      ],
      nextCursor: "safe-cursor",
    });
  });

  it("keeps followed feed metadata private without discovery admission", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Стрічка підписок | OverGarden",
      description:
        "Нові публічні записи від людей, об'єктів і тем, за якими ви стежите.",
      robots: {
        index: false,
        follow: false,
      },
    });
  });

  it("shows a signed-out reader the real feed behind one callout", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    // Criterion 6: the `signed-out` state is the real page with one `Callout`
    // over it, not a bare card where a feed should be. A reader who arrives
    // from a shared link used to see nothing at all.
    expect(html).toContain('data-screen-state="signed-out"');
    expect(html).toContain('data-slot="callout"');
    expect(html).toContain("Нижче — публічна стрічка OverGarden.");
    expect(html).toContain("Увійдіть, щоб відкрити стрічку підписок.");
    expect(html).toContain("Ранкове спостереження");
    expect(html).toContain('href="/@demo_olena/morning-check"');
    expect(html).toContain('href="/auth/sign-in?next=%2Ffeed"');
    // Exactly one way in, not a second panel further down.
    expect(html.match(/data-slot="callout"/g)).toHaveLength(1);
    expect(mocks.listFollowedFeedPage).not.toHaveBeenCalled();
  });

  it("degrades to the designed empty state if the public read fails", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.readPublicFeedPage.mockRejectedValueOnce(new Error("db down"));

    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    // The callout is still the way in, and a failed public read never takes
    // the page down (ADR-0023).
    expect(html).toContain('data-slot="callout"');
    expect(html).toContain("Тут поки немає публічних записів");
  });

  it("renders followed stories as entry cards without raw ids", async () => {
    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listFollowedFeedPage).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      expect.objectContaining({
        source: "all",
        objectKind: "all",
        locale: "uk",
      }),
    );
    expect(html).toContain("Стрічка підписок");
    expect(html).toContain("/@green_thumb/public-story");
    expect(html).toContain("First ripe cluster");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Red Cherry");
    // Each item is an `<article>` a reader can be told the name of.
    expect(html).toContain('aria-labelledby="entry-card-feed:safe-title"');
    expect(html).not.toMatch(
      /00000000-0000|session-1|journal body|private journal|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token|source_reference_label/i,
    );
  });

  // OVE-492: the same discovery bar as the home feed — Latest and Following
  // as modes, this feed's facets behind one button, a GET form underneath.
  it("filters through the shared bar and works without JavaScript", async () => {
    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ source: "people", kind: "plant" }),
      }),
    );

    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Останні<\/a>/u);
    expect(html).toMatch(
      /aria-current="page"[^>]*>Підписки<\/a>|<a[^>]*href="\/feed"[^>]*aria-current="page"/u,
    );
    expect(html).toContain('method="get"');
    expect(html).toContain('data-filter-bar-facet="source"');
    expect(html).toContain('data-filter-bar-facet="kind"');
    // The committed filters ride along as hidden fields, and each chip
    // removes itself by a real link.
    expect(html).toContain('type="hidden" name="kind" value="plant"');
    expect(html).toContain('type="hidden" name="source" value="people"');
    expect(html).toContain('href="/feed?kind=plant"');
    expect(html).toContain('href="/feed?source=people"');
    expect(html).not.toContain("aria-pressed");
  });

  it("gives a guest the two modes and no facets of a feed they do not have", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(html).toContain('data-screen-state="signed-out"');
    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).not.toContain("data-filter-bar-facet=");
  });

  it("shows the designed first-run state when nothing is followed", async () => {
    mocks.listFollowedFeedPage.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });

    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(html).toContain('data-screen-state="empty-first-run"');
    expect(html).toContain("/illustrations/empty-journal.webp");
    expect(html).toContain("Стрічка підписок поки порожня");
    expect(html).toContain('href="/journals"');
  });

  it("loads the first card eagerly and the rest lazily", async () => {
    mocks.listFollowedFeedPage.mockResolvedValueOnce({
      items: Array.from({ length: 4 }, (_, index) => ({
        key: `feed:${index}`,
        href: `/@green_thumb/public-story-${index}`,
        title: `Public story ${index}`,
        excerpt: "A bounded public excerpt.",
        author: {
          handle: "green_thumb",
          label: "@green_thumb",
          href: "/@green_thumb",
        },
        object: {
          id: `opaque-object-${index}`,
          displayName: "Balcony tomato",
          kind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          href: `/@green_thumb/objects/public-object-${index}`,
        },
        entryDate: "2026-07-04",
        publishedAt: "2026-07-04T08:00:00.000Z",
        reasons: ["people", "objects"],
        mediaUrl: `https://media.over.garden/feed-${index}.webp`,
      })),
      nextCursor: null,
    });

    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    // One eager cover at the top of a 704 px single column, not three: the
    // second card is already below the fold on every width this page has.
    expect(html.match(/loading="eager"/g)).toHaveLength(1);
    expect(html.match(/loading="lazy"/g)).toHaveLength(3);
  });
});
