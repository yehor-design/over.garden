import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRootLocaleRedirectPath,
  selectPublicLocaleFromAcceptLanguage,
  selectPublicLocaleFromRequestContext,
} from "@/lib/public-localization";
import type { PublicFeedPage } from "@/server/public-feed-repository";
import HomeRoute, { generateMetadata } from "./[locale]/page";

const mocks = vi.hoisted(() => ({
  getSiteShellSessionState: vi.fn(),
  listPublicFeedPage: vi.fn(),
  listTrustedPublicFeedTopics: vi.fn(),
}));

vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));

vi.mock("@/server/public-feed-repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/public-feed-repository")>();

  return {
    ...actual,
    listPublicFeedPage: mocks.listPublicFeedPage,
    listTrustedPublicFeedTopics: mocks.listTrustedPublicFeedTopics,
  };
});

const feedPage: PublicFeedPage = {
  entries: [
    {
      id: "entry-1",
      title: "Ранкове спостереження",
      excerpt: "Новий приріст рівний, листя без плям.",
      entryDate: "2026-07-10",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publicPath: "/journal/morning-check",
      object: {
        id: "object-1",
        displayName: "Томат Черрі",
        kind: "plant",
        publicPath: "/lineage/objects/object-1",
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
    },
  ],
  nextCursor: null,
};

describe("/", () => {
  beforeEach(() => {
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
    });
    mocks.listPublicFeedPage.mockResolvedValue(feedPage);
    mocks.listTrustedPublicFeedTopics.mockResolvedValue([
      { slug: "winter-care", label: "Зимовий догляд", entryCount: 1 },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Accept-Language advisory and requires a market signal for root routing", () => {
    expect(
      selectPublicLocaleFromAcceptLanguage("bg-BG,bg;q=0.9,uk;q=0.4"),
    ).toBe("bg");
    expect(selectPublicLocaleFromAcceptLanguage("ru;q=0.9,uk;q=0.8")).toBe(
      "ru",
    );
    expect(selectPublicLocaleFromAcceptLanguage("en-US,en;q=0.9")).toBe("uk");
    expect(getRootLocaleRedirectPath("bg-BG,bg;q=0.9")).toBe("/");
    expect(getRootLocaleRedirectPath("ru;q=0.9,uk;q=0.8", "UA")).toBe("/");
    expect(getRootLocaleRedirectPath("ru;q=0.9,uk;q=0.8", "BG")).toBe("/bg");
    expect(
      selectPublicLocaleFromRequestContext({
        acceptLanguage: "ru;q=0.9",
        countryCode: "UA",
      }),
    ).toBe("uk");
  });

  it("renders the Ukrainian read-first feed without admitting an unresolved projection", async () => {
    const html = renderToStaticMarkup(
      await HomeRoute({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({}),
      }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
    expect(html).toContain('lang="uk"');
    expect(html).toContain(">Стрічка</h1>");
    expect(html).toContain("Ранкове спостереження");
    expect(html).toContain('href="/journal/morning-check"');
    expect(html).not.toContain("Ведіть живу історію");
    expect(html).not.toContain("Почати перший запис");
    expect(html).not.toContain('aria-label="Language switcher"');
    expect(html).not.toContain("/join?");
    expect(html).not.toContain("/admin");
  });

  it("passes explicit filters to the repository and localizes Bulgarian paths", async () => {
    const html = renderToStaticMarkup(
      await HomeRoute({
        params: Promise.resolve({ locale: "bg" }),
        searchParams: Promise.resolve({
          cursor: "invalid-cursor",
          kind: "animal",
          topic: "winter-care",
        }),
      }),
    );

    expect(mocks.listPublicFeedPage).toHaveBeenCalledWith(
      {
        cursor: null,
        kind: "animal",
        topic: "winter-care",
      },
      "bg",
    );
    expect(html).toContain('lang="bg"');
    expect(html).toContain(">Поток</h1>");
    expect(html).toContain('href="/bg?kind=animal&amp;topic=winter-care"');
    expect(html).not.toContain('href="/bg/feed"');
    expect(html).not.toContain('aria-label="Смяна на езика"');
  });

  it("reveals the followed destination only for an authenticated session", async () => {
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: true,
    });

    const html = renderToStaticMarkup(
      await HomeRoute({
        params: Promise.resolve({ locale: "ru" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain(">Лента</h1>");
    expect(html).toContain('href="/ru/feed"');
  });

  it("renders a recoverable localized feed error instead of an auth wall", async () => {
    mocks.listPublicFeedPage.mockRejectedValue(
      new Error("database unavailable"),
    );

    const html = renderToStaticMarkup(
      await HomeRoute({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ kind: "animal" }),
      }),
    );

    expect(html).toContain("Стрічку не вдалося завантажити");
    expect(html).toContain('href="/?kind=animal"');
    expect(html).not.toMatch(/href="[^"]*(?:sign.?up|register|join)/i);
  });
});
